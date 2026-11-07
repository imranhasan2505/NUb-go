const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const path = require('path');

require('dotenv').config({
  path: path.join(__dirname, '..', '.env')
});

const { db } = require('./db');
const app = express();

const PORT = Number(process.env.PORT || 3000);
const JWT_SECRET = process.env.JWT_SECRET || 'development-only-secret';

if (process.env.NODE_ENV === 'production' && JWT_SECRET.length < 32) {
  throw new Error('Set a strong JWT_SECRET (at least 32 characters) in the root .env before production.');
}

const MIN_PARTNERS = 1;
const MAX_PARTNERS = 3;
const UNIVERSITY = 'Northern University Bangladesh';

// ======================================
// MIDDLEWARE
// ======================================

app.use(helmet({ contentSecurityPolicy: false }));
app.use(cors());
app.use(express.json({ limit: '6mb' }));
app.use(express.static(path.resolve(__dirname, '../..')));

// ======================================
// AUTHENTICATION & HELPERS
// ======================================

const signToken = user =>
  jwt.sign(
    { id: user.id, studentId: user.student_id, role: user.role || 'student' },
    JWT_SECRET,
    { expiresIn: '8h' }
  );

async function auth(req, res, next) {
  const header = req.headers.authorization || '';
  const token = header.startsWith('Bearer ') ? header.slice(7) : '';

  if (!token) return res.status(401).json({ error: 'Sign in required.' });

  try {
    const payload = jwt.verify(token, JWT_SECRET);
    const result = await db.execute({ sql: `SELECT id, student_id, role, account_status, is_verified FROM users WHERE id = ?`, args: [payload.id] });
    const currentUser = result.rows[0];

    if (!currentUser) return res.status(401).json({ error: 'Account not found. Please sign in again.' });
    if (currentUser.account_status !== 'active') return res.status(403).json({ error: 'Your CampusPool account is suspended or banned.', account_status: currentUser.account_status });

    req.user = { id: currentUser.id, studentId: currentUser.student_id, role: currentUser.role, accountStatus: currentUser.account_status, isVerified: currentUser.is_verified === 1 };
    return next();
  } catch (error) {
    if (error && ['JsonWebTokenError', 'TokenExpiredError'].includes(error.name)) return res.status(401).json({ error: 'Session expired or token invalid. Please sign in again.' });
    console.error('Authentication Error:', error);
    return res.status(500).json({ error: 'Could not verify your session.' });
  }
}

function requireAdmin(req, res, next) {
  if (req.user?.role !== 'admin') return res.status(403).json({ error: 'Admin access required.' });
  return next();
}

const MAX_ADMINS = 5;

async function getActiveAdminCount() {
  const result = await db.execute(`SELECT COUNT(*) AS total FROM users WHERE role = 'admin' AND account_status = 'active'`);
  return result.rows[0].total;
}

async function getTotalAdminCount() {
  const result = await db.execute(`SELECT COUNT(*) AS total FROM users WHERE role = 'admin'`);
  return result.rows[0].total;
}

async function writeAdminLog(actorId, targetId, action, details = null) {
  await db.execute({ sql: `INSERT INTO admin_activity_logs (actor_user_id, target_user_id, action, details) VALUES (?, ?, ?, ?)`, args: [actorId, targetId, action, details == null ? null : JSON.stringify(details)] });
}

async function createAdminNotification({ userId, type, title, message, bookingId = null, sosId = null, emergencyAlertId = null }) {
  if (!userId) return;
  await db.execute({ sql: `INSERT INTO notifications (user_id, type, title, message, booking_id, sos_id, emergency_alert_id) VALUES (?, ?, ?, ?, ?, ?, ?)`, args: [userId, type, title, message, bookingId, sosId, emergencyAlertId] });
}

async function expireOldRides() {
  await db.execute(`UPDATE rides SET status = 'expired' WHERE status = 'open' AND datetime(departure_at, '+10 minutes') < datetime('now')`);
}

function calculateProfileScore(user) {
  const checks = [
    [user.profile_picture, 15], [user.student_card, 35], [user.phone1, 15], [user.phone2, 15], [user.department, 20]
  ];
  return checks.reduce((total, [value, weight]) => total + (value ? weight : 0), 0);
}

// ======================================
// HEALTH CHECK
// ======================================

app.get('/api/health', (_req, res) => {
  res.json({ ok: true, service: 'CampusPool API' });
});

// ======================================
// AUTHENTICATION ROUTES
// ======================================

app.post('/api/auth/register', async (req, res) => {
  try {
    const name = String(req.body.name || '').trim();
    const studentId = String(req.body.studentId || '').trim();
    const department = String(req.body.department || '').trim();
    const password = String(req.body.password || '');
    const gender = String(req.body.gender || '').trim();
    const allowedGenders = ['Male', 'Female', 'Other', 'Prefer not to say'];

    if (name.length < 2 || studentId.length < 3 || !department || password.length < 8 || !allowedGenders.includes(gender)) {
      return res.status(400).json({ error: 'Name, Student ID, department, valid gender and password (at least 8 characters) are required.' });
    }

    const passwordHash = await bcrypt.hash(password, 12);
    const info = await db.execute({ sql: `INSERT INTO users (name, student_id, department, password_hash, university, gender) VALUES (?, ?, ?, ?, ?, ?)`, args: [name, studentId, department, passwordHash, UNIVERSITY, gender] });
    
    const userResult = await db.execute({ sql: `SELECT id, name, student_id, department, university, profile_picture, gender, gender_verified, role, account_status, created_at FROM users WHERE id = ?`, args: [info.lastInsertRowid] });
    const user = userResult.rows[0];

    res.status(201).json({ token: signToken(user), user });
  } catch (e) {
    if (String(e.code).includes('SQLITE_CONSTRAINT') || String(e.message).includes('UNIQUE')) return res.status(409).json({ error: 'That Student ID already has an account.' });
    console.error(e);
    res.status(500).json({ error: 'Could not create account.' });
  }
});

app.post('/api/auth/login', async (req, res) => {
  try {
    const studentId = String(req.body.studentId || '').trim();
    const password = String(req.body.password || '');
    const result = await db.execute({ sql: `SELECT * FROM users WHERE student_id = ? COLLATE NOCASE`, args: [studentId] });
    const user = result.rows[0];

    if (!user || !(await bcrypt.compare(password, user.password_hash))) {
      return res.status(401).json({ error: 'Student ID or password is incorrect.' });
    }
    if (user.account_status !== 'active') {
      return res.status(403).json({ error: 'Your CampusPool account is suspended or banned.', account_status: user.account_status });
    }

    res.json({
      token: signToken(user),
      user: { id: user.id, name: user.name, student_id: user.student_id, department: user.department, university: user.university, profile_picture: user.profile_picture, gender: user.gender, gender_verified: user.gender_verified, role: user.role, account_status: user.account_status, created_at: user.created_at }
    });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: 'Could not log in.' });
  }
});

app.get('/api/me', auth, async (req, res) => {
  const result = await db.execute({ sql: `SELECT id, name, student_id, department, university, profile_picture, phone1, phone2, student_card, role, account_status, is_verified, created_at FROM users WHERE id = ?`, args: [req.user.id] });
  const user = result.rows[0];
  if (!user) return res.status(404).json({ error: 'Account not found.' });

  const verificationScore = calculateProfileScore(user);
  res.json({ user: { ...user, verification_score: verificationScore, can_book: verificationScore >= 90 } });
});

app.patch('/api/me/profile', auth, async (req, res) => {
  try {
    const name = String(req.body.name || '').trim();
    const department = String(req.body.department || '').trim();
    const phone1 = String(req.body.phone1 || '').trim();
    const phone2 = String(req.body.phone2 || '').trim();
    const studentCard = req.body.student_card;

    if (name.length < 2 || !department) return res.status(400).json({ error: 'Valid name and department are required.' });

    const phonePattern = /^01[3-9]\d{8}$/;
    if (!phonePattern.test(phone1) || !phonePattern.test(phone2)) return res.status(400).json({ error: 'Enter valid Bangladeshi phone numbers.' });
    if (phone1 === phone2) return res.status(400).json({ error: 'Primary and alternative phone numbers must be different.' });

    if (studentCard !== undefined && (typeof studentCard !== 'string' || !/^data:image\/(jpeg|png|webp);base64,/.test(studentCard) || studentCard.length > 2800000)) {
      return res.status(400).json({ error: 'Invalid student card image or image is too large.' });
    }

    if (studentCard !== undefined) {
      await db.execute({ sql: `UPDATE users SET name = ?, department = ?, phone1 = ?, phone2 = ?, student_card = ? WHERE id = ?`, args: [name, department, phone1, phone2, studentCard, req.user.id] });
    } else {
      await db.execute({ sql: `UPDATE users SET name = ?, department = ?, phone1 = ?, phone2 = ? WHERE id = ?`, args: [name, department, phone1, phone2, req.user.id] });
    }
    res.json({ ok: true, message: 'Profile information updated successfully.' });
  } catch (error) {
    console.error('Profile Update Error:', error);
    res.status(500).json({ error: 'Could not update profile information.' });
  }
});

app.patch('/api/me/profile-picture', auth, async (req, res) => {
  const picture = req.body.profile_picture;
  if (typeof picture !== 'string' || !/^data:image\/(jpeg|png|webp);base64,/.test(picture)) return res.status(400).json({ error: 'Please provide a valid JPG, PNG or WEBP image.' });
  if (picture.length > 2800000) return res.status(400).json({ error: 'Profile picture is too large. Maximum size is approximately 2 MB.' });

  await db.execute({ sql: `UPDATE users SET profile_picture = ? WHERE id = ?`, args: [picture, req.user.id] });
  res.json({ message: 'Profile picture updated successfully.', profile_picture: picture });
});

// ======================================
// STUDENT CARD VERIFICATION
// ======================================

