const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const path = require('path');

require('dotenv').config({
  path: path.join(__dirname, '..', '.env')
});

const db = require('./db');
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

function auth(req, res, next) {
  const header = req.headers.authorization || '';
  const token = header.startsWith('Bearer ') ? header.slice(7) : '';

  if (!token) return res.status(401).json({ error: 'Sign in required.' });

  try {
    const payload = jwt.verify(token, JWT_SECRET);
    const currentUser = db.prepare(`SELECT id, student_id, role, account_status, is_verified FROM users WHERE id = ?`).get(payload.id);

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

function getActiveAdminCount() {
  return db.prepare(`SELECT COUNT(*) AS total FROM users WHERE role = 'admin' AND account_status = 'active'`).get().total;
}

function getTotalAdminCount() {
  return db.prepare(`SELECT COUNT(*) AS total FROM users WHERE role = 'admin'`).get().total;
}

function writeAdminLog(actorId, targetId, action, details = null) {
  db.prepare(`INSERT INTO admin_activity_logs (actor_user_id, target_user_id, action, details) VALUES (?, ?, ?, ?)`).run(actorId, targetId, action, details == null ? null : JSON.stringify(details));
}

function createAdminNotification({ userId, type, title, message, bookingId = null, sosId = null, emergencyAlertId = null }) {
  if (!userId) return;
  db.prepare(`INSERT INTO notifications (user_id, type, title, message, booking_id, sos_id, emergency_alert_id) VALUES (?, ?, ?, ?, ?, ?, ?)`).run(userId, type, title, message, bookingId, sosId, emergencyAlertId);
}

function expireOldRides() {
  db.prepare(`UPDATE rides SET status = 'expired' WHERE status = 'open' AND datetime(departure_at, '+10 minutes') < datetime('now')`).run();
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
    const info = db.prepare(`INSERT INTO users (name, student_id, department, password_hash, university, gender) VALUES (?, ?, ?, ?, ?, ?)`).run(name, studentId, department, passwordHash, UNIVERSITY, gender);
    const user = db.prepare(`SELECT id, name, student_id, department, university, profile_picture, gender, gender_verified, role, account_status, created_at FROM users WHERE id = ?`).get(info.lastInsertRowid);

    res.status(201).json({ token: signToken(user), user });
  } catch (e) {
    if (String(e.code) === 'SQLITE_CONSTRAINT_UNIQUE') return res.status(409).json({ error: 'That Student ID already has an account.' });
    console.error(e);
    res.status(500).json({ error: 'Could not create account.' });
  }
});

