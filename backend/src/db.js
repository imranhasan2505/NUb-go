const { createClient } = require('@libsql/client');
const path = require('path');

require('dotenv').config({
  path: path.join(__dirname, '..', '.env')
});

// ======================================
// DATABASE CONNECTION (TURSO)
// ======================================

const db = createClient({
  url: process.env.TURSO_DATABASE_URL,
  authToken: process.env.TURSO_AUTH_TOKEN,
});

const addColumnIfMissing = async (tableName, columnName, columnType) => {
  try {
    const columnsResult = await db.execute(`PRAGMA table_info(${tableName})`);
    const exists = columnsResult.rows.some(row => row.name === columnName);

    if (!exists) {
      await db.execute(`ALTER TABLE ${tableName} ADD COLUMN ${columnName} ${columnType}`);
      console.log(`Added column: ${tableName}.${columnName}`);
    }
  } catch (err) {
    console.error(`Error checking column ${columnName}:`, err.message);
  }
};

// পুরো ডেটাবেস সেটআপ রান করার ফাংশন
async function initDatabase() {
  try {
    // ১. Users টেবিল
    await db.execute(`
      CREATE TABLE IF NOT EXISTS users (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        name TEXT NOT NULL,
        student_id TEXT NOT NULL UNIQUE COLLATE NOCASE,
        department TEXT NOT NULL,
        password_hash TEXT NOT NULL,
        university TEXT NOT NULL DEFAULT 'Northern University Bangladesh',
        profile_picture TEXT DEFAULT NULL,
        created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
      )
    `);

    // ২. Rides টেবিল
    await db.execute(`
      CREATE TABLE IF NOT EXISTS rides (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        owner_id INTEGER NOT NULL REFERENCES users(id),
        from_location TEXT NOT NULL,
        to_location TEXT NOT NULL,
        departure_at TEXT NOT NULL,
        vehicle TEXT NOT NULL CHECK(vehicle IN ('Rickshaw','Bike','Car')),
        seats_total INTEGER NOT NULL CHECK(seats_total BETWEEN 1 AND 3),
        fare_per_person INTEGER NOT NULL CHECK(fare_per_person BETWEEN 1 AND 100),
        female_only INTEGER NOT NULL DEFAULT 0,
        status TEXT NOT NULL DEFAULT 'open' CHECK(status IN ('open','full','expired','cancelled')),
        created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
      )
    `);

    // ৩. Bookings টেবিল
    await db.execute(`
      CREATE TABLE IF NOT EXISTS bookings (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        ride_id INTEGER NOT NULL REFERENCES rides(id),
        passenger_id INTEGER NOT NULL REFERENCES users(id),
        seats INTEGER NOT NULL DEFAULT 1 CHECK(seats BETWEEN 1 AND 3),
        status TEXT NOT NULL DEFAULT 'pending' CHECK(status IN ('pending','confirmed','rejected','cancelled')),
        created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
        UNIQUE(ride_id, passenger_id)
      )
    `);

    // ৪. Migrations (কলাম যোগ করা)
    await addColumnIfMissing('users', 'university', "TEXT NOT NULL DEFAULT 'Northern University Bangladesh'");
    await addColumnIfMissing('users', 'profile_picture', 'TEXT DEFAULT NULL');
    await addColumnIfMissing('users', 'phone1', 'TEXT DEFAULT NULL');
    await addColumnIfMissing('users', 'phone2', 'TEXT DEFAULT NULL');
    await addColumnIfMissing('users', 'student_card', 'TEXT DEFAULT NULL');
    await addColumnIfMissing('users', 'is_verified', 'INTEGER NOT NULL DEFAULT 0');
    await addColumnIfMissing('users', 'gender', 'TEXT DEFAULT NULL');
    await addColumnIfMissing('users', 'gender_verified', 'INTEGER NOT NULL DEFAULT 0');
    await addColumnIfMissing('users', 'temp_password', 'TEXT DEFAULT NULL'); // NEW: টেম্পোরারি পাসওয়ার্ড
    
    await addColumnIfMissing('rides', 'total_fare', 'REAL NOT NULL DEFAULT 0');
    await addColumnIfMissing('rides', 'total_passengers', 'INTEGER NOT NULL DEFAULT 3');

    // ৫. বাকি টেবিলগুলো আলাদা আলাদা করে তৈরি করা
    await db.execute(`UPDATE rides SET total_fare = fare_per_person * (seats_total + 1), total_passengers = seats_total + 1 WHERE total_fare = 0`);

    await db.execute(`
      CREATE TABLE IF NOT EXISTS chat_messages (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        booking_id INTEGER NOT NULL REFERENCES bookings(id) ON DELETE CASCADE,
        sender_id INTEGER NOT NULL REFERENCES users(id),
        message TEXT NOT NULL CHECK(length(message) BETWEEN 1 AND 500),
        created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
      )
    `);

    await addColumnIfMissing('chat_messages', 'read_at', 'TEXT DEFAULT NULL');

    await db.execute(`
      CREATE TABLE IF NOT EXISTS live_location_shares (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        booking_id INTEGER NOT NULL REFERENCES bookings(id) ON DELETE CASCADE,
        user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        latitude REAL DEFAULT NULL,
        longitude REAL DEFAULT NULL,
        sharing_enabled INTEGER NOT NULL DEFAULT 0 CHECK(sharing_enabled IN (0, 1)),
        updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
        UNIQUE(booking_id, user_id)
      )
    `);

    await db.execute(`
      CREATE TABLE IF NOT EXISTS emergency_contacts (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        contact_name TEXT NOT NULL,
        phone TEXT NOT NULL,
        relationship TEXT NOT NULL,
        created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
        UNIQUE(user_id, phone)
      )
    `);

    await db.execute(`
      CREATE TABLE IF NOT EXISTS trusted_contacts (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        contact_user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
        UNIQUE(user_id, contact_user_id),
        CHECK(user_id != contact_user_id)
      )
    `);

    await db.execute(`
      CREATE TABLE IF NOT EXISTS emergency_alerts (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        booking_id INTEGER NOT NULL REFERENCES bookings(id) ON DELETE CASCADE,
        triggered_by INTEGER NOT NULL REFERENCES users(id),
        latitude REAL DEFAULT NULL,
        longitude REAL DEFAULT NULL,
        message TEXT DEFAULT 'Emergency! I need help.',
        status TEXT NOT NULL DEFAULT 'active' CHECK(status IN ('active', 'resolved')),
        created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
        resolved_at TEXT DEFAULT NULL
      )
    `);

    await db.execute(`
      CREATE TABLE IF NOT EXISTS emergency_contact_alerts (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        sender_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        latitude REAL DEFAULT NULL,
        longitude REAL DEFAULT NULL,
        message TEXT NOT NULL DEFAULT 'Emergency! I need help.',
        created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
      )
    `);

    await db.execute(`
      CREATE TABLE IF NOT EXISTS notifications (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        type TEXT NOT NULL,
        title TEXT NOT NULL,
        message TEXT NOT NULL,
        booking_id INTEGER DEFAULT NULL REFERENCES bookings(id) ON DELETE CASCADE,
        sos_id INTEGER DEFAULT NULL REFERENCES emergency_alerts(id) ON DELETE CASCADE,
        emergency_alert_id INTEGER DEFAULT NULL REFERENCES emergency_contact_alerts(id) ON DELETE CASCADE,
        is_read INTEGER NOT NULL DEFAULT 0,
        created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
      )
    `);

    await db.execute(`
      CREATE TABLE IF NOT EXISTS admin_activity_logs (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        actor_user_id INTEGER DEFAULT NULL REFERENCES users(id) ON DELETE SET NULL,
        target_user_id INTEGER DEFAULT NULL REFERENCES users(id) ON DELETE SET NULL,
        action TEXT NOT NULL,
        details TEXT DEFAULT NULL,
        created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
      )
    `);

    await db.execute(`
      CREATE TABLE IF NOT EXISTS university_data (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        university_name TEXT NOT NULL,
        master_id TEXT NOT NULL,
        created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
      )
    `);

    await db.execute(`
      INSERT OR IGNORE INTO university_data (university_name, master_id) 
      VALUES ('NORTHERN UNIVERSITY', '41240302505')
    `);

    // পাসওয়ার্ড রিসেট রিকোয়েস্ট টেবিল
    await db.execute(`
      CREATE TABLE IF NOT EXISTS password_reset_requests (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        student_id TEXT NOT NULL,
        status TEXT NOT NULL DEFAULT 'pending' CHECK(status IN ('pending', 'resolved')),
        created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
        resolved_at TEXT DEFAULT NULL
      )
    `);

    // ৬. বাকি মাইগ্রেশনগুলো
    await addColumnIfMissing('emergency_contact_alerts', 'status', "TEXT NOT NULL DEFAULT 'active'");
    await addColumnIfMissing('emergency_contact_alerts', 'resolved_at', 'TEXT DEFAULT NULL');
    await addColumnIfMissing('users', 'role', "TEXT NOT NULL DEFAULT 'student'");
    await addColumnIfMissing('users', 'account_status', "TEXT NOT NULL DEFAULT 'active'");

    await db.execute(`
      UPDATE users SET role = 'admin' WHERE lower(trim(role)) = 'super_admin'
    `);
    await db.execute(`
      UPDATE users SET role = 'student' WHERE role IS NULL OR TRIM(role) = ''
    `);
    await db.execute(`
      UPDATE users SET account_status = 'active' WHERE account_status IS NULL OR TRIM(account_status) = ''
    `);

    console.log('✅ CampusPool Turso database migration completed successfully!');
  } catch (error) {
    console.error('❌ Database initialization error:', error);
  }
}

// এক্সপোর্ট করা হচ্ছে 
module.exports = { db, initDatabase };