app.patch('/api/me/verify', auth, async (req, res) => {
  try {
    const { student_card, extracted_text } = req.body;

    if (!student_card || !extracted_text) {
      return res.status(400).json({ error: 'Missing card image or text.' });
    }

    const cleanExtracted = extracted_text.toUpperCase().replace(/\s/g, '');
    const cleanLoggedId = String(req.user.studentId).replace(/\s/g, '');

    // লজিক পরিবর্তন: শুধু NORTHERN বা UNIVERSITY যেকোনো একটা পেলেই হবে
    if (!cleanExtracted.includes("NORTHERN") && !cleanExtracted.includes("UNIVERSITY")) {
      return res.status(400).json({ error: 'Verification Failed: Not a Northern University ID card.' });
    }

    if (!cleanExtracted.includes(cleanLoggedId)) {
      return res.status(400).json({ error: 'Verification Failed: The Student ID on the card does not match your login ID.' });
    }

    await db.execute({ sql: `UPDATE users SET is_verified = 1, student_card = ? WHERE id = ?`, args: [student_card, req.user.id] });
    
    res.json({ ok: true, message: '✅ Student ID Verified Successfully!' });
  } catch (error) {
    console.error('Verify Error:', error);
    res.status(500).json({ error: 'Could not verify user.' });
  }
});

// ======================================
// RIDE ROUTES
// ======================================

app.get('/api/rides', auth, async (req, res) => {
  await expireOldRides();
  const from = `%${String(req.query.from || '').trim()}%`;
  const to = `%${String(req.query.to || '').trim()}%`;

  const result = await db.execute({ sql: `
    SELECT r.*, u.name AS driver_name, u.student_id AS driver_student_id, u.department AS driver_department,
      (SELECT COUNT(*) FROM bookings b WHERE b.ride_id = r.id AND b.status = 'pending') AS pending_requests,
      (SELECT COALESCE(SUM(b.seats), 0) FROM bookings b WHERE b.ride_id = r.id AND b.status = 'confirmed') AS seats_booked
    FROM rides r JOIN users u ON u.id = r.owner_id
    WHERE r.status = 'open' AND lower(r.from_location) LIKE lower(?) AND lower(r.to_location) LIKE lower(?)
      AND (r.female_only = 0 OR EXISTS (SELECT 1 FROM users current_user WHERE current_user.id = ? AND current_user.gender = 'Female'))
    ORDER BY r.departure_at ASC
  `, args: [from, to, req.user.id] });

  const rides = result.rows;
  res.json({
    rides: rides.map(r => ({
      ...r, female_only: Boolean(r.female_only),
      seats_available: Math.max(0, r.seats_total - r.seats_booked),
      total_passengers: r.total_passengers || (r.seats_total + 1),
      total_fare: r.total_fare,
      fare_per_person: r.total_fare > 0 ? r.total_fare / (r.total_passengers || (r.seats_total + 1)) : r.fare_per_person
    }))
  });
});

app.post('/api/rides', auth, async (req, res) => {
  try {
    if (!req.user.isVerified) {
      return res.status(403).json({ error: 'Your account is not verified. Please upload a valid Student ID card in your profile to verify.' });
    }

    const from = String(req.body.from || '').trim();
    const to = String(req.body.to || '').trim();
    const departureAt = String(req.body.departureAt || '').trim();
    const vehicle = String(req.body.vehicle || '');
    const totalFare = Number(req.body.totalFare);
    const totalPassengers = Number(req.body.totalPassengers);
    const femaleOnly = req.body.femaleOnly === true ? 1 : 0;

    const userResult = await db.execute({ sql: `SELECT gender FROM users WHERE id = ?`, args: [req.user.id] });
    const currentUser = userResult.rows[0];
    if (femaleOnly === 1 && currentUser?.gender !== 'Female') return res.status(403).json({ error: 'Only female users can post Female-Only rides.' });

    const date = new Date(departureAt);
    if (!from || !to || from.toLowerCase() === to.toLowerCase() || !departureAt || Number.isNaN(date.getTime())) return res.status(400).json({ error: 'Valid pickup, destination and departure time are required.' });
    if (date <= new Date()) return res.status(400).json({ error: 'Departure time must be in the future.' });

    const todayBD = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Dhaka', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date());
    const rideDateBD = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Dhaka', year: 'numeric', month: '2-digit', day: '2-digit' }).format(date);
    if (rideDateBD !== todayBD) return res.status(400).json({ error: 'For this MVP, rides can only be posted for today.' });

    if (!['Rickshaw', 'Bike', 'Car'].includes(vehicle)) return res.status(400).json({ error: 'Vehicle must be Rickshaw, Bike or Car.' });
    if (!Number.isInteger(totalPassengers) || totalPassengers < MIN_PARTNERS + 1 || totalPassengers > MAX_PARTNERS + 1) return res.status(400).json({ error: 'Choose 1 to 3 other students.' });
    if (!Number.isInteger(totalFare) || totalFare < totalPassengers || totalFare > totalPassengers * 100) return res.status(400).json({ error: `Total fare must be between ৳${totalPassengers} and ৳${totalPassengers * 100}.` });

    const availableSeats = totalPassengers - 1;
    const farePerPerson = totalFare / totalPassengers;

    const info = await db.execute({ sql: `
      INSERT INTO rides (owner_id, from_location, to_location, departure_at, vehicle, seats_total, fare_per_person, female_only, total_fare, total_passengers)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `, args: [req.user.id, from, to, date.toISOString(), vehicle, availableSeats, farePerPerson, femaleOnly, totalFare, totalPassengers] });

    const rideResult = await db.execute({ sql: `SELECT * FROM rides WHERE id = ?`, args: [info.lastInsertRowid] });
    res.status(201).json({ ride: rideResult.rows[0] });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: 'Could not post ride.' });
  }
});

app.patch('/api/rides/:id/cancel', auth, async (req, res) => {
  try {
    const rideId = Number(req.params.id);
    const rideResult = await db.execute({ sql: `SELECT id, owner_id, status, from_location, to_location FROM rides WHERE id = ?`, args: [rideId] });
    const ride = rideResult.rows[0];

    if (!ride) return res.status(404).json({ error: 'Ride not found.' });
    if (ride.owner_id !== req.user.id) return res.status(403).json({ error: 'Only the ride owner can cancel this ride.' });
    if (ride.status !== 'open') return res.status(409).json({ error: 'Only open rides can be cancelled.' });

    await db.execute(`BEGIN`);
    try {
      const passengersResult = await db.execute({ sql: `SELECT DISTINCT passenger_id FROM bookings WHERE ride_id = ? AND status IN ('pending', 'confirmed')`, args: [rideId] });
      await db.execute({ sql: `UPDATE rides SET status = 'cancelled' WHERE id = ? AND owner_id = ? AND status = 'open'`, args: [rideId, req.user.id] });
      await db.execute({ sql: `UPDATE bookings SET status = 'cancelled' WHERE ride_id = ? AND status IN ('pending', 'confirmed')`, args: [rideId] });

      for (const passenger of passengersResult.rows) {
        await db.execute({ sql: `INSERT INTO notifications (user_id, type, title, message, booking_id) VALUES (?, ?, ?, ?, ?)`, args: [passenger.passenger_id, 'ride_cancelled', 'Ride Cancelled', `The ride from ${ride.from_location} to ${ride.to_location} has been cancelled by the ride owner.`, null] });
      }
      await db.execute(`COMMIT`);
    } catch (e) {
      await db.execute(`ROLLBACK`);
      throw e;
    }

    res.json({ ok: true, message: 'Ride cancelled successfully.' });
  } catch (error) {
    console.error('Ride Cancellation Error:', error);
    res.status(500).json({ error: 'Could not cancel this ride.' });
  }
});

// ======================================
// BOOKING ROUTES
// ======================================

app.post('/api/rides/:id/bookings', auth, async (req, res) => {
  try {
    if (!req.user.isVerified) {
      return res.status(403).json({ error: 'Your account is not verified. Please upload a valid Student ID card in your profile to verify.' });
    }

    const profileResult = await db.execute({ sql: `SELECT profile_picture, student_card, phone1, phone2, department FROM users WHERE id = ?`, args: [req.user.id] });
    if (calculateProfileScore(profileResult.rows[0] || {}) < 90) return res.status(403).json({ error: 'Complete at least 90% of your profile before requesting a ride.' });

    await expireOldRides();
    const rideResult = await db.execute({ sql: `SELECT * FROM rides WHERE id = ? AND status = 'open'`, args: [Number(req.params.id)] });
    const ride = rideResult.rows[0];

    if (!ride) return res.status(404).json({ error: 'Ride not found or no longer open.' });
    if (ride.female_only === 1) {
      const userResult = await db.execute({ sql: `SELECT gender FROM users WHERE id = ?`, args: [req.user.id] });
      if (userResult.rows[0]?.gender !== 'Female') return res.status(403).json({ error: 'This ride is available only for female students.' });
    }
    if (ride.owner_id === req.user.id) return res.status(400).json({ error: 'You cannot request your own ride.' });

    const seats = Number(req.body.seats || 1);
    if (!Number.isInteger(seats) || seats < 1 || seats > ride.seats_total) return res.status(400).json({ error: `Choose between 1 and ${ride.seats_total} seats.` });

    const bookedResult = await db.execute({ sql: `SELECT COALESCE(SUM(seats), 0) AS n FROM bookings WHERE ride_id = ? AND status = 'confirmed'`, args: [ride.id] });
    const booked = bookedResult.rows[0].n;
    if (booked + seats > ride.seats_total) return res.status(409).json({ error: 'Not enough seats available.' });

    const info = await db.execute({ sql: `INSERT INTO bookings (ride_id, passenger_id, seats) VALUES (?, ?, ?)`, args: [ride.id, req.user.id, seats] });
    const newBooking = await db.execute({ sql: `SELECT * FROM bookings WHERE id = ?`, args: [info.lastInsertRowid] });
    res.status(201).json({ booking: newBooking.rows[0] });
  } catch (e) {
    if (String(e.code).includes('SQLITE_CONSTRAINT') || String(e.message).includes('UNIQUE')) return res.status(409).json({ error: 'You already requested this ride.' });
    console.error(e);
    res.status(500).json({ error: 'Could not request this ride.' });
  }
});

app.get('/api/bookings', auth, async (req, res) => {
  const result = await db.execute({ sql: `
    SELECT b.*, r.from_location, r.to_location, r.departure_at, r.vehicle, r.fare_per_person, r.total_fare, r.total_passengers, owner.name AS driver_name, passenger.name AS passenger_name, r.owner_id
    FROM bookings b JOIN rides r ON r.id = b.ride_id JOIN users owner ON owner.id = r.owner_id JOIN users passenger ON passenger.id = b.passenger_id
    WHERE r.owner_id = ? OR b.passenger_id = ? ORDER BY b.created_at DESC
  `, args: [req.user.id, req.user.id] });
  res.json({ bookings: result.rows });
});