app.post('/api/auth/login', async (req, res) => {
  try {
    const studentId = String(req.body.studentId || '').trim();
    const password = String(req.body.password || '');
    const user = db.prepare(`SELECT * FROM users WHERE student_id = ? COLLATE NOCASE`).get(studentId);

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

app.get('/api/me', auth, (req, res) => {
  const user = db.prepare(`SELECT id, name, student_id, department, university, profile_picture, phone1, phone2, student_card, role, account_status, is_verified, created_at FROM users WHERE id = ?`).get(req.user.id);
  if (!user) return res.status(404).json({ error: 'Account not found.' });

  const verificationScore = calculateProfileScore(user);
  res.json({ user: { ...user, verification_score: verificationScore, can_book: verificationScore >= 90 } });
});

app.patch('/api/me/profile', auth, (req, res) => {
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
      db.prepare(`UPDATE users SET name = ?, department = ?, phone1 = ?, phone2 = ?, student_card = ? WHERE id = ?`).run(name, department, phone1, phone2, studentCard, req.user.id);
    } else {
      db.prepare(`UPDATE users SET name = ?, department = ?, phone1 = ?, phone2 = ? WHERE id = ?`).run(name, department, phone1, phone2, req.user.id);
    }
    res.json({ ok: true, message: 'Profile information updated successfully.' });
  } catch (error) {
    console.error('Profile Update Error:', error);
    res.status(500).json({ error: 'Could not update profile information.' });
  }
});

app.patch('/api/me/profile-picture', auth, (req, res) => {
  const picture = req.body.profile_picture;
  if (typeof picture !== 'string' || !/^data:image\/(jpeg|png|webp);base64,/.test(picture)) return res.status(400).json({ error: 'Please provide a valid JPG, PNG or WEBP image.' });
  if (picture.length > 2800000) return res.status(400).json({ error: 'Profile picture is too large. Maximum size is approximately 2 MB.' });

  db.prepare(`UPDATE users SET profile_picture = ? WHERE id = ?`).run(picture, req.user.id);
  res.json({ message: 'Profile picture updated successfully.', profile_picture: picture });
});

// ======================================
// STUDENT CARD VERIFICATION
// ======================================

app.patch('/api/me/verify', auth, (req, res) => {
  try {
    const { student_card, extracted_text } = req.body;

    if (!student_card || !extracted_text) {
      return res.status(400).json({ error: 'Missing card image or text.' });
    }

    // টেক্সট থেকে স্পেস এবং বিশেষ চিহ্ন সরানো
    const cleanExtracted = extracted_text.toUpperCase().replace(/\s/g, '');
    const cleanLoggedId = String(req.user.studentId).replace(/\s/g, '');

    // ১. চেক করা: ছবিতে ইউনিভার্সিটির নাম আছে কি না
    const expectedUnivName = "NORTHERNUNIVERSITY";
    if (!cleanExtracted.includes(expectedUnivName)) {
      return res.status(400).json({ error: 'Verification Failed: Not a Northern University ID card.' });
    }

    // ২. চেক করা: ছবিতে লগইন করা Student ID আছে কি না
    if (!cleanExtracted.includes(cleanLoggedId)) {
      return res.status(400).json({ error: 'Verification Failed: The Student ID on the card does not match your login ID.' });
    }

    // ৩. সব ঠিক থাকলে ইউজারকে ভেরিফাইড মার্ক করা
    db.prepare(`UPDATE users SET is_verified = 1, student_card = ? WHERE id = ?`).run(student_card, req.user.id);
    
    res.json({ ok: true, message: '✅ Student ID Verified Successfully!' });
  } catch (error) {
    console.error('Verify Error:', error);
    res.status(500).json({ error: 'Could not verify user.' });
  }
});

// ======================================
// RIDE ROUTES
// ======================================

app.get('/api/rides', auth, (req, res) => {
  expireOldRides();
  const from = `%${String(req.query.from || '').trim()}%`;
  const to = `%${String(req.query.to || '').trim()}%`;

  const rides = db.prepare(`
    SELECT r.*, u.name AS driver_name, u.student_id AS driver_student_id, u.department AS driver_department,
      (SELECT COUNT(*) FROM bookings b WHERE b.ride_id = r.id AND b.status = 'pending') AS pending_requests,
      (SELECT COALESCE(SUM(b.seats), 0) FROM bookings b WHERE b.ride_id = r.id AND b.status = 'confirmed') AS seats_booked
    FROM rides r JOIN users u ON u.id = r.owner_id
    WHERE r.status = 'open' AND lower(r.from_location) LIKE lower(?) AND lower(r.to_location) LIKE lower(?)
      AND (r.female_only = 0 OR EXISTS (SELECT 1 FROM users current_user WHERE current_user.id = ? AND current_user.gender = 'Female'))
    ORDER BY r.departure_at ASC
  `).all(from, to, req.user.id);

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

app.post('/api/rides', auth, (req, res) => {
  try {
    // ভেরিফিকেশন চেক
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

    const currentUser = db.prepare(`SELECT gender FROM users WHERE id = ?`).get(req.user.id);
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

    const info = db.prepare(`
      INSERT INTO rides (owner_id, from_location, to_location, departure_at, vehicle, seats_total, fare_per_person, female_only, total_fare, total_passengers)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(req.user.id, from, to, date.toISOString(), vehicle, availableSeats, farePerPerson, femaleOnly, totalFare, totalPassengers);

    const ride = db.prepare(`SELECT * FROM rides WHERE id = ?`).get(info.lastInsertRowid);
    res.status(201).json({ ride });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: 'Could not post ride.' });
  }
});

app.patch('/api/rides/:id/cancel', auth, (req, res) => {
  try {
    const rideId = Number(req.params.id);
    const ride = db.prepare(`SELECT id, owner_id, status, from_location, to_location FROM rides WHERE id = ?`).get(rideId);

    if (!ride) return res.status(404).json({ error: 'Ride not found.' });
    if (ride.owner_id !== req.user.id) return res.status(403).json({ error: 'Only the ride owner can cancel this ride.' });
    if (ride.status !== 'open') return res.status(409).json({ error: 'Only open rides can be cancelled.' });

    db.transaction(() => {
      const passengers = db.prepare(`SELECT DISTINCT passenger_id FROM bookings WHERE ride_id = ? AND status IN ('pending', 'confirmed')`).all(rideId);
      db.prepare(`UPDATE rides SET status = 'cancelled' WHERE id = ? AND owner_id = ? AND status = 'open'`).run(rideId, req.user.id);
      db.prepare(`UPDATE bookings SET status = 'cancelled' WHERE ride_id = ? AND status IN ('pending', 'confirmed')`).run(rideId);

      const addNotification = db.prepare(`INSERT INTO notifications (user_id, type, title, message, booking_id) VALUES (?, ?, ?, ?, ?)`);
      for (const passenger of passengers) {
        addNotification.run(passenger.passenger_id, 'ride_cancelled', 'Ride Cancelled', `The ride from ${ride.from_location} to ${ride.to_location} has been cancelled by the ride owner.`, null);
      }
    })();

    res.json({ ok: true, message: 'Ride cancelled successfully.' });
  } catch (error) {
    console.error('Ride Cancellation Error:', error);
    res.status(500).json({ error: 'Could not cancel this ride.' });
  }
});

// ======================================
// BOOKING ROUTES
// ======================================

app.post('/api/rides/:id/bookings', auth, (req, res) => {
  try {
    // ভেরিফিকেশন চেক
    if (!req.user.isVerified) {
      return res.status(403).json({ error: 'Your account is not verified. Please upload a valid Student ID card in your profile to verify.' });
    }

    const profile = db.prepare(`SELECT profile_picture, student_card, phone1, phone2, department FROM users WHERE id = ?`).get(req.user.id);
    if (calculateProfileScore(profile || {}) < 90) return res.status(403).json({ error: 'Complete at least 90% of your profile before requesting a ride.' });

    expireOldRides();
    const ride = db.prepare(`SELECT * FROM rides WHERE id = ? AND status = 'open'`).get(Number(req.params.id));

    if (!ride) return res.status(404).json({ error: 'Ride not found or no longer open.' });
    if (ride.female_only === 1) {
      const currentUser = db.prepare(`SELECT gender FROM users WHERE id = ?`).get(req.user.id);
      if (currentUser?.gender !== 'Female') return res.status(403).json({ error: 'This ride is available only for female students.' });
    }
    if (ride.owner_id === req.user.id) return res.status(400).json({ error: 'You cannot request your own ride.' });

    const seats = Number(req.body.seats || 1);
    if (!Number.isInteger(seats) || seats < 1 || seats > ride.seats_total) return res.status(400).json({ error: `Choose between 1 and ${ride.seats_total} seats.` });

    const booked = db.prepare(`SELECT COALESCE(SUM(seats), 0) AS n FROM bookings WHERE ride_id = ? AND status = 'confirmed'`).get(ride.id).n;
    if (booked + seats > ride.seats_total) return res.status(409).json({ error: 'Not enough seats available.' });

    const info = db.prepare(`INSERT INTO bookings (ride_id, passenger_id, seats) VALUES (?, ?, ?)`).run(ride.id, req.user.id, seats);
    res.status(201).json({ booking: db.prepare(`SELECT * FROM bookings WHERE id = ?`).get(info.lastInsertRowid) });
  } catch (e) {
    if (String(e.code) === 'SQLITE_CONSTRAINT_UNIQUE') return res.status(409).json({ error: 'You already requested this ride.' });
    console.error(e);
    res.status(500).json({ error: 'Could not request this ride.' });
  }
});

app.get('/api/bookings', auth, (req, res) => {
  const rows = db.prepare(`
    SELECT b.*, r.from_location, r.to_location, r.departure_at, r.vehicle, r.fare_per_person, r.total_fare, r.total_passengers, owner.name AS driver_name, passenger.name AS passenger_name, r.owner_id
    FROM bookings b JOIN rides r ON r.id = b.ride_id JOIN users owner ON owner.id = r.owner_id JOIN users passenger ON passenger.id = b.passenger_id
    WHERE r.owner_id = ? OR b.passenger_id = ? ORDER BY b.created_at DESC
  `).all(req.user.id, req.user.id);
  res.json({ bookings: rows });
});

app.patch('/api/bookings/:id', auth, (req, res) => {
  try {
    const booking = db.prepare(`SELECT b.*, r.owner_id, r.seats_total FROM bookings b JOIN rides r ON r.id = b.ride_id WHERE b.id = ?`).get(Number(req.params.id));
    if (!booking) return res.status(404).json({ error: 'Booking not found.' });
    if (booking.owner_id !== req.user.id) return res.status(403).json({ error: 'Only the ride owner can respond to this request.' });

    const status = String(req.body.status || '');
    if (!['confirmed', 'rejected'].includes(status)) return res.status(400).json({ error: 'Status must be confirmed or rejected.' });
    if (booking.status !== 'pending') return res.status(409).json({ error: 'This request has already been handled.' });

    if (status === 'confirmed') {
      const booked = db.prepare(`SELECT COALESCE(SUM(seats), 0) AS n FROM bookings WHERE ride_id = ? AND status = 'confirmed'`).get(booking.ride_id).n;
      if (booked + booking.seats > booking.seats_total) return res.status(409).json({ error: 'There are not enough seats left.' });
    }

    db.prepare(`UPDATE bookings SET status = ? WHERE id = ?`).run(status, booking.id);
    res.json({ booking: db.prepare(`SELECT * FROM bookings WHERE id = ?`).get(booking.id) });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: 'Could not update booking.' });
  }
});

app.get('/api/owner/rides', auth, (req, res) => {
  expireOldRides();
  const rides = db.prepare(`
    SELECT r.*, (SELECT COUNT(*) FROM bookings b WHERE b.ride_id = r.id AND b.status = 'pending') AS pending_requests, (SELECT COALESCE(SUM(b.seats), 0) FROM bookings b WHERE b.ride_id = r.id AND b.status = 'confirmed') AS seats_booked
    FROM rides r WHERE r.owner_id = ? ORDER BY r.created_at DESC
  `).all(req.user.id);

  res.json({ rides: rides.map(r => ({ ...r, seats_available: Math.max(0, r.seats_total - r.seats_booked), total_passengers: r.total_passengers || (r.seats_total + 1), total_fare: r.total_fare })) });
});

app.get('/api/users/:id', auth, (req, res) => {
  const userId = Number(req.params.id);
  if (!Number.isInteger(userId) || userId <= 0) return res.status(400).json({ error: 'Invalid user ID.' });
  const user = db.prepare(`SELECT id, name, student_id, department, university, profile_picture, created_at FROM users WHERE id = ?`).get(userId);
  if (!user) return res.status(404).json({ error: 'Student profile not found.' });
  res.json({ user });
});

// ======================================
// CHAT ROUTES
// ======================================

function getAuthorizedChatBooking(bookingId, userId) {
  return db.prepare(`SELECT b.id AS booking_id, b.ride_id, b.passenger_id, r.owner_id FROM bookings b JOIN rides r ON r.id = b.ride_id WHERE b.id = ? AND b.status = 'confirmed' AND (r.owner_id = ? OR b.passenger_id = ?)`).get(bookingId, userId, userId);
}

app.get('/api/messages', auth, (req, res) => {
  try {
    const conversations = db.prepare(`
      SELECT 
        b.id AS booking_id, 
        b.ride_id, 
        b.status AS booking_status, 
        r.from_location, 
        r.to_location, 
        r.departure_at,
        -- বন্ধুর আইডি এবং নাম
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
    `).all(
      req.user.id, req.user.id, req.user.id, req.user.id, req.user.id, req.user.id, req.user.id, req.user.id, req.user.id
    );

    // একই ইউজারের চ্যাটগুলোকে গ্রুপ করা
    const groupedConversations = [];
    const userMap = new Map();

    for (const conv of conversations) {
      const otherId = conv.other_user_id;

      if (!userMap.has(otherId)) {
        userMap.set(otherId, { ...conv, booking_ids: [conv.booking_id] });
        groupedConversations.push(userMap.get(otherId));
      } else {
        const existing = userMap.get(otherId);
        existing.booking_ids.push(conv.booking_id); // অন্য রাইডের বুকিং আইডি যুক্ত করা
        
        // যদি নতুন মেসেজের সময় বড় হয়, তবে লাস্ট মেসেজ আপডেট করা
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

app.get('/api/bookings/:id/messages', auth, (req, res) => {
  const bookingId = Number(req.params.id);
  if (!Number.isInteger(bookingId) || bookingId <= 0) return res.status(400).json({ error: 'Invalid booking ID.' });
  const booking = getAuthorizedChatBooking(bookingId, req.user.id);
  if (!booking) return res.status(403).json({ error: 'Chat is available only to confirmed ride participants.' });

  db.prepare(`UPDATE chat_messages SET read_at = CURRENT_TIMESTAMP WHERE booking_id = ? AND sender_id != ? AND read_at IS NULL`).run(bookingId, req.user.id);
  const messages = db.prepare(`
    SELECT m.id, m.booking_id, m.sender_id, m.message, m.created_at, m.read_at, u.name AS sender_name, CASE WHEN m.sender_id = ? THEN 1 ELSE 0 END AS is_mine
    FROM chat_messages m JOIN users u ON u.id = m.sender_id WHERE m.booking_id = ? ORDER BY m.id ASC LIMIT 200
  `).all(req.user.id, bookingId);
  res.json({ messages });
});

app.post('/api/bookings/:id/messages', auth, (req, res) => {
  try {
    const bookingId = Number(req.params.id);
    const message = String(req.body.message || '').trim();
    if (!Number.isInteger(bookingId) || bookingId <= 0) return res.status(400).json({ error: 'Invalid booking ID.' });
    if (!message || message.length > 500) return res.status(400).json({ error: 'Message must contain 1 to 500 characters.' });

    const booking = getAuthorizedChatBooking(bookingId, req.user.id);
    if (!booking) return res.status(403).json({ error: 'You are not allowed to send messages in this chat.' });

    const result = db.prepare(`INSERT INTO chat_messages (booking_id, sender_id, message) VALUES (?, ?, ?)`).run(bookingId, req.user.id, message);
    const savedMessage = db.prepare(`
      SELECT m.id, m.booking_id, m.sender_id, m.message, m.created_at, m.read_at, u.name AS sender_name, CASE WHEN m.sender_id = ? THEN 1 ELSE 0 END AS is_mine
      FROM chat_messages m JOIN users u ON u.id = m.sender_id WHERE m.id = ?
    `).get(req.user.id, result.lastInsertRowid);
    res.status(201).json({ message: savedMessage });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Could not send message.' });
  }
});

// ======================================
// LIVE LOCATION & SOS
// ======================================

app.put('/api/bookings/:id/location', auth, (req, res) => {
  try {
    const bookingId = Number(req.params.id);
    const latitude = Number(req.body.latitude);
    const longitude = Number(req.body.longitude);
    if (!Number.isInteger(bookingId) || bookingId <= 0) return res.status(400).json({ error: 'Invalid booking ID.' });
    if (!Number.isFinite(latitude) || !Number.isFinite(longitude) || latitude < -90 || latitude > 90 || longitude < -180 || longitude > 180) return res.status(400).json({ error: 'Valid latitude and longitude are required.' });

    const booking = getAuthorizedChatBooking(bookingId, req.user.id);
    if (!booking) return res.status(403).json({ error: 'Location sharing is available only to confirmed ride participants.' });

    db.prepare(`
      INSERT INTO live_location_shares (booking_id, user_id, latitude, longitude, sharing_enabled, updated_at)
      VALUES (?, ?, ?, ?, 1, CURRENT_TIMESTAMP)
      ON CONFLICT(booking_id, user_id) DO UPDATE SET latitude = excluded.latitude, longitude = excluded.longitude, sharing_enabled = 1, updated_at = CURRENT_TIMESTAMP
    `).run(bookingId, req.user.id, latitude, longitude);
    res.json({ ok: true, message: 'Live location sharing is active.' });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Could not update live location.' });
  }
});

app.get('/api/bookings/:id/location', auth, (req, res) => {
  try {
    const bookingId = Number(req.params.id);
    if (!Number.isInteger(bookingId) || bookingId <= 0) return res.status(400).json({ error: 'Invalid booking ID.' });
    const booking = getAuthorizedChatBooking(bookingId, req.user.id);
    if (!booking) return res.status(403).json({ error: 'Location is available only to confirmed ride participants.' });

    const otherUserId = booking.owner_id === req.user.id ? booking.passenger_id : booking.owner_id;
    const mySharing = db.prepare(`SELECT sharing_enabled FROM live_location_shares WHERE booking_id = ? AND user_id = ?`).get(bookingId, req.user.id);
    const otherLocation = db.prepare(`SELECT user_id, latitude, longitude, updated_at FROM live_location_shares WHERE booking_id = ? AND user_id = ? AND sharing_enabled = 1 AND datetime(updated_at) >= datetime('now', '-2 minutes')`).get(bookingId, otherUserId);

    res.json({ my_sharing: Boolean(mySharing && mySharing.sharing_enabled), other_location: otherLocation || null });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Could not load live location.' });
  }
});

app.delete('/api/bookings/:id/location', auth, (req, res) => {
  try {
    const bookingId = Number(req.params.id);
    if (!Number.isInteger(bookingId) || bookingId <= 0) return res.status(400).json({ error: 'Invalid booking ID.' });
    const booking = getAuthorizedChatBooking(bookingId, req.user.id);
    if (!booking) return res.status(403).json({ error: 'You cannot change location sharing for this booking.' });

    db.prepare(`UPDATE live_location_shares SET sharing_enabled = 0, latitude = NULL, longitude = NULL, updated_at = CURRENT_TIMESTAMP WHERE booking_id = ? AND user_id = ?`).run(bookingId, req.user.id);
    res.json({ ok: true, message: 'Live location sharing stopped.' });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Could not stop location sharing.' });
  }
});

// ======================================
// EMERGENCY SOS (BOOKING-BASED)
// ======================================

app.post('/api/bookings/:id/sos', auth, (req, res) => {
  try {
    const bookingId = Number(req.params.id);
    if (!Number.isInteger(bookingId) || bookingId <= 0) return res.status(400).json({ error: 'Invalid booking ID.' });
    
    const booking = getAuthorizedChatBooking(bookingId, req.user.id);
    if (!booking) return res.status(403).json({ error: 'SOS is available only to confirmed ride participants.' });

    const latitude = req.body.latitude == null ? null : Number(req.body.latitude);
    const longitude = req.body.longitude == null ? null : Number(req.body.longitude);
    
    if ((latitude === null) !== (longitude === null) || (latitude !== null && (!Number.isFinite(latitude) || !Number.isFinite(longitude) || latitude < -90 || latitude > 90 || longitude < -180 || longitude > 180))) {
      return res.status(400).json({ error: 'Invalid location coordinates.' });
    }

    const existingSOS = db.prepare(`SELECT id FROM emergency_alerts WHERE booking_id = ? AND status = 'active'`).get(bookingId);
    if (existingSOS) return res.status(409).json({ error: 'An active SOS alert already exists for this booking.', sos_id: existingSOS.id });

    const recipientId = booking.owner_id === req.user.id ? booking.passenger_id : booking.owner_id;

    const sosId = db.transaction(() => {
      const result = db.prepare(`INSERT INTO emergency_alerts (booking_id, triggered_by, latitude, longitude, message) VALUES (?, ?, ?, ?, ?)`).run(bookingId, req.user.id, latitude, longitude, 'Emergency! I need help.');
      const id = Number(result.lastInsertRowid);
      db.prepare(`INSERT INTO notifications (user_id, type, title, message, booking_id, sos_id) VALUES (?, ?, ?, ?, ?, ?)`).run(recipientId, 'safety', 'Emergency SOS Alert!', 'A ride participant has sent an emergency alert. Please check their location and contact them immediately.', bookingId, id);
      return id;
    })();

    res.status(201).json({ ok: true, message: 'Emergency SOS alert sent successfully.', sos_id: sosId });
  } catch (error) {
    console.error('SOS Error:', error);
    res.status(500).json({ error: 'Could not send emergency alert.' });
  }
});

app.get('/api/bookings/:id/sos', auth, (req, res) => {
  try {
    const bookingId = Number(req.params.id);
    if (!Number.isInteger(bookingId) || bookingId <= 0) return res.status(400).json({ error: 'Invalid booking ID.' });
    const booking = getAuthorizedChatBooking(bookingId, req.user.id);
    if (!booking) return res.status(403).json({ error: 'You are not allowed to view these alerts.' });

    const alerts = db.prepare(`
      SELECT s.id, s.booking_id, s.triggered_by, s.latitude, s.longitude, s.message, s.status, s.created_at, s.resolved_at, u.name AS triggered_by_name
      FROM emergency_alerts s JOIN users u ON u.id = s.triggered_by WHERE s.booking_id = ? ORDER BY s.id DESC
    `).all(bookingId);
    res.json({ alerts });
  } catch (error) {
    console.error('SOS Load Error:', error);
    res.status(500).json({ error: 'Could not load SOS alerts.' });
  }
});

app.patch('/api/bookings/:id/sos/:sosId/resolve', auth, (req, res) => {
  try {
    const bookingId = Number(req.params.id);
    const sosId = Number(req.params.sosId);
    if (!Number.isInteger(bookingId) || bookingId <= 0 || !Number.isInteger(sosId) || sosId <= 0) return res.status(400).json({ error: 'Invalid booking or SOS ID.' });

    const booking = getAuthorizedChatBooking(bookingId, req.user.id);
    if (!booking) return res.status(403).json({ error: 'You are not allowed to resolve this alert.' });

    const alert = db.prepare(`SELECT * FROM emergency_alerts WHERE id = ? AND booking_id = ?`).get(sosId, bookingId);
    if (!alert) return res.status(404).json({ error: 'SOS alert not found.' });
    if (alert.status !== 'active') return res.status(409).json({ error: 'This SOS alert is already resolved.' });

    const recipientId = booking.owner_id === req.user.id ? booking.passenger_id : booking.owner_id;

    db.transaction(() => {
      db.prepare(`UPDATE emergency_alerts SET status = 'resolved', resolved_at = CURRENT_TIMESTAMP WHERE id = ?`).run(sosId);
      db.prepare(`INSERT INTO notifications (user_id, type, title, message, booking_id, sos_id) VALUES (?, ?, ?, ?, ?, ?)`).run(recipientId, 'safety', 'SOS Alert Resolved', 'The emergency alert has been marked as resolved.', bookingId, sosId);
    })();

    res.json({ ok: true, message: 'SOS alert resolved successfully.' });
  } catch (error) {
    console.error('SOS Resolve Error:', error);
    res.status(500).json({ error: 'Could not resolve SOS alert.' });
  }
});

// ======================================
// INDEPENDENT SOS (SAFETY CENTRE)
// ======================================

app.post('/api/sos/trigger', auth, (req, res) => {
  try {
    const { latitude, longitude, message } = req.body;
    const senderId = req.user.id;

    const contacts = db.prepare(`SELECT contact_user_id FROM trusted_contacts WHERE user_id = ?`).all(senderId);

    if (contacts.length === 0) {
      return res.status(400).json({ error: 'No Trusted Contacts found to alert. Please add a contact first.' });
    }

    const insertAlert = db.prepare(`
      INSERT INTO emergency_contact_alerts (sender_id, latitude, longitude, message, status)
      VALUES (?, ?, ?, ?, 'active')
    `);
    const alertResult = insertAlert.run(senderId, latitude || null, longitude || null, message || 'Emergency! I need help.');
    const alertId = alertResult.lastInsertRowid;

    const insertNotification = db.prepare(`
      INSERT INTO notifications (user_id, type, title, message, emergency_alert_id)
      VALUES (?, 'safety', '🚨 EMERGENCY SOS ALERT!', ?, ?)
    `);

    const senderName = db.prepare(`SELECT name FROM users WHERE id = ?`).get(senderId).name;

    for (const contact of contacts) {
      insertNotification.run(contact.contact_user_id, `${senderName} has pressed the SOS button and needs urgent help!`, alertId);
    }

    const admins = db.prepare(`SELECT id FROM users WHERE role = 'admin'`).all();
    for (const admin of admins) {
      insertNotification.run(admin.id, `EMERGENCY: ${senderName} triggered an SOS alert!`, alertId);
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

app.get('/api/trusted-contacts/search/:userId', auth, (req, res) => {
  try {
    const searchId = String(req.params.userId).trim();
    if (!searchId) return res.status(400).json({ error: 'Enter a valid Student ID.' });
    
    const user = db.prepare(`SELECT id, name, student_id, department, profile_picture FROM users WHERE student_id = ? COLLATE NOCASE`).get(searchId);
    if (!user) return res.status(404).json({ error: 'No account found with this Student ID.' });
    if (user.id === req.user.id) return res.status(400).json({ error: 'You cannot add yourself as a Trusted Contact.' });
    
    res.json({ user });
  } catch (error) {
    console.error('Trusted Contact Search Error:', error);
    res.status(500).json({ error: 'Could not search for this account.' });
  }
});

app.get('/api/trusted-contacts', auth, (req, res) => {
  try {
    const contacts = db.prepare(`
      SELECT tc.id, tc.contact_user_id, tc.created_at, u.name, u.department, u.profile_picture
      FROM trusted_contacts tc JOIN users u ON u.id = tc.contact_user_id WHERE tc.user_id = ? ORDER BY tc.id DESC
    `).all(req.user.id);
    res.json({ contacts });
  } catch (error) {
    console.error('Trusted Contact Load Error:', error);
    res.status(500).json({ error: 'Could not load Trusted Contacts.' });
  }
});

app.post('/api/trusted-contacts', auth, (req, res) => {
  try {
    const contactUserId = Number(req.body.user_id);
    if (!Number.isInteger(contactUserId) || contactUserId <= 0) return res.status(400).json({ error: 'Enter a valid CampusPool User ID.' });
    if (contactUserId === req.user.id) return res.status(400).json({ error: 'You cannot add yourself as a Trusted Contact.' });

    const targetUser = db.prepare(`SELECT id FROM users WHERE id = ?`).get(contactUserId);
    if (!targetUser) return res.status(404).json({ error: 'No account found with this ID.' });

    const result = db.prepare(`INSERT INTO trusted_contacts (user_id, contact_user_id) VALUES (?, ?)`).run(req.user.id, contactUserId);
    const contact = db.prepare(`
      SELECT tc.id, tc.contact_user_id, tc.created_at, u.name, u.department, u.profile_picture
      FROM trusted_contacts tc JOIN users u ON u.id = tc.contact_user_id WHERE tc.id = ?
    `).get(result.lastInsertRowid);

    res.status(201).json({ message: 'Trusted Contact added successfully.', contact });
  } catch (error) {
    if (String(error.code) === 'SQLITE_CONSTRAINT_UNIQUE') return res.status(409).json({ error: 'This person is already in your Trusted Contacts.' });
    console.error('Trusted Contact Add Error:', error);
    res.status(500).json({ error: 'Could not add Trusted Contact.' });
  }
});

app.delete('/api/trusted-contacts/:id', auth, (req, res) => {
  try {
    const contactId = Number(req.params.id);
    if (!Number.isInteger(contactId) || contactId <= 0) return res.status(400).json({ error: 'Invalid Trusted Contact ID.' });
    const result = db.prepare(`DELETE FROM trusted_contacts WHERE id = ? AND user_id = ?`).run(contactId, req.user.id);
    if (result.changes === 0) return res.status(404).json({ error: 'Trusted Contact not found.' });
    res.json({ message: 'Trusted Contact removed successfully.' });
  } catch (error) {
    console.error('Trusted Contact Remove Error:', error);
    res.status(500).json({ error: 'Could not remove Trusted Contact.' });
  }
});

app.get('/api/emergency-contacts', auth, (req, res) => {
  try {
    const contacts = db.prepare(`SELECT id, contact_name, phone, relationship, created_at FROM emergency_contacts WHERE user_id = ? ORDER BY id DESC`).all(req.user.id);
    res.json({ contacts });
  } catch (error) {
    console.error('Emergency Contact Load Error:', error);
    res.status(500).json({ error: 'Could not load emergency contacts.' });
  }
});

app.post('/api/emergency-contacts', auth, (req, res) => {
  try {
    const contactName = String(req.body.contact_name || '').trim();
    const phone = String(req.body.phone || '').trim();
    const relationship = String(req.body.relationship || '').trim();
    const phonePattern = /^01[3-9]\d{8}$/;

    if (contactName.length < 2 || contactName.length > 80) return res.status(400).json({ error: 'Contact name must contain 2 to 80 characters.' });
    if (!phonePattern.test(phone)) return res.status(400).json({ error: 'Enter a valid Bangladesh phone number (01XXXXXXXXX).' });
    if (!['Father', 'Mother', 'Brother', 'Sister', 'Friend', 'Relative', 'Other'].includes(relationship)) return res.status(400).json({ error: 'Please select a valid relationship.' });

    const result = db.prepare(`INSERT INTO emergency_contacts (user_id, contact_name, phone, relationship) VALUES (?, ?, ?, ?)`).run(req.user.id, contactName, phone, relationship);
    const contact = db.prepare(`SELECT id, contact_name, phone, relationship, created_at FROM emergency_contacts WHERE id = ? AND user_id = ?`).get(result.lastInsertRowid, req.user.id);

    res.status(201).json({ message: 'Emergency contact added successfully.', contact });
  } catch (error) {
    if (String(error.code) === 'SQLITE_CONSTRAINT_UNIQUE') return res.status(409).json({ error: 'This phone number is already in your emergency contacts.' });
    console.error('Emergency Contact Add Error:', error);
    res.status(500).json({ error: 'Could not add emergency contact.' });
  }
});

app.delete('/api/emergency-contacts/:id', auth, (req, res) => {
  try {
    const contactId = Number(req.params.id);
    if (!Number.isInteger(contactId) || contactId <= 0) return res.status(400).json({ error: 'Invalid contact ID.' });
    const result = db.prepare(`DELETE FROM emergency_contacts WHERE id = ? AND user_id = ?`).run(contactId, req.user.id);
    if (result.changes === 0) return res.status(404).json({ error: 'Emergency contact not found.' });
    res.json({ message: 'Emergency contact deleted successfully.' });
  } catch (error) {
    console.error('Emergency Contact Delete Error:', error);
    res.status(500).json({ error: 'Could not delete emergency contact.' });
  }
});

// ======================================
// NOTIFICATIONS API
// ======================================

app.get('/api/notifications', auth, (req, res) => {
  try {
    const notifications = db.prepare(`
      SELECT 
        n.id, n.type, n.title, n.message, n.is_read, n.created_at,
        eca.latitude AS sos_latitude, 
        eca.longitude AS sos_longitude
      FROM notifications n
      LEFT JOIN emergency_contact_alerts eca ON n.emergency_alert_id = eca.id
      WHERE n.user_id = ? 
      ORDER BY n.created_at DESC, n.id DESC
    `).all(req.user.id);

    res.json({ notifications });
  } catch (error) {
    console.error('Get Notifications Error:', error);
    res.status(500).json({ error: 'Could not load notifications.' });
  }
});

app.patch('/api/notifications/:id/read', auth, (req, res) => {
  try {
    const id = Number(req.params.id);
    if (!Number.isInteger(id) || id <= 0) return res.status(400).json({ error: 'Invalid notification ID.' });
    const result = db.prepare(`UPDATE notifications SET is_read = 1 WHERE id = ? AND user_id = ?`).run(id, req.user.id);
    if (result.changes === 0) return res.status(404).json({ error: 'Notification not found.' });
    res.json({ ok: true });
  } catch (error) {
    console.error('Mark Notification Read Error:', error);
    res.status(500).json({ error: 'Could not update notification.' });
  }
});

app.patch('/api/notifications/read-all', auth, (req, res) => {
  try {
    db.prepare(`UPDATE notifications SET is_read = 1 WHERE user_id = ? AND is_read = 0`).run(req.user.id);
    res.json({ ok: true });
  } catch (error) {
    console.error('Mark All Notifications Read Error:', error);
    res.status(500).json({ error: 'Could not update notifications.' });
  }
});

// ======================================
// USER IMPACT STATISTICS
// ======================================

app.get('/api/user/impact', auth, (req, res) => {
  try {
    const bookings = db.prepare(`
      SELECT b.seats, r.fare_per_person, r.vehicle
      FROM bookings b
      JOIN rides r ON r.id = b.ride_id
      WHERE b.passenger_id = ? AND b.status = 'confirmed'
    `).all(req.user.id);

    let totalSavings = 0;
    let totalSeats = 0;
    let totalTrips = bookings.length;

    for (const b of bookings) {
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

app.get('/api/admin/me', auth, requireAdmin, (req, res) => {
  try {
    const user = db.prepare(`SELECT id, name, student_id, department, role, account_status, created_at FROM users WHERE id = ?`).get(req.user.id);
    res.json({ user });
  } catch (error) {
    console.error('Admin Me Error:', error);
    res.status(500).json({ error: 'Could not load admin profile.' });
  }
});

app.get('/api/admin/overview', auth, requireAdmin, (req, res) => {
  try {
    const users = db.prepare(`SELECT COUNT(*) AS total, SUM(CASE WHEN account_status = 'active' THEN 1 ELSE 0 END) AS active, SUM(CASE WHEN account_status = 'suspended' THEN 1 ELSE 0 END) AS suspended, SUM(CASE WHEN account_status = 'banned' THEN 1 ELSE 0 END) AS banned FROM users`).get();
    const rides = db.prepare(`SELECT COUNT(*) AS total, SUM(CASE WHEN status = 'open' THEN 1 ELSE 0 END) AS open, SUM(CASE WHEN status = 'full' THEN 1 ELSE 0 END) AS full, SUM(CASE WHEN status = 'cancelled' THEN 1 ELSE 0 END) AS cancelled, SUM(CASE WHEN status = 'expired' THEN 1 ELSE 0 END) AS expired FROM rides`).get();
    const bookings = db.prepare(`SELECT COUNT(*) AS total, SUM(CASE WHEN status = 'pending' THEN 1 ELSE 0 END) AS pending, SUM(CASE WHEN status = 'confirmed' THEN 1 ELSE 0 END) AS confirmed, SUM(CASE WHEN status = 'rejected' THEN 1 ELSE 0 END) AS rejected, SUM(CASE WHEN status = 'cancelled' THEN 1 ELSE 0 END) AS cancelled FROM bookings`).get();
    const bookingSOS = db.prepare(`SELECT COUNT(*) AS total FROM emergency_alerts WHERE status = 'active'`).get().total;
    const independentSOS = db.prepare(`SELECT COUNT(*) AS total FROM emergency_contact_alerts WHERE status = 'active'`).get().total;

    res.json({
      users: { total: users.total || 0, active: users.active || 0, suspended: users.suspended || 0, banned: users.banned || 0 },
      rides: { total: rides.total || 0, open: rides.open || 0, full: rides.full || 0, cancelled: rides.cancelled || 0, expired: rides.expired || 0 },
      bookings: { total: bookings.total || 0, pending: bookings.pending || 0, confirmed: bookings.confirmed || 0, rejected: bookings.rejected || 0, cancelled: bookings.cancelled || 0 },
      active_sos: (bookingSOS || 0) + (independentSOS || 0),
      sos: { booking: bookingSOS || 0, independent: independentSOS || 0, total: (bookingSOS || 0) + (independentSOS || 0) },
      admin_capacity: { current: getTotalAdminCount(), maximum: MAX_ADMINS }
    });
  } catch (error) {
    console.error('Admin Overview Error:', error);
    res.status(500).json({ error: 'Could not load admin overview.' });
  }
});

app.get('/api/admin/users', auth, requireAdmin, (req, res) => {
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
    const total = db.prepare(`SELECT COUNT(*) AS total FROM users ${where}`).get(...params).total;
    const users = db.prepare(`SELECT id, name, student_id, department, university, role, account_status, created_at FROM users ${where} ORDER BY created_at DESC, id DESC LIMIT ? OFFSET ?`).all(...params, limit, offset);

    res.json({
      users,
      admin_capacity: { current: getTotalAdminCount(), maximum: MAX_ADMINS },
      pagination: { page, limit, total, pages: Math.ceil(total / limit) }
    });
  } catch (error) {
    console.error('Admin Users Error:', error);
    res.status(500).json({ error: 'Could not load user accounts.' });
  }
});

app.patch('/api/admin/users/:id/status', auth, requireAdmin, (req, res) => {
  try {
    const targetId = Number(req.params.id);
    const status = String(req.body.status || '').trim();
    if (!Number.isInteger(targetId) || targetId <= 0) return res.status(400).json({ error: 'Invalid user ID.' });
    if (!['active', 'suspended', 'banned'].includes(status)) return res.status(400).json({ error: 'Status must be active, suspended or banned.' });
    if (targetId === req.user.id) return res.status(400).json({ error: 'You cannot change your own account status.' });

    const result = db.transaction(() => {
      const target = db.prepare(`SELECT id, name, student_id, role, account_status FROM users WHERE id = ?`).get(targetId);
      if (!target) return { error: 'not_found' };
      if (target.account_status === status) return { target, unchanged: true };
      if (target.role === 'admin' && target.account_status === 'active' && status !== 'active' && getActiveAdminCount() <= 1) return { error: 'last_active_admin' };

      db.prepare(`UPDATE users SET account_status = ? WHERE id = ?`).run(status, targetId);
      writeAdminLog(req.user.id, targetId, 'user_status_changed', { from: target.account_status, to: status });
      return { target: { ...target, account_status: status } };
    }).immediate();

    if (result.error === 'not_found') return res.status(404).json({ error: 'User not found.' });
    if (result.error === 'last_active_admin') return res.status(409).json({ error: 'You cannot suspend or ban the last active Admin.' });

    res.json({ ok: true, message: result.unchanged ? 'Account status is already set to this value.' : 'Account status updated.', user: result.target });
  } catch (error) {
    console.error('Admin Update Status Error:', error);
    res.status(500).json({ error: 'Could not update account status.' });
  }
});

app.patch('/api/admin/users/:id/role', auth, requireAdmin, (req, res) => {
  try {
    const targetId = Number(req.params.id);
    const role = String(req.body.role || '').trim();
    if (!Number.isInteger(targetId) || targetId <= 0) return res.status(400).json({ error: 'Invalid user ID.' });
    if (!['student', 'admin'].includes(role)) return res.status(400).json({ error: 'Role must be student or admin.' });
    if (targetId === req.user.id) return res.status(400).json({ error: 'You cannot change your own role.' });

    const result = db.transaction(() => {
      const target = db.prepare(`SELECT id, name, student_id, role, account_status FROM users WHERE id = ?`).get(targetId);
      if (!target) return { error: 'not_found' };
      if (target.role === role) return { target, unchanged: true };
      if (role === 'admin' && getTotalAdminCount() >= MAX_ADMINS) return { error: 'admin_limit' };
      if (role === 'student' && target.role === 'admin' && target.account_status === 'active' && getActiveAdminCount() <= 1) return { error: 'last_active_admin' };

      db.prepare(`UPDATE users SET role = ? WHERE id = ?`).run(role, targetId);
      writeAdminLog(req.user.id, targetId, 'user_role_changed', { from: target.role, to: role });
      return { target: { ...target, role } };
    }).immediate();

    if (result.error === 'not_found') return res.status(404).json({ error: 'User not found.' });
    if (result.error === 'admin_limit') return res.status(409).json({ error: `CampusPool can have a maximum of ${MAX_ADMINS} Admins.` });
    if (result.error === 'last_active_admin') return res.status(409).json({ error: 'You cannot remove the last active Admin.' });

    res.json({ ok: true, message: result.unchanged ? 'User already has this role.' : 'User role updated.', user: result.target, admin_capacity: { current: getTotalAdminCount(), maximum: MAX_ADMINS } });
  } catch (error) {
    console.error('Admin Update Role Error:', error);
    res.status(500).json({ error: 'Could not update user role.' });
  }
});

app.get('/api/admin/rides', auth, requireAdmin, (req, res) => {
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
    const total = db.prepare(`SELECT COUNT(*) AS total FROM rides r JOIN users u ON u.id = r.owner_id ${where}`).get(...params).total;
    const rides = db.prepare(`
      SELECT r.*, u.name AS driver_name, u.student_id AS driver_student_id, u.phone1 AS driver_phone,
        (SELECT COUNT(*) FROM bookings b WHERE b.ride_id = r.id) AS total_bookings,
        (SELECT COUNT(*) FROM bookings b WHERE b.ride_id = r.id AND b.status = 'pending') AS pending_bookings,
        (SELECT COALESCE(SUM(b.seats), 0) FROM bookings b WHERE b.ride_id = r.id AND b.status = 'confirmed') AS booked_seats
      FROM rides r JOIN users u ON u.id = r.owner_id ${where} ORDER BY r.created_at DESC, r.id DESC LIMIT ? OFFSET ?
    `).all(...params, limit, offset);

    res.json({ rides, pagination: { page, limit, total, pages: Math.ceil(total / limit) } });
  } catch (error) {
    console.error('Admin Rides Error:', error);
    res.status(500).json({ error: 'Could not load rides.' });
  }
});

app.patch('/api/admin/rides/:id/status', auth, requireAdmin, (req, res) => {
  try {
    const rideId = Number(req.params.id);
    const status = String(req.body.status || '').trim();
    if (!Number.isInteger(rideId) || rideId <= 0) return res.status(400).json({ error: 'Invalid ride ID.' });
    if (!['open', 'cancelled'].includes(status)) return res.status(400).json({ error: 'Ride status must be open or cancelled.' });

    const result = db.transaction(() => {
      const ride = db.prepare(`SELECT * FROM rides WHERE id = ?`).get(rideId);
      if (!ride) return { error: 'not_found' };
      if (ride.status === status) return { ride, unchanged: true };

      if (status === 'open') {
        const confirmedSeats = db.prepare(`SELECT COALESCE(SUM(seats), 0) AS total FROM bookings WHERE ride_id = ? AND status = 'confirmed'`).get(rideId).total;
        const departureTime = new Date(ride.departure_at).getTime();
        if (!Number.isFinite(departureTime) || departureTime <= Date.now()) return { error: 'ride_expired' };
        if (confirmedSeats >= ride.seats_total) return { error: 'no_seats' };
      }

      if (status === 'cancelled') {
        const affectedBookings = db.prepare(`SELECT id, passenger_id, status FROM bookings WHERE ride_id = ? AND status IN ('pending', 'confirmed')`).all(rideId);
        db.prepare(`UPDATE bookings SET status = 'cancelled' WHERE ride_id = ? AND status IN ('pending', 'confirmed')`).run(rideId);
        for (const booking of affectedBookings) {
          createAdminNotification({ userId: booking.passenger_id, type: 'booking_cancelled', title: 'Ride Cancelled', message: `Ride #${rideId} has been cancelled by CampusPool Admin.`, bookingId: booking.id });
        }
      }

      db.prepare(`UPDATE rides SET status = ? WHERE id = ?`).run(status, rideId);
      writeAdminLog(req.user.id, ride.owner_id, 'ride_status_changed', { ride_id: rideId, from: ride.status, to: status });
      return { ride: { ...ride, status } };
    }).immediate();

    if (result.error === 'not_found') return res.status(404).json({ error: 'Ride not found.' });
    if (result.error === 'ride_expired') return res.status(409).json({ error: 'A past ride cannot be reopened.' });
    if (result.error === 'no_seats') return res.status(409).json({ error: 'This ride has no available seats.' });

    res.json({ ok: true, message: result.unchanged ? 'Ride already has this status.' : 'Ride status updated.', ride: result.ride });
  } catch (error) {
    console.error('Admin Ride Status Error:', error);
    res.status(500).json({ error: 'Could not update ride status.' });
  }
});