app.patch('/api/bookings/:id', auth, async (req, res) => {
  try {
    const bookingResult = await db.execute({ sql: `SELECT b.*, r.owner_id, r.seats_total FROM bookings b JOIN rides r ON r.id = b.ride_id WHERE b.id = ?`, args: [Number(req.params.id)] });
    const booking = bookingResult.rows[0];
    if (!booking) return res.status(404).json({ error: 'Booking not found.' });
    if (booking.owner_id !== req.user.id) return res.status(403).json({ error: 'Only the ride owner can respond to this request.' });

    const status = String(req.body.status || '');
    if (!['confirmed', 'rejected'].includes(status)) return res.status(400).json({ error: 'Status must be confirmed or rejected.' });
    if (booking.status !== 'pending') return res.status(409).json({ error: 'This request has already been handled.' });

    if (status === 'confirmed') {
      const bookedResult = await db.execute({ sql: `SELECT COALESCE(SUM(seats), 0) AS n FROM bookings WHERE ride_id = ? AND status = 'confirmed'`, args: [booking.ride_id] });
      if (bookedResult.rows[0].n + booking.seats > booking.seats_total) return res.status(409).json({ error: 'There are not enough seats left.' });
    }

    await db.execute({ sql: `UPDATE bookings SET status = ? WHERE id = ?`, args: [status, booking.id] });
    const updated = await db.execute({ sql: `SELECT * FROM bookings WHERE id = ?`, args: [booking.id] });
    res.json({ booking: updated.rows[0] });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: 'Could not update booking.' });
  }
});

app.get('/api/owner/rides', auth, async (req, res) => {
  await expireOldRides();
  const result = await db.execute({ sql: `
    SELECT r.*, (SELECT COUNT(*) FROM bookings b WHERE b.ride_id = r.id AND b.status = 'pending') AS pending_requests, (SELECT COALESCE(SUM(b.seats), 0) FROM bookings b WHERE b.ride_id = r.id AND b.status = 'confirmed') AS seats_booked
    FROM rides r WHERE r.owner_id = ? ORDER BY r.created_at DESC
  `, args: [req.user.id] });

  res.json({ rides: result.rows.map(r => ({ ...r, seats_available: Math.max(0, r.seats_total - r.seats_booked), total_passengers: r.total_passengers || (r.seats_total + 1), total_fare: r.total_fare })) });
});

app.get('/api/users/:id', auth, async (req, res) => {
  const userId = Number(req.params.id);
  if (!Number.isInteger(userId) || userId <= 0) return res.status(400).json({ error: 'Invalid user ID.' });
  const result = await db.execute({ sql: `SELECT id, name, student_id, department, university, profile_picture, created_at FROM users WHERE id = ?`, args: [userId] });
  if (!result.rows[0]) return res.status(404).json({ error: 'Student profile not found.' });
  res.json({ user: result.rows[0] });
});

// ======================================
// CHAT ROUTES
// ======================================

async function getAuthorizedChatBooking(bookingId, userId) {
  const result = await db.execute({ sql: `SELECT b.id AS booking_id, b.ride_id, b.passenger_id, r.owner_id FROM bookings b JOIN rides r ON r.id = b.ride_id WHERE b.id = ? AND b.status = 'confirmed' AND (r.owner_id = ? OR b.passenger_id = ?)`, args: [bookingId, userId, userId] });
  return result.rows[0];
}

app.get('/api/messages', auth, async (req, res) => {
  try {
    const result = await db.execute({ sql: `
      SELECT 
        b.id AS booking_id, 
        b.ride_id, 
        b.status AS booking_status, 
        r.from_location, 
        r.to_location, 
        r.departure_at,
        CASE WHEN r.owner_id = ? THEN passenger.id ELSE owner.id END AS other_user_id,
        CASE WHEN r.owner_id = ? THEN passenger.name ELSE owner.name END AS other_user_name,
        CASE WHEN r.owner_id = ? THEN passenger.student_id ELSE owner.student_id END AS other_student_id,
        CASE WHEN r.owner_id = ? THEN passenger.department ELSE owner.department END AS other_department,
        CASE WHEN r.owner_id = ? THEN passenger.university ELSE owner.university END AS other_university,
        CASE WHEN r.owner_id = ? THEN passenger.profile_picture ELSE owner.profile_picture END AS other_profile_picture,
        (SELECT m.message FROM chat_messages m WHERE m.booking_id = b.id ORDER BY m.id DESC LIMIT 1) AS last_message,
        (SELECT m.created_at FROM chat_messages m WHERE m.booking_id = b.id ORDER BY m.id DESC LIMIT 1) AS last_message_at,
        (SELECT COUNT(*) FROM chat_messages m WHERE m.booking_id = b.id AND m.sender_id != ? AND m.read_at IS NULL) AS unread_count
      FROM bookings b 
      JOIN rides r ON r.id = b.ride_id 
      JOIN users owner ON owner.id = r.owner_id 
      JOIN users passenger ON passenger.id = b.passenger_id
      WHERE b.status = 'confirmed' AND (r.owner_id = ? OR b.passenger_id = ?) 
      ORDER BY COALESCE(last_message_at, b.created_at) DESC
    `, args: [
      req.user.id, req.user.id, req.user.id, req.user.id, req.user.id, req.user.id, req.user.id, req.user.id, req.user.id
    ]});

    const conversations = result.rows;
    const groupedConversations = [];
    const userMap = new Map();

    for (const conv of conversations) {
      const otherId = conv.other_user_id;

      if (!userMap.has(otherId)) {
        userMap.set(otherId, { ...conv, booking_ids: [conv.booking_id] });
        groupedConversations.push(userMap.get(otherId));
      } else {
        const existing = userMap.get(otherId);
        existing.booking_ids.push(conv.booking_id);
        
        if (new Date(conv.last_message_at) > new Date(existing.last_message_at)) {
          existing.last_message = conv.last_message;
          existing.last_message_at = conv.last_message_at;
        }
        existing.unread_count += Number(conv.unread_count || 0);
      }
    }

    const unreadTotal = groupedConversations.reduce((sum, item) => sum + Number(item.unread_count || 0), 0);
    res.json({ conversations: groupedConversations, unread_total: unreadTotal });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Could not load messages.' });
  }
});

app.get('/api/bookings/:id/messages', auth, async (req, res) => {
  const bookingId = Number(req.params.id);
  if (!Number.isInteger(bookingId) || bookingId <= 0) return res.status(400).json({ error: 'Invalid booking ID.' });
  const booking = await getAuthorizedChatBooking(bookingId, req.user.id);
  if (!booking) return res.status(403).json({ error: 'Chat is available only to confirmed ride participants.' });

  await db.execute({ sql: `UPDATE chat_messages SET read_at = CURRENT_TIMESTAMP WHERE booking_id = ? AND sender_id != ? AND read_at IS NULL`, args: [bookingId, req.user.id] });
  
  const result = await db.execute({ sql: `
    SELECT m.id, m.booking_id, m.sender_id, m.message, m.created_at, m.read_at, u.name AS sender_name, CASE WHEN m.sender_id = ? THEN 1 ELSE 0 END AS is_mine
    FROM chat_messages m JOIN users u ON u.id = m.sender_id WHERE m.booking_id = ? ORDER BY m.id ASC LIMIT 200
  `, args: [req.user.id, bookingId] });
  res.json({ messages: result.rows });
});

app.post('/api/bookings/:id/messages', auth, async (req, res) => {
  try {
    const bookingId = Number(req.params.id);
    const message = String(req.body.message || '').trim();
    if (!Number.isInteger(bookingId) || bookingId <= 0) return res.status(400).json({ error: 'Invalid booking ID.' });
    if (!message || message.length > 500) return res.status(400).json({ error: 'Message must contain 1 to 500 characters.' });

    const booking = await getAuthorizedChatBooking(bookingId, req.user.id);
    if (!booking) return res.status(403).json({ error: 'You are not allowed to send messages in this chat.' });

    const result = await db.execute({ sql: `INSERT INTO chat_messages (booking_id, sender_id, message) VALUES (?, ?, ?)`, args: [bookingId, req.user.id, message] });
    
    const savedResult = await db.execute({ sql: `
      SELECT m.id, m.booking_id, m.sender_id, m.message, m.created_at, m.read_at, u.name AS sender_name, CASE WHEN m.sender_id = ? THEN 1 ELSE 0 END AS is_mine
      FROM chat_messages m JOIN users u ON u.id = m.sender_id WHERE m.id = ?
    `, args: [req.user.id, result.lastInsertRowid] });
    res.status(201).json({ message: savedResult.rows[0] });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Could not send message.' });
  }
});

// ======================================
// LIVE LOCATION & SOS
// ======================================

app.put('/api/bookings/:id/location', auth, async (req, res) => {
  try {
    const bookingId = Number(req.params.id);
    const latitude = Number(req.body.latitude);
    const longitude = Number(req.body.longitude);
    if (!Number.isInteger(bookingId) || bookingId <= 0) return res.status(400).json({ error: 'Invalid booking ID.' });
    if (!Number.isFinite(latitude) || !Number.isFinite(longitude) || latitude < -90 || latitude > 90 || longitude < -180 || longitude > 180) return res.status(400).json({ error: 'Valid latitude and longitude are required.' });

    const booking = await getAuthorizedChatBooking(bookingId, req.user.id);
    if (!booking) return res.status(403).json({ error: 'Location sharing is available only to confirmed ride participants.' });

    await db.execute({ sql: `
      INSERT INTO live_location_shares (booking_id, user_id, latitude, longitude, sharing_enabled, updated_at)
      VALUES (?, ?, ?, ?, 1, CURRENT_TIMESTAMP)
      ON CONFLICT(booking_id, user_id) DO UPDATE SET latitude = excluded.latitude, longitude = excluded.longitude, sharing_enabled = 1, updated_at = CURRENT_TIMESTAMP
    `, args: [bookingId, req.user.id, latitude, longitude] });
    res.json({ ok: true, message: 'Live location sharing is active.' });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Could not update live location.' });
  }
});

app.get('/api/bookings/:id/location', auth, async (req, res) => {
  try {
    const bookingId = Number(req.params.id);
    if (!Number.isInteger(bookingId) || bookingId <= 0) return res.status(400).json({ error: 'Invalid booking ID.' });
    const booking = await getAuthorizedChatBooking(bookingId, req.user.id);
    if (!booking) return res.status(403).json({ error: 'Location is available only to confirmed ride participants.' });

    const otherUserId = booking.owner_id === req.user.id ? booking.passenger_id : booking.owner_id;
    
    const myResult = await db.execute({ sql: `SELECT sharing_enabled FROM live_location_shares WHERE booking_id = ? AND user_id = ?`, args: [bookingId, req.user.id] });
    const mySharing = myResult.rows[0];
    
    const otherResult = await db.execute({ sql: `SELECT user_id, latitude, longitude, updated_at FROM live_location_shares WHERE booking_id = ? AND user_id = ? AND sharing_enabled = 1 AND datetime(updated_at) >= datetime('now', '-2 minutes')`, args: [bookingId, otherUserId] });
    const otherLocation = otherResult.rows[0];

    res.json({ my_sharing: Boolean(mySharing && mySharing.sharing_enabled), other_location: otherLocation || null });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Could not load live location.' });
  }
});

app.delete('/api/bookings/:id/location', auth, async (req, res) => {
  try {
    const bookingId = Number(req.params.id);
    if (!Number.isInteger(bookingId) || bookingId <= 0) return res.status(400).json({ error: 'Invalid booking ID.' });
    const booking = await getAuthorizedChatBooking(bookingId, req.user.id);
    if (!booking) return res.status(403).json({ error: 'You cannot change location sharing for this booking.' });

    await db.execute({ sql: `UPDATE live_location_shares SET sharing_enabled = 0, latitude = NULL, longitude = NULL, updated_at = CURRENT_TIMESTAMP WHERE booking_id = ? AND user_id = ?`, args: [bookingId, req.user.id] });
    res.json({ ok: true, message: 'Live location sharing stopped.' });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Could not stop location sharing.' });
  }
});

// ======================================
// EMERGENCY SOS (BOOKING-BASED)
// ======================================

app.post('/api/bookings/:id/sos', auth, async (req, res) => {
  try {
    const bookingId = Number(req.params.id);
    if (!Number.isInteger(bookingId) || bookingId <= 0) return res.status(400).json({ error: 'Invalid booking ID.' });
    
    const booking = await getAuthorizedChatBooking(bookingId, req.user.id);
    if (!booking) return res.status(403).json({ error: 'SOS is available only to confirmed ride participants.' });

    const latitude = req.body.latitude == null ? null : Number(req.body.latitude);
    const longitude = req.body.longitude == null ? null : Number(req.body.longitude);
    
    if ((latitude === null) !== (longitude === null) || (latitude !== null && (!Number.isFinite(latitude) || !Number.isFinite(longitude) || latitude < -90 || latitude > 90 || longitude < -180 || longitude > 180))) {
      return res.status(400).json({ error: 'Invalid location coordinates.' });
    }

    const existingResult = await db.execute({ sql: `SELECT id FROM emergency_alerts WHERE booking_id = ? AND status = 'active'`, args: [bookingId] });
    const existingSOS = existingResult.rows[0];
    if (existingSOS) return res.status(409).json({ error: 'An active SOS alert already exists for this booking.', sos_id: existingSOS.id });

    const recipientId = booking.owner_id === req.user.id ? booking.passenger_id : booking.owner_id;

    await db.execute(`BEGIN`);
    let sosId;
    try {
      const result = await db.execute({ sql: `INSERT INTO emergency_alerts (booking_id, triggered_by, latitude, longitude, message) VALUES (?, ?, ?, ?, ?)`, args: [bookingId, req.user.id, latitude, longitude, 'Emergency! I need help.'] });
      sosId = result.lastInsertRowid;
      await db.execute({ sql: `INSERT INTO notifications (user_id, type, title, message, booking_id, sos_id) VALUES (?, ?, ?, ?, ?, ?)`, args: [recipientId, 'safety', 'Emergency SOS Alert!', 'A ride participant has sent an emergency alert. Please check their location and contact them immediately.', bookingId, sosId] });
      await db.execute(`COMMIT`);
    } catch (e) {
      await db.execute(`ROLLBACK`);
      throw e;
    }

    res.status(201).json({ ok: true, message: 'Emergency SOS alert sent successfully.', sos_id: sosId });
  } catch (error) {
    console.error('SOS Error:', error);
    res.status(500).json({ error: 'Could not send emergency alert.' });
  }
});

app.get('/api/bookings/:id/sos', auth, async (req, res) => {
  try {
    const bookingId = Number(req.params.id);
    if (!Number.isInteger(bookingId) || bookingId <= 0) return res.status(400).json({ error: 'Invalid booking ID.' });
    const booking = await getAuthorizedChatBooking(bookingId, req.user.id);
    if (!booking) return res.status(403).json({ error: 'You are not allowed to view these alerts.' });

    const result = await db.execute({ sql: `
      SELECT s.id, s.booking_id, s.triggered_by, s.latitude, s.longitude, s.message, s.status, s.created_at, s.resolved_at, u.name AS triggered_by_name
      FROM emergency_alerts s JOIN users u ON u.id = s.triggered_by WHERE s.booking_id = ? ORDER BY s.id DESC
    `, args: [bookingId] });
    res.json({ alerts: result.rows });
  } catch (error) {
    console.error('SOS Load Error:', error);
    res.status(500).json({ error: 'Could not load SOS alerts.' });
  }
});

app.patch('/api/bookings/:id/sos/:sosId/resolve', auth, async (req, res) => {
  try {
    const bookingId = Number(req.params.id);
    const sosId = Number(req.params.sosId);
    if (!Number.isInteger(bookingId) || bookingId <= 0 || !Number.isInteger(sosId) || sosId <= 0) return res.status(400).json({ error: 'Invalid booking or SOS ID.' });

    const booking = await getAuthorizedChatBooking(bookingId, req.user.id);
    if (!booking) return res.status(403).json({ error: 'You are not allowed to resolve this alert.' });

    const alertResult = await db.execute({ sql: `SELECT * FROM emergency_alerts WHERE id = ? AND booking_id = ?`, args: [sosId, bookingId] });
    const alert = alertResult.rows[0];
    if (!alert) return res.status(404).json({ error: 'SOS alert not found.' });
    if (alert.status !== 'active') return res.status(409).json({ error: 'This SOS alert is already resolved.' });

    const recipientId = booking.owner_id === req.user.id ? booking.passenger_id : booking.owner_id;

    await db.execute(`BEGIN`);
    try {
      await db.execute({ sql: `UPDATE emergency_alerts SET status = 'resolved', resolved_at = CURRENT_TIMESTAMP WHERE id = ?`, args: [sosId] });
      await db.execute({ sql: `INSERT INTO notifications (user_id, type, title, message, booking_id, sos_id) VALUES (?, ?, ?, ?, ?, ?)`, args: [recipientId, 'safety', 'SOS Alert Resolved', 'The emergency alert has been marked as resolved.', bookingId, sosId] });
      await db.execute(`COMMIT`);
    } catch (e) {
      await db.execute(`ROLLBACK`);
      throw e;
    }

    res.json({ ok: true, message: 'SOS alert resolved successfully.' });
  } catch (error) {
    console.error('SOS Resolve Error:', error);
    res.status(500).json({ error: 'Could not resolve SOS alert.' });
  }
});

// ======================================
// INDEPENDENT SOS (SAFETY CENTRE)
// ======================================

app.post('/api/sos/trigger', auth, async (req, res) => {
  try {
    const { latitude, longitude, message } = req.body;
    const senderId = req.user.id;

    const contactsResult = await db.execute({ sql: `SELECT contact_user_id FROM trusted_contacts WHERE user_id = ?`, args: [senderId] });
    const contacts = contactsResult.rows;

    if (contacts.length === 0) {
      return res.status(400).json({ error: 'No Trusted Contacts found to alert. Please add a contact first.' });
    }

    // ১. নতুন আলার্ট ইনসার্ট করা (Turso-র জন্য RETURNING ব্যবহার করা হলো)
    const alertResult = await db.execute({ 
      sql: `INSERT INTO emergency_contact_alerts (sender_id, latitude, longitude, message, status) 
            VALUES (?, ?, ?, ?, 'active') RETURNING id`, 
      args: [senderId, latitude || null, longitude || null, message || 'Emergency! I need help.'] 
    });
    
    // Turso-র RETURNING থেকে আইডি নেওয়া
    const alertId = alertResult.rows[0].id;

    const senderName = (await db.execute({ sql: `SELECT name FROM users WHERE id = ?`, args: [senderId] })).rows[0].name;

    // ২. ট্রাস্টেড কন্টাক্টদের নোটিফিকেশন পাঠানো
    for (const contact of contacts) {
      await db.execute({ sql: `
        INSERT INTO notifications (user_id, type, title, message, emergency_alert_id)
        VALUES (?, 'safety', '🚨 EMERGENCY SOS ALERT!', ?, ?)
      `, args: [contact.contact_user_id, `${senderName} has pressed the SOS button and needs urgent help!`, alertId] });
    }

    // ৩. অ্যাডমিনদের নোটিফিকেশন পাঠানো
    const adminsResult = await db.execute({ sql: `SELECT id FROM users WHERE role = 'admin'` });
    for (const admin of adminsResult.rows) {
      await db.execute({ sql: `INSERT INTO notifications (user_id, type, title, message, emergency_alert_id) VALUES (?, 'safety', '🚨 EMERGENCY SOS ALERT!', ?, ?)`, args: [admin.id, `EMERGENCY: ${senderName} triggered an SOS alert!`, alertId] });
    }

    res.json({ ok: true, message: 'SOS Alert Sent successfully!', alertId });
  } catch (error) {
    console.error('SOS Trigger Error:', error);
    res.status(500).json({ error: 'Could not send SOS alert.' });
  }
});

// ======================================
// TRUSTED & EMERGENCY CONTACTS
// ======================================

app.get('/api/trusted-contacts/search/:userId', auth, async (req, res) => {
  try {
    const searchId = String(req.params.userId).trim();
    if (!searchId) return res.status(400).json({ error: 'Enter a valid Student ID.' });
    
    const result = await db.execute({ sql: `SELECT id, name, student_id, department, profile_picture FROM users WHERE student_id = ? COLLATE NOCASE`, args: [searchId] });
    const user = result.rows[0];
    if (!user) return res.status(404).json({ error: 'No account found with this Student ID.' });
    if (user.id === req.user.id) return res.status(400).json({ error: 'You cannot add yourself as a Trusted Contact.' });
    
    res.json({ user });
  } catch (error) {
    console.error('Trusted Contact Search Error:', error);
    res.status(500).json({ error: 'Could not search for this account.' });
  }
});