app.get('/api/admin/bookings', auth, requireAdmin, (req, res) => {
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
    const total = db.prepare(`SELECT COUNT(*) AS total ${joins} ${where}`).get(...params).total;
    const bookings = db.prepare(`
      SELECT b.*, r.from_location, r.to_location, r.departure_at, r.vehicle, r.fare_per_person, r.seats_total, r.status AS ride_status,
        driver.id AS driver_id, driver.name AS driver_name, driver.student_id AS driver_student_id,
        passenger.id AS passenger_id, passenger.name AS passenger_name, passenger.student_id AS passenger_student_id, passenger.department AS passenger_department
      ${joins} ${where} ORDER BY b.created_at DESC, b.id DESC LIMIT ? OFFSET ?
    `).all(...params, limit, offset);

    res.json({ bookings, pagination: { page, limit, total, pages: Math.ceil(total / limit) } });
  } catch (error) {
    console.error('Admin Bookings Error:', error);
    res.status(500).json({ error: 'Could not load bookings.' });
  }
});

app.patch('/api/admin/bookings/:id/status', auth, requireAdmin, (req, res) => {
  try {
    const bookingId = Number(req.params.id);
    const status = String(req.body.status || '').trim();
    if (!Number.isInteger(bookingId) || bookingId <= 0) return res.status(400).json({ error: 'Invalid booking ID.' });
    if (!['confirmed', 'rejected', 'cancelled'].includes(status)) return res.status(400).json({ error: 'Invalid booking status.' });

    const result = db.transaction(() => {
      const booking = db.prepare(`SELECT b.*, r.owner_id, r.status AS ride_status, r.departure_at, r.seats_total FROM bookings b JOIN rides r ON r.id = b.ride_id WHERE b.id = ?`).get(bookingId);
      if (!booking) return { error: 'not_found' };
      if (booking.status === status) return { booking, unchanged: true };
      if (booking.status === 'rejected' || booking.status === 'cancelled') return { error: 'final_status' };
      if (booking.status === 'confirmed' && status !== 'cancelled') return { error: 'invalid_transition' };

      if (status === 'confirmed') {
        if (booking.ride_status !== 'open') return { error: 'ride_not_open' };
        const departureTime = new Date(booking.departure_at).getTime();
        if (!Number.isFinite(departureTime) || departureTime <= Date.now()) return { error: 'ride_expired' };
        const confirmedSeats = db.prepare(`SELECT COALESCE(SUM(seats), 0) AS total FROM bookings WHERE ride_id = ? AND status = 'confirmed'`).get(booking.ride_id).total;
        if (confirmedSeats + booking.seats > booking.seats_total) return { error: 'no_seats' };
      }

      db.prepare(`UPDATE bookings SET status = ? WHERE id = ?`).run(status, bookingId);
      const newConfirmedSeats = db.prepare(`SELECT COALESCE(SUM(seats), 0) AS total FROM bookings WHERE ride_id = ? AND status = 'confirmed'`).get(booking.ride_id).total;

      if (newConfirmedSeats >= booking.seats_total) {
        db.prepare(`UPDATE rides SET status = 'full' WHERE id = ? AND status = 'open'`).run(booking.ride_id);
      } else if (status === 'cancelled') {
        const departureTime = new Date(booking.departure_at).getTime();
        if (Number.isFinite(departureTime) && departureTime > Date.now()) {
          db.prepare(`UPDATE rides SET status = 'open' WHERE id = ? AND status = 'full'`).run(booking.ride_id);
        }
      }

      const notificationText = { confirmed: 'Your booking has been confirmed by CampusPool Admin.', rejected: 'Your booking has been rejected by CampusPool Admin.', cancelled: 'Your booking has been cancelled by CampusPool Admin.' };
      createAdminNotification({ userId: booking.passenger_id, type: `booking_${status}`, title: `Booking ${status.charAt(0).toUpperCase() + status.slice(1)}`, message: notificationText[status], bookingId });
      if (booking.owner_id !== booking.passenger_id) {
        createAdminNotification({ userId: booking.owner_id, type: `booking_${status}`, title: `Booking ${status.charAt(0).toUpperCase() + status.slice(1)}`, message: `Booking #${bookingId} has been ${status} by CampusPool Admin.`, bookingId });
      }

      writeAdminLog(req.user.id, booking.passenger_id, 'booking_status_changed', { booking_id: bookingId, ride_id: booking.ride_id, from: booking.status, to: status });
      return { booking: { ...booking, status } };
    }).immediate();

    if (result.error === 'not_found') return res.status(404).json({ error: 'Booking not found.' });
    if (result.error === 'final_status') return res.status(409).json({ error: 'Rejected or cancelled bookings cannot be changed.' });
    if (result.error === 'invalid_transition') return res.status(409).json({ error: 'A confirmed booking can only be cancelled.' });
    if (result.error === 'ride_not_open') return res.status(409).json({ error: 'This ride is not open for booking.' });
    if (result.error === 'ride_expired') return res.status(409).json({ error: 'A past ride cannot be confirmed.' });
    if (result.error === 'no_seats') return res.status(409).json({ error: 'Not enough seats are available.' });

    res.json({ ok: true, message: result.unchanged ? 'Booking already has this status.' : 'Booking status updated.', booking: result.booking });
  } catch (error) {
    console.error('Admin Booking Status Error:', error);
    res.status(500).json({ error: 'Could not update booking status.' });
  }
});