app.get('/api/trusted-contacts', auth, async (req, res) => {
  try {
    const result = await db.execute({ sql: `
      SELECT tc.id, tc.contact_user_id, tc.created_at, u.name, u.department, u.profile_picture
      FROM trusted_contacts tc JOIN users u ON u.id = tc.contact_user_id WHERE tc.user_id = ? ORDER BY tc.id DESC
    `, args: [req.user.id] });
    res.json({ contacts: result.rows });
  } catch (error) {
    console.error('Trusted Contact Load Error:', error);
    res.status(500).json({ error: 'Could not load Trusted Contacts.' });
  }
});

app.post('/api/trusted-contacts', auth, async (req, res) => {
  try {
    const contactUserId = Number(req.body.user_id);
    if (!Number.isInteger(contactUserId) || contactUserId <= 0) return res.status(400).json({ error: 'Enter a valid CampusPool User ID.' });
    if (contactUserId === req.user.id) return res.status(400).json({ error: 'You cannot add yourself as a Trusted Contact.' });

    const targetResult = await db.execute({ sql: `SELECT id FROM users WHERE id = ?`, args: [contactUserId] });
    if (!targetResult.rows[0]) return res.status(404).json({ error: 'No account found with this ID.' });

    const result = await db.execute({ sql: `INSERT INTO trusted_contacts (user_id, contact_user_id) VALUES (?, ?)`, args: [req.user.id, contactUserId] });
    const contactResult = await db.execute({ sql: `
      SELECT tc.id, tc.contact_user_id, tc.created_at, u.name, u.department, u.profile_picture
      FROM trusted_contacts tc JOIN users u ON u.id = tc.contact_user_id WHERE tc.id = ?
    `, args: [result.lastInsertRowid] });

    res.status(201).json({ message: 'Trusted Contact added successfully.', contact: contactResult.rows[0] });
  } catch (error) {
    if (String(error.code).includes('SQLITE_CONSTRAINT') || String(error.message).includes('UNIQUE')) return res.status(409).json({ error: 'This person is already in your Trusted Contacts.' });
    console.error('Trusted Contact Add Error:', error);
    res.status(500).json({ error: 'Could not add Trusted Contact.' });
  }
});

app.delete('/api/trusted-contacts/:id', auth, async (req, res) => {
  try {
    const contactId = Number(req.params.id);
    if (!Number.isInteger(contactId) || contactId <= 0) return res.status(400).json({ error: 'Invalid Trusted Contact ID.' });
    const result = await db.execute({ sql: `DELETE FROM trusted_contacts WHERE id = ? AND user_id = ?`, args: [contactId, req.user.id] });
    if (result.rowsAffected === 0) return res.status(404).json({ error: 'Trusted Contact not found.' });
    res.json({ message: 'Trusted Contact removed successfully.' });
  } catch (error) {
    console.error('Trusted Contact Remove Error:', error);
    res.status(500).json({ error: 'Could not remove Trusted Contact.' });
  }
});

app.get('/api/emergency-contacts', auth, async (req, res) => {
  try {
    const result = await db.execute({ sql: `SELECT id, contact_name, phone, relationship, created_at FROM emergency_contacts WHERE user_id = ? ORDER BY id DESC`, args: [req.user.id] });
    res.json({ contacts: result.rows });
  } catch (error) {
    console.error('Emergency Contact Load Error:', error);
    res.status(500).json({ error: 'Could not load emergency contacts.' });
  }
});

app.post('/api/emergency-contacts', auth, async (req, res) => {
  try {
    const contactName = String(req.body.contact_name || '').trim();
    const phone = String(req.body.phone || '').trim();
    const relationship = String(req.body.relationship || '').trim();
    const phonePattern = /^01[3-9]\d{8}$/;

    if (contactName.length < 2 || contactName.length > 80) return res.status(400).json({ error: 'Contact name must contain 2 to 80 characters.' });
    if (!phonePattern.test(phone)) return res.status(400).json({ error: 'Enter a valid Bangladesh phone number (01XXXXXXXXX).' });
    if (!['Father', 'Mother', 'Brother', 'Sister', 'Friend', 'Relative', 'Other'].includes(relationship)) return res.status(400).json({ error: 'Please select a valid relationship.' });

    const result = await db.execute({ sql: `INSERT INTO emergency_contacts (user_id, contact_name, phone, relationship) VALUES (?, ?, ?, ?)`, args: [req.user.id, contactName, phone, relationship] });
    const contactResult = await db.execute({ sql: `SELECT id, contact_name, phone, relationship, created_at FROM emergency_contacts WHERE id = ? AND user_id = ?`, args: [result.lastInsertRowid, req.user.id] });

    res.status(201).json({ message: 'Emergency contact added successfully.', contact: contactResult.rows[0] });
  } catch (error) {
    if (String(error.code).includes('SQLITE_CONSTRAINT') || String(error.message).includes('UNIQUE')) return res.status(409).json({ error: 'This phone number is already in your emergency contacts.' });
    console.error('Emergency Contact Add Error:', error);
    res.status(500).json({ error: 'Could not add emergency contact.' });
  }
});

app.delete('/api/emergency-contacts/:id', auth, async (req, res) => {
  try {
    const contactId = Number(req.params.id);
    if (!Number.isInteger(contactId) || contactId <= 0) return res.status(400).json({ error: 'Invalid contact ID.' });
    const result = await db.execute({ sql: `DELETE FROM emergency_contacts WHERE id = ? AND user_id = ?`, args: [contactId, req.user.id] });
    if (result.rowsAffected === 0) return res.status(404).json({ error: 'Emergency contact not found.' });
    res.json({ message: 'Emergency contact deleted successfully.' });
  } catch (error) {
    console.error('Emergency Contact Delete Error:', error);
    res.status(500).json({ error: 'Could not delete emergency contact.' });
  }
});

// ======================================
// NOTIFICATIONS API
// ======================================

app.get('/api/notifications', auth, async (req, res) => {
  try {
    const result = await db.execute({ sql: `
      SELECT 
        n.id, n.type, n.title, n.message, n.is_read, n.created_at,
        eca.latitude AS sos_latitude, 
        eca.longitude AS sos_longitude
      FROM notifications n
      LEFT JOIN emergency_contact_alerts eca ON n.emergency_alert_id = eca.id
      WHERE n.user_id = ? 
      ORDER BY n.created_at DESC, n.id DESC
    `, args: [req.user.id] });

    res.json({ notifications: result.rows });
  } catch (error) {
    console.error('Get Notifications Error:', error);
    res.status(500).json({ error: 'Could not load notifications.' });
  }
});

app.patch('/api/notifications/:id/read', auth, async (req, res) => {
  try {
    const id = Number(req.params.id);
    if (!Number.isInteger(id) || id <= 0) return res.status(400).json({ error: 'Invalid notification ID.' });
    const result = await db.execute({ sql: `UPDATE notifications SET is_read = 1 WHERE id = ? AND user_id = ?`, args: [id, req.user.id] });
    if (result.rowsAffected === 0) return res.status(404).json({ error: 'Notification not found.' });
    res.json({ ok: true });
  } catch (error) {
    console.error('Mark Notification Read Error:', error);
    res.status(500).json({ error: 'Could not update notification.' });
  }
});

app.patch('/api/notifications/read-all', auth, async (req, res) => {
  try {
    await db.execute({ sql: `UPDATE notifications SET is_read = 1 WHERE user_id = ? AND is_read = 0`, args: [req.user.id] });
    res.json({ ok: true });
  } catch (error) {
    console.error('Mark All Notifications Read Error:', error);
    res.status(500).json({ error: 'Could not update notifications.' });
  }
});

// ======================================
// USER IMPACT STATISTICS
// ======================================

app.get('/api/user/impact', auth, async (req, res) => {
  try {
    const result = await db.execute({ sql: `
      SELECT b.seats, r.fare_per_person, r.vehicle
      FROM bookings b
      JOIN rides r ON r.id = b.ride_id
      WHERE b.passenger_id = ? AND b.status = 'confirmed'
    `, args: [req.user.id] });

    let totalSavings = 0;
    let totalSeats = 0;
    let totalTrips = result.rows.length;

    for (const b of result.rows) {
      totalSavings += (b.fare_per_person * b.seats);
      totalSeats += b.seats;
    }

    const co2Saved = (totalTrips * 2.5).toFixed(1);

    res.json({
      savings: totalSavings,
      trips: totalTrips,
      seats: totalSeats,
      co2: co2Saved
    });

  } catch (error) {
    console.error('Impact Error:', error);
    res.status(500).json({ error: 'Could not load impact data.' });
  }
});

// ======================================
// ADMIN API
// ======================================

app.get('/api/admin/me', auth, requireAdmin, async (req, res) => {
  try {
    const result = await db.execute({ sql: `SELECT id, name, student_id, department, role, account_status, created_at FROM users WHERE id = ?`, args: [req.user.id] });
    res.json({ user: result.rows[0] });
  } catch (error) {
    console.error('Admin Me Error:', error);
    res.status(500).json({ error: 'Could not load admin profile.' });
  }
});