app.get('/api/admin/sos', auth, requireAdmin, (req, res) => {
  try {
    const status = String(req.query.status || '').trim();
    const allowedStatuses = ['active', 'resolved'];
    if (status && !allowedStatuses.includes(status)) return res.status(400).json({ error: 'Status must be active or resolved.' });

    const bookingConditions = status ? 'WHERE ea.status = ?' : '';
    const independentConditions = status ? 'WHERE eca.status = ?' : '';

    const bookingAlerts = db.prepare(`
      SELECT ea.id, 'booking' AS alert_type, ea.status, ea.message, ea.latitude, ea.longitude, ea.created_at, ea.resolved_at, ea.booking_id,
        ea.triggered_by AS sender_id, sender.name AS sender_name, sender.student_id AS sender_student_id,
        b.passenger_id, passenger.name AS passenger_name, r.owner_id AS driver_id, driver.name AS driver_name, r.from_location, r.to_location, r.departure_at
      FROM emergency_alerts ea JOIN bookings b ON b.id = ea.booking_id JOIN users sender ON sender.id = ea.triggered_by
      JOIN users passenger ON passenger.id = b.passenger_id JOIN rides r ON r.id = b.ride_id JOIN users driver ON driver.id = r.owner_id
      ${bookingConditions} ORDER BY ea.created_at DESC, ea.id DESC
    `).all(...(status ? [status] : []));

    const independentAlerts = db.prepare(`
      SELECT eca.id, 'independent' AS alert_type, eca.status, eca.message, eca.latitude, eca.longitude, eca.created_at, eca.resolved_at,
        NULL AS booking_id, eca.sender_id, sender.name AS sender_name, sender.student_id AS sender_student_id,
        NULL AS passenger_id, NULL AS passenger_name, NULL AS driver_id, NULL AS driver_name, NULL AS from_location, NULL AS to_location, NULL AS departure_at
      FROM emergency_contact_alerts eca JOIN users sender ON sender.id = eca.sender_id
      ${independentConditions} ORDER BY eca.created_at DESC, eca.id DESC
    `).all(...(status ? [status] : []));

    const alerts = [...bookingAlerts, ...independentAlerts].sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
    res.json({ alerts, total: alerts.length, active: alerts.filter(a => a.status === 'active').length, resolved: alerts.filter(a => a.status === 'resolved').length });
  } catch (error) {
    console.error('Admin SOS Error:', error);
    res.status(500).json({ error: 'Could not load SOS alerts.' });
  }
});

app.patch('/api/admin/sos/:id/resolve', auth, requireAdmin, (req, res) => {
  try {
    const alertId = Number(req.params.id);
    if (!Number.isInteger(alertId) || alertId <= 0) return res.status(400).json({ error: 'Invalid SOS ID.' });

    const result = db.transaction(() => {
      const alert = db.prepare(`SELECT ea.*, b.passenger_id, r.owner_id FROM emergency_alerts ea JOIN bookings b ON b.id = ea.booking_id JOIN rides r ON r.id = b.ride_id WHERE ea.id = ?`).get(alertId);
      if (!alert) return { error: 'not_found' };
      if (alert.status === 'resolved') return { alert, unchanged: true };

      db.prepare(`UPDATE emergency_alerts SET status = 'resolved', resolved_at = CURRENT_TIMESTAMP WHERE id = ?`).run(alertId);
      const recipients = new Set([alert.triggered_by, alert.passenger_id, alert.owner_id]);

      for (const userId of recipients) {
        createAdminNotification({ userId, type: 'sos_resolved', title: 'SOS Alert Resolved', message: `SOS alert #${alertId} has been marked resolved by CampusPool Admin.`, bookingId: alert.booking_id, sosId: alertId });
      }

      writeAdminLog(req.user.id, alert.triggered_by, 'booking_sos_resolved', { sos_id: alertId, booking_id: alert.booking_id });
      return { alert: { ...alert, status: 'resolved' } };
    }).immediate();

    if (result.error === 'not_found') return res.status(404).json({ error: 'SOS alert not found.' });
    res.json({ ok: true, message: result.unchanged ? 'SOS alert is already resolved.' : 'SOS alert resolved successfully.', alert: result.alert });
  } catch (error) {
    console.error('Admin Resolve Booking SOS Error:', error);
    res.status(500).json({ error: 'Could not resolve SOS alert.' });
  }
});