app.get('/api/admin/overview', auth, requireAdmin, async (req, res) => {
  try {
    const usersResult = await db.execute(`SELECT COUNT(*) AS total, SUM(CASE WHEN account_status = 'active' THEN 1 ELSE 0 END) AS active, SUM(CASE WHEN account_status = 'suspended' THEN 1 ELSE 0 END) AS suspended, SUM(CASE WHEN account_status = 'banned' THEN 1 ELSE 0 END) AS banned FROM users`);
    const ridesResult = await db.execute(`SELECT COUNT(*) AS total, SUM(CASE WHEN status = 'open' THEN 1 ELSE 0 END) AS open, SUM(CASE WHEN status = 'full' THEN 1 ELSE 0 END) AS full, SUM(CASE WHEN status = 'cancelled' THEN 1 ELSE 0 END) AS cancelled, SUM(CASE WHEN status = 'expired' THEN 1 ELSE 0 END) AS expired FROM rides`);
    const bookingsResult = await db.execute(`SELECT COUNT(*) AS total, SUM(CASE WHEN status = 'pending' THEN 1 ELSE 0 END) AS pending, SUM(CASE WHEN status = 'confirmed' THEN 1 ELSE 0 END) AS confirmed, SUM(CASE WHEN status = 'rejected' THEN 1 ELSE 0 END) AS rejected, SUM(CASE WHEN status = 'cancelled' THEN 1 ELSE 0 END) AS cancelled FROM bookings`);
    const bookingSOSResult = await db.execute(`SELECT COUNT(*) AS total FROM emergency_alerts WHERE status = 'active'`);
    const independentSOSResult = await db.execute(`SELECT COUNT(*) AS total FROM emergency_contact_alerts WHERE status = 'active'`);

    const users = usersResult.rows[0];
    const rides = ridesResult.rows[0];
    const bookings = bookingsResult.rows[0];
    const bookingSOS = bookingSOSResult.rows[0].total;
    const independentSOS = independentSOSResult.rows[0].total;

    res.json({
      users: { total: users.total || 0, active: users.active || 0, suspended: users.suspended || 0, banned: users.banned || 0 },
      rides: { total: rides.total || 0, open: rides.open || 0, full: rides.full || 0, cancelled: rides.cancelled || 0, expired: rides.expired || 0 },
      bookings: { total: bookings.total || 0, pending: bookings.pending || 0, confirmed: bookings.confirmed || 0, rejected: bookings.rejected || 0, cancelled: bookings.cancelled || 0 },
      active_sos: (bookingSOS || 0) + (independentSOS || 0),
      sos: { booking: bookingSOS || 0, independent: independentSOS || 0, total: (bookingSOS || 0) + (independentSOS || 0) },
      admin_capacity: { current: await getTotalAdminCount(), maximum: MAX_ADMINS }
    });
  } catch (error) {
    console.error('Admin Overview Error:', error);
    res.status(500).json({ error: 'Could not load admin overview.' });
  }
});

app.get('/api/admin/users', auth, requireAdmin, async (req, res) => {
  try {
    const q = String(req.query.q || '').trim().slice(0, 100);
    const role = String(req.query.role || '').trim();
    const status = String(req.query.status || '').trim();
    const page = Math.max(1, Number.parseInt(req.query.page, 10) || 1);
    const limit = Math.min(50, Math.max(1, Number.parseInt(req.query.limit, 10) || 20));
    const offset = (page - 1) * limit;
    const conditions = [];
    const params = [];

    if (q) {
      conditions.push(`(name LIKE ? OR student_id LIKE ? OR department LIKE ?)`);
      params.push(`%${q}%`, `%${q}%`, `%${q}%`);
    }
    if (['student', 'admin'].includes(role)) { conditions.push('role = ?'); params.push(role); }
    if (['active', 'suspended', 'banned'].includes(status)) { conditions.push('account_status = ?'); params.push(status); }

    const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';
    
    const totalResult = await db.execute({ sql: `SELECT COUNT(*) AS total FROM users ${where}`, args: params });
    const total = totalResult.rows[0].total;
    
    const usersResult = await db.execute({ sql: `SELECT id, name, student_id, department, university, role, account_status, created_at FROM users ${where} ORDER BY created_at DESC, id DESC LIMIT ? OFFSET ?`, args: [...params, limit, offset] });

    res.json({
      users: usersResult.rows,
      admin_capacity: { current: await getTotalAdminCount(), maximum: MAX_ADMINS },
      pagination: { page, limit, total, pages: Math.ceil(total / limit) }
    });
  } catch (error) {
    console.error('Admin Users Error:', error);
    res.status(500).json({ error: 'Could not load user accounts.' });
  }
});

app.patch('/api/admin/users/:id/status', auth, requireAdmin, async (req, res) => {
  try {
    const targetId = Number(req.params.id);
    const status = String(req.body.status || '').trim();
    if (!Number.isInteger(targetId) || targetId <= 0) return res.status(400).json({ error: 'Invalid user ID.' });
    if (!['active', 'suspended', 'banned'].includes(status)) return res.status(400).json({ error: 'Status must be active, suspended or banned.' });
    if (targetId === req.user.id) return res.status(400).json({ error: 'You cannot change your own account status.' });

    await db.execute(`BEGIN`);
    let result;
    try {
      const targetResult = await db.execute({ sql: `SELECT id, name, student_id, role, account_status FROM users WHERE id = ?`, args: [targetId] });
      const target = targetResult.rows[0];
      if (!target) { await db.execute(`ROLLBACK`); return res.status(404).json({ error: 'User not found.' }); }
      if (target.account_status === status) { await db.execute(`ROLLBACK`); return res.json({ ok: true, message: 'Account status is already set to this value.', user: target }); }
      if (target.role === 'admin' && target.account_status === 'active' && status !== 'active' && await getActiveAdminCount() <= 1) { await db.execute(`ROLLBACK`); return res.status(409).json({ error: 'You cannot suspend or ban the last active Admin.' }); }

      await db.execute({ sql: `UPDATE users SET account_status = ? WHERE id = ?`, args: [status, targetId] });
      await writeAdminLog(req.user.id, targetId, 'user_status_changed', { from: target.account_status, to: status });
      result = { ...target, account_status: status };
      await db.execute(`COMMIT`);
    } catch (e) {
      await db.execute(`ROLLBACK`);
      throw e;
    }

    res.json({ ok: true, message: 'Account status updated.', user: result });
  } catch (error) {
    console.error('Admin Update Status Error:', error);
    res.status(500).json({ error: 'Could not update account status.' });
  }
});

app.patch('/api/admin/users/:id/role', auth, requireAdmin, async (req, res) => {
  try {
    const targetId = Number(req.params.id);
    const role = String(req.body.role || '').trim();
    if (!Number.isInteger(targetId) || targetId <= 0) return res.status(400).json({ error: 'Invalid user ID.' });
    if (!['student', 'admin'].includes(role)) return res.status(400).json({ error: 'Role must be student or admin.' });
    if (targetId === req.user.id) return res.status(400).json({ error: 'You cannot change your own role.' });

    await db.execute(`BEGIN`);
    let result;
    try {
      const targetResult = await db.execute({ sql: `SELECT id, name, student_id, role, account_status FROM users WHERE id = ?`, args: [targetId] });
      const target = targetResult.rows[0];
      if (!target) { await db.execute(`ROLLBACK`); return res.status(404).json({ error: 'User not found.' }); }
      if (target.role === role) { await db.execute(`ROLLBACK`); return res.json({ ok: true, message: 'User already has this role.', user: target }); }
      if (role === 'admin' && await getTotalAdminCount() >= MAX_ADMINS) { await db.execute(`ROLLBACK`); return res.status(409).json({ error: `CampusPool can have a maximum of ${MAX_ADMINS} Admins.` }); }
      if (role === 'student' && target.role === 'admin' && target.account_status === 'active' && await getActiveAdminCount() <= 1) { await db.execute(`ROLLBACK`); return res.status(409).json({ error: 'You cannot remove the last active Admin.' }); }

      await db.execute({ sql: `UPDATE users SET role = ? WHERE id = ?`, args: [role, targetId] });
      await writeAdminLog(req.user.id, targetId, 'user_role_changed', { from: target.role, to: role });
      result = { ...target, role };
      await db.execute(`COMMIT`);
    } catch (e) {
      await db.execute(`ROLLBACK`);
      throw e;
    }

    res.json({ ok: true, message: 'User role updated.', user: result, admin_capacity: { current: await getTotalAdminCount(), maximum: MAX_ADMINS } });
  } catch (error) {
    console.error('Admin Update Role Error:', error);
    res.status(500).json({ error: 'Could not update user role.' });
  }
});

app.get('/api/admin/rides', auth, requireAdmin, async (req, res) => {
  try {
    const q = String(req.query.q || '').trim().slice(0, 100);
    const status = String(req.query.status || '').trim();
    const page = Math.max(1, Number.parseInt(req.query.page, 10) || 1);
    const limit = Math.min(50, Math.max(1, Number.parseInt(req.query.limit, 10) || 20));
    const offset = (page - 1) * limit;
    const conditions = [];
    const params = [];

    if (q) {
      conditions.push(`(r.from_location LIKE ? OR r.to_location LIKE ? OR u.name LIKE ? OR u.student_id LIKE ? OR CAST(r.id AS TEXT) LIKE ?)`);
      params.push(`%${q}%`, `%${q}%`, `%${q}%`, `%${q}%`, `%${q}%`);
    }
    if (['open', 'full', 'expired', 'cancelled'].includes(status)) { conditions.push('r.status = ?'); params.push(status); }

    const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';
    
    const totalResult = await db.execute({ sql: `SELECT COUNT(*) AS total FROM rides r JOIN users u ON u.id = r.owner_id ${where}`, args: params });
    const total = totalResult.rows[0].total;
    
    const ridesResult = await db.execute({ sql: `
      SELECT r.*, u.name AS driver_name, u.student_id AS driver_student_id, u.phone1 AS driver_phone,
        (SELECT COUNT(*) FROM bookings b WHERE b.ride_id = r.id) AS total_bookings,
        (SELECT COUNT(*) FROM bookings b WHERE b.ride_id = r.id AND b.status = 'pending') AS pending_bookings,
        (SELECT COALESCE(SUM(b.seats), 0) FROM bookings b WHERE b.ride_id = r.id AND b.status = 'confirmed') AS booked_seats
      FROM rides r JOIN users u ON u.id = r.owner_id ${where} ORDER BY r.created_at DESC, r.id DESC LIMIT ? OFFSET ?
    `, args: [...params, limit, offset] });

    res.json({ rides: ridesResult.rows, pagination: { page, limit, total, pages: Math.ceil(total / limit) } });
  } catch (error) {
    console.error('Admin Rides Error:', error);
    res.status(500).json({ error: 'Could not load rides.' });
  }
});