app.patch('/api/admin/independent-sos/:id/resolve', auth, requireAdmin, (req, res) => {
  try {
    const alertId = Number(req.params.id);
    if (!Number.isInteger(alertId) || alertId <= 0) return res.status(400).json({ error: 'Invalid SOS ID.' });

    const result = db.transaction(() => {
      const alert = db.prepare(`SELECT * FROM emergency_contact_alerts WHERE id = ?`).get(alertId);
      if (!alert) return { error: 'not_found' };
      if (alert.status === 'resolved') return { alert, unchanged: true };

      db.prepare(`UPDATE emergency_contact_alerts SET status = 'resolved', resolved_at = CURRENT_TIMESTAMP WHERE id = ?`).run(alertId);
      createAdminNotification({ userId: alert.sender_id, type: 'sos_resolved', title: 'SOS Alert Resolved', message: `Your emergency alert #${alertId} has been marked resolved by CampusPool Admin.`, emergencyAlertId: alertId });
      writeAdminLog(req.user.id, alert.sender_id, 'independent_sos_resolved', { emergency_alert_id: alertId });
      return { alert: { ...alert, status: 'resolved' } };
    }).immediate();

    if (result.error === 'not_found') return res.status(404).json({ error: 'SOS alert not found.' });
    res.json({ ok: true, message: result.unchanged ? 'SOS alert is already resolved.' : 'SOS alert resolved successfully.', alert: result.alert });
  } catch (error) {
    console.error('Admin Resolve Independent SOS Error:', error);
    res.status(500).json({ error: 'Could not resolve SOS alert.' });
  }
});