app.patch('/api/admin/rides/:id/status', auth, requireAdmin, async (req, res) => {
  try {
    const rideId = Number(req.params.id);
    const status = String(req.body.status || '').trim();
    if (!Number.isInteger(rideId) || rideId <= 0) return res.status(400).json({ error: 'Invalid ride ID.' });
    if (!['open', 'cancelled'].includes(status)) return res.status(400).json({ error: 'Ride status must be open or cancelled.' });

    await db.execute(`BEGIN`);
    let result;
    try {
      const rideResult = await db.execute({ sql: `SELECT * FROM rides WHERE id = ?`, args: [rideId] });
      const ride = rideResult.rows[0];
      if (!ride) { await db.execute(`ROLLBACK`); return res.status(404).json({ error: 'Ride not found.' }); }
      if (ride.status === status) { await db.execute(`ROLLBACK`); return res.json({ ok: true, message: 'Ride already has this status.', ride }); }

      if (status === 'open') {
        const confirmedResult = await db.execute({ sql: `SELECT COALESCE(SUM(seats), 0) AS total FROM bookings WHERE ride_id = ? AND status = 'confirmed'`, args: [rideId] });
        const confirmedSeats = confirmedResult.rows[0].total;
        const departureTime = new Date(ride.departure_at).getTime();
        if (!Number.isFinite(departureTime) || departureTime <= Date.now()) { await db.execute(`ROLLBACK`); return res.status(409).json({ error: 'A past ride cannot be reopened.' }); }
        if (confirmedSeats >= ride.seats_total) { await db.execute(`ROLLBACK`); return res.status(409).json({ error: 'This ride has no available seats.' }); }
      }

      if (status === 'cancelled') {
        const affectedResult = await db.execute({ sql: `SELECT id, passenger_id, status FROM bookings WHERE ride_id = ? AND status IN ('pending', 'confirmed')`, args: [rideId] });
        await db.execute({ sql: `UPDATE bookings SET status = 'cancelled' WHERE ride_id = ? AND status IN ('pending', 'confirmed')`, args: [rideId] });
        for (const booking of affectedResult.rows) {
          await createAdminNotification({ userId: booking.passenger_id, type: 'booking_cancelled', title: 'Ride Cancelled', message: `Ride #${rideId} has been cancelled by CampusPool Admin.`, bookingId: booking.id });
        }
      }

      await db.execute({ sql: `UPDATE rides SET status = ? WHERE id = ?`, args: [status, rideId] });
      await writeAdminLog(req.user.id, ride.owner_id, 'ride_status_changed', { ride_id: rideId, from: ride.status, to: status });
      result = { ...ride, status };
      await db.execute(`COMMIT`);
    } catch (e) {
      await db.execute(`ROLLBACK`);
      throw e;
    }

    res.json({ ok: true, message: 'Ride status updated.', ride: result });
  } catch (error) {
    console.error('Admin Ride Status Error:', error);
    res.status(500).json({ error: 'Could not update ride status.' });
  }
});

app.get('/api/admin/bookings', auth, requireAdmin, async (req, res) => {
  try {
    const q = String(req.query.q || '').trim().slice(0, 100);
    const status = String(req.query.status || '').trim();
    const page = Math.max(1, Number.parseInt(req.query.page, 10) || 1);
    const limit = Math.min(50, Math.max(1, Number.parseInt(req.query.limit, 10) || 20));
    const offset = (page - 1) * limit;
    const conditions = [];
    const params = [];

    if (q) {
      conditions.push(`(driver.name LIKE ? OR passenger.name LIKE ? OR driver.student_id LIKE ? OR passenger.student_id LIKE ? OR r.from_location LIKE ? OR r.to_location LIKE ? OR CAST(b.id AS TEXT) LIKE ?)`);
      params.push(`%${q}%`, `%${q}%`, `%${q}%`, `%${q}%`, `%${q}%`, `%${q}%`, `%${q}%`);
    }
    if (['pending', 'confirmed', 'rejected', 'cancelled'].includes(status)) { conditions.push('b.status = ?'); params.push(status); }

    const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';
    const joins = `FROM bookings b JOIN rides r ON r.id = b.ride_id JOIN users driver ON driver.id = r.owner_id JOIN users passenger ON passenger.id = b.passenger_id`;
    
    const totalResult = await db.execute({ sql: `SELECT COUNT(*) AS total ${joins} ${where}`, args: params });
    const total = totalResult.rows[0].total;
    
    const bookingsResult = await db.execute({ sql: `
      SELECT b.*, r.from_location, r.to_location, r.departure_at, r.vehicle, r.fare_per_person, r.seats_total, r.status AS ride_status,
        driver.id AS driver_id, driver.name AS driver_name, driver.student_id AS driver_student_id,
        passenger.id AS passenger_id, passenger.name AS passenger_name, passenger.student_id AS passenger_student_id, passenger.department AS passenger_department
      ${joins} ${where} ORDER BY b.created_at DESC, b.id DESC LIMIT ? OFFSET ?
    `, args: [...params, limit, offset] });

    res.json({ bookings: bookingsResult.rows, pagination: { page, limit, total, pages: Math.ceil(total / limit) } });
  } catch (error) {
    console.error('Admin Bookings Error:', error);
    res.status(500).json({ error: 'Could not load bookings.' });
  }
});

app.patch('/api/admin/bookings/:id/status', auth, requireAdmin, async (req, res) => {
  try {
    const bookingId = Number(req.params.id);
    const status = String(req.body.status || '').trim();
    if (!Number.isInteger(bookingId) || bookingId <= 0) return res.status(400).json({ error: 'Invalid booking ID.' });
    if (!['confirmed', 'rejected', 'cancelled'].includes(status)) return res.status(400).json({ error: 'Invalid booking status.' });

    await db.execute(`BEGIN`);
    let result;
    try {
      const bookingResult = await db.execute({ sql: `SELECT b.*, r.owner_id, r.status AS ride_status, r.departure_at, r.seats_total FROM bookings b JOIN rides r ON r.id = b.ride_id WHERE b.id = ?`, args: [bookingId] });
      const booking = bookingResult.rows[0];
      if (!booking) { await db.execute(`ROLLBACK`); return res.status(404).json({ error: 'Booking not found.' }); }
      if (booking.status === status) { await db.execute(`ROLLBACK`); return res.json({ ok: true, message: 'Booking already has this status.', booking }); }
      if (booking.status === 'rejected' || booking.status === 'cancelled') { await db.execute(`ROLLBACK`); return res.status(409).json({ error: 'Rejected or cancelled bookings cannot be changed.' }); }
      if (booking.status === 'confirmed' && status !== 'cancelled') { await db.execute(`ROLLBACK`); return res.status(409).json({ error: 'A confirmed booking can only be cancelled.' }); }

      if (status === 'confirmed') {
        if (booking.ride_status !== 'open') { await db.execute(`ROLLBACK`); return res.status(409).json({ error: 'This ride is not open for booking.' }); }
        const departureTime = new Date(booking.departure_at).getTime();
        if (!Number.isFinite(departureTime) || departureTime <= Date.now()) { await db.execute(`ROLLBACK`); return res.status(409).json({ error: 'A past ride cannot be confirmed.' }); }
        const confirmedResult = await db.execute({ sql: `SELECT COALESCE(SUM(seats), 0) AS total FROM bookings WHERE ride_id = ? AND status = 'confirmed'`, args: [booking.ride_id] });
        if (confirmedResult.rows[0].total + booking.seats > booking.seats_total) { await db.execute(`ROLLBACK`); return res.status(409).json({ error: 'Not enough seats are available.' }); }
      }

      await db.execute({ sql: `UPDATE bookings SET status = ? WHERE id = ?`, args: [status, bookingId] });
      const newConfirmedResult = await db.execute({ sql: `SELECT COALESCE(SUM(seats), 0) AS total FROM bookings WHERE ride_id = ? AND status = 'confirmed'`, args: [booking.ride_id] });
      const newConfirmedSeats = newConfirmedResult.rows[0].total;

      if (newConfirmedSeats >= booking.seats_total) {
        await db.execute({ sql: `UPDATE rides SET status = 'full' WHERE id = ? AND status = 'open'`, args: [booking.ride_id] });
      } else if (status === 'cancelled') {
        const departureTime = new Date(booking.departure_at).getTime();
        if (Number.isFinite(departureTime) && departureTime > Date.now()) {
          await db.execute({ sql: `UPDATE rides SET status = 'open' WHERE id = ? AND status = 'full'`, args: [booking.ride_id] });
        }
      }

      const notificationText = { confirmed: 'Your booking has been confirmed by CampusPool Admin.', rejected: 'Your booking has been rejected by CampusPool Admin.', cancelled: 'Your booking has been cancelled by CampusPool Admin.' };
      await createAdminNotification({ userId: booking.passenger_id, type: `booking_${status}`, title: `Booking ${status.charAt(0).toUpperCase() + status.slice(1)}`, message: notificationText[status], bookingId });
      if (booking.owner_id !== booking.passenger_id) {
        await createAdminNotification({ userId: booking.owner_id, type: `booking_${status}`, title: `Booking ${status.charAt(0).toUpperCase() + status.slice(1)}`, message: `Booking #${bookingId} has been ${status} by CampusPool Admin.`, bookingId });
      }

      await writeAdminLog(req.user.id, booking.passenger_id, 'booking_status_changed', { booking_id: bookingId, ride_id: booking.ride_id, from: booking.status, to: status });
      result = { ...booking, status };
      await db.execute(`COMMIT`);
    } catch (e) {
      await db.execute(`ROLLBACK`);
      throw e;
    }

    res.json({ ok: true, message: 'Booking status updated.', booking: result });
  } catch (error) {
    console.error('Admin Booking Status Error:', error);
    res.status(500).json({ error: 'Could not update booking status.' });
  }
});

app.get('/api/admin/sos', auth, requireAdmin, async (req, res) => {
  try {
    const status = String(req.query.status || '').trim();
    const allowedStatuses = ['active', 'resolved'];
    if (status && !allowedStatuses.includes(status)) return res.status(400).json({ error: 'Status must be active or resolved.' });

    const bookingConditions = status ? 'WHERE ea.status = ?' : '';
    const independentConditions = status ? 'WHERE eca.status = ?' : '';

    const bookingResult = await db.execute({ sql: `
      SELECT ea.id, 'booking' AS alert_type, ea.status, ea.message, ea.latitude, ea.longitude, ea.created_at, ea.resolved_at, ea.booking_id,
        ea.triggered_by AS sender_id, sender.name AS sender_name, sender.student_id AS sender_student_id,
        b.passenger_id, passenger.name AS passenger_name, r.owner_id AS driver_id, driver.name AS driver_name, r.from_location, r.to_location, r.departure_at
      FROM emergency_alerts ea JOIN bookings b ON b.id = ea.booking_id JOIN users sender ON sender.id = ea.triggered_by
      JOIN users passenger ON passenger.id = b.passenger_id JOIN rides r ON r.id = b.ride_id JOIN users driver ON driver.id = r.owner_id
      ${bookingConditions} ORDER BY ea.created_at DESC, ea.id DESC
    `, args: status ? [status] : [] });

    const independentResult = await db.execute({ sql: `
      SELECT eca.id, 'independent' AS alert_type, eca.status, eca.message, eca.latitude, eca.longitude, eca.created_at, eca.resolved_at,
        NULL AS booking_id, eca.sender_id, sender.name AS sender_name, sender.student_id AS sender_student_id,
        NULL AS passenger_id, NULL AS passenger_name, NULL AS driver_id, NULL AS driver_name, NULL AS from_location, NULL AS to_location, NULL AS departure_at
      FROM emergency_contact_alerts eca JOIN users sender ON sender.id = eca.sender_id
      ${independentConditions} ORDER BY eca.created_at DESC, eca.id DESC
    `, args: status ? [status] : [] });

    const alerts = [...bookingResult.rows, ...independentResult.rows].sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
    res.json({ alerts, total: alerts.length, active: alerts.filter(a => a.status === 'active').length, resolved: alerts.filter(a => a.status === 'resolved').length });
  } catch (error) {
    console.error('Admin SOS Error:', error);
    res.status(500).json({ error: 'Could not load SOS alerts.' });
  }
});

app.patch('/api/admin/sos/:id/resolve', auth, requireAdmin, async (req, res) => {
  try {
    const alertId = Number(req.params.id);
    if (!Number.isInteger(alertId) || alertId <= 0) return res.status(400).json({ error: 'Invalid SOS ID.' });

    await db.execute(`BEGIN`);
    let result;
    try {
      const alertResult = await db.execute({ sql: `SELECT ea.*, b.passenger_id, r.owner_id FROM emergency_alerts ea JOIN bookings b ON b.id = ea.booking_id JOIN rides r ON r.id = b.ride_id WHERE ea.id = ?`, args: [alertId] });
      const alert = alertResult.rows[0];
      if (!alert) { await db.execute(`ROLLBACK`); return res.status(404).json({ error: 'SOS alert not found.' }); }
      if (alert.status === 'resolved') { await db.execute(`ROLLBACK`); return res.json({ ok: true, message: 'SOS alert is already resolved.', alert }); }

      await db.execute({ sql: `UPDATE emergency_alerts SET status = 'resolved', resolved_at = CURRENT_TIMESTAMP WHERE id = ?`, args: [alertId] });
      const recipients = new Set([alert.triggered_by, alert.passenger_id, alert.owner_id]);

      for (const userId of recipients) {
        await createAdminNotification({ userId, type: 'sos_resolved', title: 'SOS Alert Resolved', message: `SOS alert #${alertId} has been marked resolved by CampusPool Admin.`, bookingId: alert.booking_id, sosId: alertId });
      }

      await writeAdminLog(req.user.id, alert.triggered_by, 'booking_sos_resolved', { sos_id: alertId, booking_id: alert.booking_id });
      result = { ...alert, status: 'resolved' };
      await db.execute(`COMMIT`);
    } catch (e) {
      await db.execute(`ROLLBACK`);
      throw e;
    }

    res.json({ ok: true, message: 'SOS alert resolved successfully.', alert: result });
  } catch (error) {
    console.error('Admin Resolve Booking SOS Error:', error);
    res.status(500).json({ error: 'Could not resolve SOS alert.' });
  }
});

app.patch('/api/admin/independent-sos/:id/resolve', auth, requireAdmin, async (req, res) => {
  try {
    const alertId = Number(req.params.id);
    if (!Number.isInteger(alertId) || alertId <= 0) return res.status(400).json({ error: 'Invalid SOS ID.' });

    await db.execute(`BEGIN`);
    let result;
    try {
      const alertResult = await db.execute({ sql: `SELECT * FROM emergency_contact_alerts WHERE id = ?`, args: [alertId] });
      const alert = alertResult.rows[0];
      if (!alert) { await db.execute(`ROLLBACK`); return res.status(404).json({ error: 'SOS alert not found.' }); }
      if (alert.status === 'resolved') { await db.execute(`ROLLBACK`); return res.json({ ok: true, message: 'SOS alert is already resolved.', alert }); }

      await db.execute({ sql: `UPDATE emergency_contact_alerts SET status = 'resolved', resolved_at = CURRENT_TIMESTAMP WHERE id = ?`, args: [alertId] });
      await createAdminNotification({ userId: alert.sender_id, type: 'sos_resolved', title: 'SOS Alert Resolved', message: `Your emergency alert #${alertId} has been marked resolved by CampusPool Admin.`, emergencyAlertId: alertId });
      await writeAdminLog(req.user.id, alert.sender_id, 'independent_sos_resolved', { emergency_alert_id: alertId });
      result = { ...alert, status: 'resolved' };
      await db.execute(`COMMIT`);
    } catch (e) {
      await db.execute(`ROLLBACK`);
      throw e;
    }

    res.json({ ok: true, message: 'SOS alert resolved successfully.', alert: result });
  } catch (error) {
    console.error('Admin Resolve Independent SOS Error:', error);
    res.status(500).json({ error: 'Could not resolve SOS alert.' });
  }
});

app.get('/api/admin/activity-logs', auth, requireAdmin, async (req, res) => {
  try {
    const limit = Math.min(100, Math.max(1, Number.parseInt(req.query.limit, 10) || 30));
    const result = await db.execute({ sql: `
      SELECT l.id, l.action, l.details, l.created_at, actor.name AS actor_name, actor.student_id AS actor_student_id, target.name AS target_name, target.student_id AS target_student_id
      FROM admin_activity_logs l LEFT JOIN users actor ON actor.id = l.actor_user_id LEFT JOIN users target ON target.id = l.target_user_id
      ORDER BY l.id DESC LIMIT ?
    `, args: [limit] });
    res.json({ logs: result.rows });
  } catch (error) {
    console.error('Admin Activity Logs Error:', error);
    res.status(500).json({ error: 'Could not load admin activity logs.' });
  }
});

app.get('/api/admin/analytics', auth, requireAdmin, async (req, res) => {
  try {
    const dailyUsers = await db.execute(`SELECT COUNT(*) AS total FROM users WHERE date(created_at) = date('now')`);
    const dailyRides = await db.execute(`SELECT COUNT(*) AS total FROM rides WHERE date(created_at) = date('now')`);
    const dailyBookings = await db.execute(`SELECT COUNT(*) AS total FROM bookings WHERE date(created_at) = date('now')`);

    const weeklyUsers = await db.execute(`SELECT COUNT(*) AS total FROM users WHERE created_at >= datetime('now', '-7 days')`);
    const weeklyRides = await db.execute(`SELECT COUNT(*) AS total FROM rides WHERE created_at >= datetime('now', '-7 days')`);
    const weeklyBookings = await db.execute(`SELECT COUNT(*) AS total FROM bookings WHERE created_at >= datetime('now', '-7 days')`);

    const monthlyUsers = await db.execute(`SELECT COUNT(*) AS total FROM users WHERE created_at >= datetime('now', '-30 days')`);
    const monthlyRides = await db.execute(`SELECT COUNT(*) AS total FROM rides WHERE created_at >= datetime('now', '-30 days')`);
    const monthlyBookings = await db.execute(`SELECT COUNT(*) AS total FROM bookings WHERE created_at >= datetime('now', '-30 days')`);

    const getDailyGrowth = async (tableName) => {
      const allowedTables = ['users', 'rides', 'bookings'];
      if (!allowedTables.includes(tableName)) throw new Error('Invalid analytics table.');
      const result = await db.execute(`SELECT date(created_at) AS date, COUNT(*) AS total FROM ${tableName} WHERE created_at >= datetime('now', '-29 days') GROUP BY date(created_at) ORDER BY date(created_at) ASC`);
      return result.rows;
    };

    const sosBooking = await db.execute(`SELECT COUNT(*) AS total, SUM(CASE WHEN status = 'active' THEN 1 ELSE 0 END) AS active, SUM(CASE WHEN status = 'resolved' THEN 1 ELSE 0 END) AS resolved FROM emergency_alerts`);
    const sosIndependent = await db.execute(`SELECT COUNT(*) AS total, SUM(CASE WHEN status = 'active' THEN 1 ELSE 0 END) AS active, SUM(CASE WHEN status = 'resolved' THEN 1 ELSE 0 END) AS resolved FROM emergency_contact_alerts`);

    const recentActivities = await db.execute({ sql: `
      SELECT l.id, l.action, l.details, l.created_at, actor.name AS actor_name, target.name AS target_name
      FROM admin_activity_logs l LEFT JOIN users actor ON actor.id = l.actor_user_id LEFT JOIN users target ON target.id = l.target_user_id
      ORDER BY l.id DESC LIMIT 10
    ` });

    const b = sosBooking.rows[0];
    const i = sosIndependent.rows[0];

    res.json({
      success: true,
      statistics: { 
        daily: { users: dailyUsers.rows[0].total, rides: dailyRides.rows[0].total, bookings: dailyBookings.rows[0].total },
        weekly: { users: weeklyUsers.rows[0].total, rides: weeklyRides.rows[0].total, bookings: weeklyBookings.rows[0].total },
        monthly: { users: monthlyUsers.rows[0].total, rides: monthlyRides.rows[0].total, bookings: monthlyBookings.rows[0].total }
      },
      growth: { users: await getDailyGrowth('users'), rides: await getDailyGrowth('rides'), bookings: await getDailyGrowth('bookings') },
      sos: {
        booking: { total: b.total || 0, active: b.active || 0, resolved: b.resolved || 0 },
        independent: { total: i.total || 0, active: i.active || 0, resolved: i.resolved || 0 },
        total: (b.total || 0) + (i.total || 0),
        active: (b.active || 0) + (i.active || 0),
        resolved: (b.resolved || 0) + (i.resolved || 0)
      },
      recent_activities: recentActivities.rows,
      admin_capacity: { current: await getTotalAdminCount(), maximum: MAX_ADMINS }
    });
  } catch (error) {
    console.error('Admin Analytics Error:', error);
    res.status(500).json({ error: 'Could not load admin analytics.' });
  }
});

// ======================================
// CENTRAL ERROR HANDLER
// ======================================
app.use((err, _req, res, _next) => {
  console.error(err);
  res.status(500).json({ error: 'Unexpected server error.' });
});

// ======================================
// START SERVER (ONLY AFTER DB IS READY)
// ======================================
const startServer = async () => {
  try {
    console.log("Initializing Turso Database tables...");
    // db.js থেকে initDatabase ফাংশনটা কল করতে হবে
    const { initDatabase } = require('./db');
    await initDatabase(); 
    
    app.listen(PORT, () => {
      console.log(`CampusPool API ready: http://localhost:${PORT}`);
    });
  } catch (error) {
    console.error("Failed to start server due to database error:", error);
  }
};

startServer();