app.get('/api/admin/activity-logs', auth, requireAdmin, (req, res) => {
  try {
    const limit = Math.min(100, Math.max(1, Number.parseInt(req.query.limit, 10) || 30));
    const logs = db.prepare(`
      SELECT l.id, l.action, l.details, l.created_at, actor.name AS actor_name, actor.student_id AS actor_student_id, target.name AS target_name, target.student_id AS target_student_id
      FROM admin_activity_logs l LEFT JOIN users actor ON actor.id = l.actor_user_id LEFT JOIN users target ON target.id = l.target_user_id
      ORDER BY l.id DESC LIMIT ?
    `).all(limit);
    res.json({ logs });
  } catch (error) {
    console.error('Admin Activity Logs Error:', error);
    res.status(500).json({ error: 'Could not load admin activity logs.' });
  }
});

app.get('/api/admin/analytics', auth, requireAdmin, (req, res) => {
  try {
    const daily = {
      users: db.prepare(`SELECT COUNT(*) AS total FROM users WHERE date(created_at) = date('now')`).get().total,
      rides: db.prepare(`SELECT COUNT(*) AS total FROM rides WHERE date(created_at) = date('now')`).get().total,
      bookings: db.prepare(`SELECT COUNT(*) AS total FROM bookings WHERE date(created_at) = date('now')`).get().total
    };

    const weekly = {
      users: db.prepare(`SELECT COUNT(*) AS total FROM users WHERE created_at >= datetime('now', '-7 days')`).get().total,
      rides: db.prepare(`SELECT COUNT(*) AS total FROM rides WHERE created_at >= datetime('now', '-7 days')`).get().total,
      bookings: db.prepare(`SELECT COUNT(*) AS total FROM bookings WHERE created_at >= datetime('now', '-7 days')`).get().total
    };

    const monthly = {
      users: db.prepare(`SELECT COUNT(*) AS total FROM users WHERE created_at >= datetime('now', '-30 days')`).get().total,
      rides: db.prepare(`SELECT COUNT(*) AS total FROM rides WHERE created_at >= datetime('now', '-30 days')`).get().total,
      bookings: db.prepare(`SELECT COUNT(*) AS total FROM bookings WHERE created_at >= datetime('now', '-30 days')`).get().total
    };

    function getDailyGrowth(tableName) {
      const allowedTables = ['users', 'rides', 'bookings'];
      if (!allowedTables.includes(tableName)) throw new Error('Invalid analytics table.');
      return db.prepare(`SELECT date(created_at) AS date, COUNT(*) AS total FROM ${tableName} WHERE created_at >= datetime('now', '-29 days') GROUP BY date(created_at) ORDER BY date(created_at) ASC`).all();
    }

    const sos = {
      booking: db.prepare(`SELECT COUNT(*) AS total, SUM(CASE WHEN status = 'active' THEN 1 ELSE 0 END) AS active, SUM(CASE WHEN status = 'resolved' THEN 1 ELSE 0 END) AS resolved FROM emergency_alerts`).get(),
      independent: db.prepare(`SELECT COUNT(*) AS total, SUM(CASE WHEN status = 'active' THEN 1 ELSE 0 END) AS active, SUM(CASE WHEN status = 'resolved' THEN 1 ELSE 0 END) AS resolved FROM emergency_contact_alerts`).get()
    };

    const recentActivities = db.prepare(`
      SELECT l.id, l.action, l.details, l.created_at, actor.name AS actor_name, target.name AS target_name
      FROM admin_activity_logs l LEFT JOIN users actor ON actor.id = l.actor_user_id LEFT JOIN users target ON target.id = l.target_user_id
      ORDER BY l.id DESC LIMIT 10
    `).all();

    res.json({
      success: true,
      statistics: { daily, weekly, monthly },
      growth: { users: getDailyGrowth('users'), rides: getDailyGrowth('rides'), bookings: getDailyGrowth('bookings') },
      sos: {
        booking: { total: sos.booking.total || 0, active: sos.booking.active || 0, resolved: sos.booking.resolved || 0 },
        independent: { total: sos.independent.total || 0, active: sos.independent.active || 0, resolved: sos.independent.resolved || 0 },
        total: (sos.booking.total || 0) + (sos.independent.total || 0),
        active: (sos.booking.active || 0) + (sos.independent.active || 0),
        resolved: (sos.booking.resolved || 0) + (sos.independent.resolved || 0)
      },
      recent_activities: recentActivities,
      admin_capacity: { current: getTotalAdminCount(), maximum: MAX_ADMINS }
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

app.listen(PORT, () => {
  console.log(`CampusPool API ready: http://localhost:${PORT}`);
});