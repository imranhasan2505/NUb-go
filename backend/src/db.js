const Database = require('better-sqlite3');
const path = require('path');
const fs = require('fs');

require('dotenv').config({
  path: path.join(__dirname, '..', '.env')
});

// ======================================
// DATABASE CONNECTION
// ======================================

const configured = process.env.DATABASE_FILE || './campuspool.sqlite';

const dbPath = path.isAbsolute(configured)
  ? configured
  : path.resolve(__dirname, '..', configured);

fs.mkdirSync(path.dirname(dbPath), { recursive: true });

const db = new Database(dbPath);

db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');

// ======================================
// HELPER: CHECK AND ADD COLUMN
// ======================================

function addColumnIfMissing(tableName, columnName, columnType) {
  const columns = db.prepare(
    `PRAGMA table_info(${tableName})`
  ).all();

  const exists = columns.some(
    column => column.name === columnName
  );

  if (!exists) {
    db.exec(`
      ALTER TABLE ${tableName}
      ADD COLUMN ${columnName} ${columnType}
    `);

    console.log(`Added column: ${tableName}.${columnName}`);
  }
}

// ======================================
// USERS, RIDES & BOOKINGS
// ======================================

db.exec(`
  CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    student_id TEXT NOT NULL UNIQUE COLLATE NOCASE,
    department TEXT NOT NULL,
    password_hash TEXT NOT NULL,
    university TEXT NOT NULL DEFAULT 'Northern University Bangladesh',
    profile_picture TEXT DEFAULT NULL,
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
  );

  CREATE TABLE IF NOT EXISTS rides (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    owner_id INTEGER NOT NULL REFERENCES users(id),
    from_location TEXT NOT NULL,
    to_location TEXT NOT NULL,
    departure_at TEXT NOT NULL,

    vehicle TEXT NOT NULL
      CHECK(vehicle IN ('Rickshaw','Bike','Car')),

    seats_total INTEGER NOT NULL
      CHECK(seats_total BETWEEN 1 AND 3),

    fare_per_person INTEGER NOT NULL
      CHECK(fare_per_person BETWEEN 1 AND 100),

    female_only INTEGER NOT NULL DEFAULT 0,

    status TEXT NOT NULL DEFAULT 'open'
      CHECK(status IN ('open','full','expired','cancelled')),

    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
  );

  CREATE TABLE IF NOT EXISTS bookings (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    ride_id INTEGER NOT NULL REFERENCES rides(id),
    passenger_id INTEGER NOT NULL REFERENCES users(id),

    seats INTEGER NOT NULL DEFAULT 1
      CHECK(seats BETWEEN 1 AND 3),

    status TEXT NOT NULL DEFAULT 'pending'
      CHECK(status IN ('pending','confirmed','rejected','cancelled')),

    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,

    UNIQUE(ride_id, passenger_id)
  );
`);

// ======================================
// USER DATABASE MIGRATION
// ======================================

addColumnIfMissing(
  'users',
  'university',
  "TEXT NOT NULL DEFAULT 'Northern University Bangladesh'"
);

addColumnIfMissing(
  'users',
  'profile_picture',
  'TEXT DEFAULT NULL'
);

db.exec(`
  UPDATE users
  SET university = 'Northern University Bangladesh'
  WHERE university IS NULL OR university = ''
`);

// ======================================
// PROFILE VERIFICATION MIGRATION
// ======================================

addColumnIfMissing('users', 'phone1', 'TEXT DEFAULT NULL');
addColumnIfMissing('users', 'phone2', 'TEXT DEFAULT NULL');
addColumnIfMissing('users', 'student_card', 'TEXT DEFAULT NULL');
addColumnIfMissing('users', 'is_verified', 'INTEGER NOT NULL DEFAULT 0');

// ======================================
// GENDER MIGRATION
// ======================================

addColumnIfMissing(
  'users',
  'gender',
  'TEXT DEFAULT NULL'
);

addColumnIfMissing(
  'users',
  'gender_verified',
  'INTEGER NOT NULL DEFAULT 0'
);

console.log('Gender columns are ready.');

// ======================================
// RIDE DATABASE MIGRATION
// ======================================

addColumnIfMissing(
  'rides',
  'total_fare',
  'REAL NOT NULL DEFAULT 0'
);

addColumnIfMissing(
  'rides',
  'total_passengers',
  'INTEGER NOT NULL DEFAULT 3'
);

db.exec(`
  UPDATE rides
  SET
    total_fare = fare_per_person * (seats_total + 1),
    total_passengers = seats_total + 1
  WHERE total_fare = 0
`);

// ======================================
// PRIVATE CHAT TABLE
// ======================================

db.exec(`
  CREATE TABLE IF NOT EXISTS chat_messages (
    id INTEGER PRIMARY KEY AUTOINCREMENT,

    booking_id INTEGER NOT NULL
      REFERENCES bookings(id) ON DELETE CASCADE,

    sender_id INTEGER NOT NULL
      REFERENCES users(id),

    message TEXT NOT NULL
      CHECK(length(message) BETWEEN 1 AND 500),

    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
  );
`);

addColumnIfMissing(
  'chat_messages',
  'read_at',
  'TEXT DEFAULT NULL'
);

// ======================================
// CHAT INDEXES
// ======================================

db.exec(`
  CREATE INDEX IF NOT EXISTS idx_chat_booking
  ON chat_messages(booking_id, id);

  CREATE INDEX IF NOT EXISTS idx_chat_unread
  ON chat_messages(booking_id, sender_id, read_at);
`);

// ======================================
// LIVE LOCATION SHARING TABLE
// ======================================

db.exec(`
  CREATE TABLE IF NOT EXISTS live_location_shares (
    id INTEGER PRIMARY KEY AUTOINCREMENT,

    booking_id INTEGER NOT NULL
      REFERENCES bookings(id) ON DELETE CASCADE,

    user_id INTEGER NOT NULL
      REFERENCES users(id) ON DELETE CASCADE,

    latitude REAL DEFAULT NULL,
    longitude REAL DEFAULT NULL,

    sharing_enabled INTEGER NOT NULL DEFAULT 0
      CHECK(sharing_enabled IN (0, 1)),

    updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,

    UNIQUE(booking_id, user_id)
  );

  CREATE INDEX IF NOT EXISTS idx_live_location_booking
  ON live_location_shares(booking_id, sharing_enabled);
`);

// ======================================
// EMERGENCY CONTACTS TABLE + MIGRATION
// ======================================

const emergencyContactsExists = db.prepare(`
  SELECT name
  FROM sqlite_master
  WHERE type = 'table'
    AND name = 'emergency_contacts'
`).get();

if (!emergencyContactsExists) {
  db.exec(`
    CREATE TABLE emergency_contacts (
      id INTEGER PRIMARY KEY AUTOINCREMENT,

      user_id INTEGER NOT NULL
        REFERENCES users(id) ON DELETE CASCADE,

      contact_name TEXT NOT NULL,
      phone TEXT NOT NULL,
      relationship TEXT NOT NULL,

      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,

      UNIQUE(user_id, phone)
    );
  `);
} else {
  const contactColumns = db.prepare(
    'PRAGMA table_info(emergency_contacts)'
  ).all();

  const hasContactName = contactColumns.some(
    column => column.name === 'contact_name'
  );

  if (!hasContactName) {
    const migrateEmergencyContacts = db.transaction(() => {
      db.exec(`
        CREATE TABLE emergency_contacts_new (
          id INTEGER PRIMARY KEY AUTOINCREMENT,

          user_id INTEGER NOT NULL
            REFERENCES users(id) ON DELETE CASCADE,

          contact_name TEXT NOT NULL,
          phone TEXT NOT NULL,
          relationship TEXT NOT NULL,

          created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,

          UNIQUE(user_id, phone)
        );
      `);

      // Old contacts are converted using the registered user's phone1.
      db.exec(`
        INSERT OR IGNORE INTO emergency_contacts_new
          (user_id, contact_name, phone, relationship, created_at)
        SELECT
          ec.user_id,
          u.name,
          u.phone1,
          'Other',
          ec.created_at
        FROM emergency_contacts ec
        INNER JOIN users u
          ON u.id = ec.contact_user_id
        WHERE u.phone1 IS NOT NULL
          AND TRIM(u.phone1) != '';
      `);

      db.exec(`
        DROP TABLE emergency_contacts;

        ALTER TABLE emergency_contacts_new
        RENAME TO emergency_contacts;
      `);
    });

    migrateEmergencyContacts();
  }
}

db.exec(`
  CREATE INDEX IF NOT EXISTS idx_emergency_contacts_user
  ON emergency_contacts(user_id);
`);

console.log('Emergency Contacts table is ready.');

// ======================================
// TRUSTED CONTACTS TABLE
// ======================================

db.exec(`
  CREATE TABLE IF NOT EXISTS trusted_contacts (
    id INTEGER PRIMARY KEY AUTOINCREMENT,

    user_id INTEGER NOT NULL
      REFERENCES users(id) ON DELETE CASCADE,

    contact_user_id INTEGER NOT NULL
      REFERENCES users(id) ON DELETE CASCADE,

    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,

    UNIQUE(user_id, contact_user_id),

    CHECK(user_id != contact_user_id)
  );

  CREATE INDEX IF NOT EXISTS idx_trusted_contacts_user
  ON trusted_contacts(user_id);

  CREATE INDEX IF NOT EXISTS idx_trusted_contacts_contact
  ON trusted_contacts(contact_user_id);
`);

console.log('Trusted Contacts table is ready.');

// ======================================
// OLD BOOKING-BASED SOS TABLE
// ======================================

db.exec(`
  CREATE TABLE IF NOT EXISTS emergency_alerts (
    id INTEGER PRIMARY KEY AUTOINCREMENT,

    booking_id INTEGER NOT NULL
      REFERENCES bookings(id) ON DELETE CASCADE,

    triggered_by INTEGER NOT NULL
      REFERENCES users(id),

    latitude REAL DEFAULT NULL,
    longitude REAL DEFAULT NULL,

    message TEXT DEFAULT 'Emergency! I need help.',

    status TEXT NOT NULL DEFAULT 'active'
      CHECK(status IN ('active', 'resolved')),

    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    resolved_at TEXT DEFAULT NULL
  );

  CREATE INDEX IF NOT EXISTS idx_emergency_booking
  ON emergency_alerts(booking_id, status);
`);

// ======================================
// NEW INDEPENDENT EMERGENCY ALERT TABLE
// ======================================

db.exec(`
  CREATE TABLE IF NOT EXISTS emergency_contact_alerts (
    id INTEGER PRIMARY KEY AUTOINCREMENT,

    sender_id INTEGER NOT NULL
      REFERENCES users(id) ON DELETE CASCADE,

    latitude REAL DEFAULT NULL,
    longitude REAL DEFAULT NULL,

    message TEXT NOT NULL DEFAULT 'Emergency! I need help.',

    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
  );

  CREATE INDEX IF NOT EXISTS idx_emergency_contact_alert_sender
  ON emergency_contact_alerts(sender_id, created_at);
`);

console.log('Independent Emergency Alert table is ready.');


// ======================================
// INDEPENDENT SOS STATUS MIGRATION
// ======================================

// Allows Admins to track and resolve independent SOS alerts.
addColumnIfMissing(
  'emergency_contact_alerts',
  'status',
  "TEXT NOT NULL DEFAULT 'active'"
);

addColumnIfMissing(
  'emergency_contact_alerts',
  'resolved_at',
  'TEXT DEFAULT NULL'
);

// Index for faster Admin SOS filtering.
db.exec(`
  CREATE INDEX IF NOT EXISTS idx_emergency_contact_alert_status
  ON emergency_contact_alerts(status, created_at);
`);

console.log('Independent SOS status migration is ready.');



// ======================================
// NOTIFICATIONS TABLE
// ======================================

db.exec(`
  CREATE TABLE IF NOT EXISTS notifications (
    id INTEGER PRIMARY KEY AUTOINCREMENT,

    user_id INTEGER NOT NULL
      REFERENCES users(id) ON DELETE CASCADE,

    type TEXT NOT NULL,
    title TEXT NOT NULL,
    message TEXT NOT NULL,

    booking_id INTEGER DEFAULT NULL
      REFERENCES bookings(id) ON DELETE CASCADE,

    sos_id INTEGER DEFAULT NULL
      REFERENCES emergency_alerts(id) ON DELETE CASCADE,

    is_read INTEGER NOT NULL DEFAULT 0,

    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
  );
`);

// ======================================
// NOTIFICATION MIGRATIONS
// ======================================

addColumnIfMissing(
  'notifications',
  'emergency_alert_id',
  'INTEGER REFERENCES emergency_contact_alerts(id) ON DELETE CASCADE'
);

// ======================================
// NOTIFICATION INDEXES
// ======================================

db.exec(`
  CREATE INDEX IF NOT EXISTS idx_notifications_user
  ON notifications(user_id, is_read, created_at);

  CREATE INDEX IF NOT EXISTS idx_notifications_emergency
  ON notifications(emergency_alert_id);
`);

console.log('Emergency SOS and Notification tables are ready.');


// ======================================
// ADMIN ROLE + ACCOUNT STATUS MIGRATION
// ======================================

// Existing users remain normal students and active after migration.
addColumnIfMissing(
  'users',
  'role',
  "TEXT NOT NULL DEFAULT 'student'"
);

addColumnIfMissing(
  'users',
  'account_status',
  "TEXT NOT NULL DEFAULT 'active'"
);

db.exec(`
  -- Convert the old privileged role to the single Admin role.
  UPDATE users
  SET role = 'admin'
  WHERE lower(trim(role)) = 'super_admin';

  UPDATE users
  SET role = 'student'
  WHERE role IS NULL OR TRIM(role) = '';

  UPDATE users
  SET account_status = 'active'
  WHERE account_status IS NULL OR TRIM(account_status) = '';

  CREATE INDEX IF NOT EXISTS idx_users_role_status
  ON users(role, account_status);
`);

// Admin activity log: records important actions made from the admin panel.
db.exec(`
  CREATE TABLE IF NOT EXISTS admin_activity_logs (
    id INTEGER PRIMARY KEY AUTOINCREMENT,

    actor_user_id INTEGER DEFAULT NULL
      REFERENCES users(id) ON DELETE SET NULL,

    target_user_id INTEGER DEFAULT NULL
      REFERENCES users(id) ON DELETE SET NULL,

    action TEXT NOT NULL,
    details TEXT DEFAULT NULL,
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
  );

  CREATE INDEX IF NOT EXISTS idx_admin_activity_created
  ON admin_activity_logs(created_at DESC);

  CREATE INDEX IF NOT EXISTS idx_admin_activity_actor
  ON admin_activity_logs(actor_user_id, created_at DESC);
`);

console.log('Admin roles, account status and activity logs are ready.');

// ======================================
// UNIVERSITY MASTER DATA TABLE (ID Verification)
// ======================================

db.exec(`
  CREATE TABLE IF NOT EXISTS university_data (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    university_name TEXT NOT NULL,
    master_id TEXT NOT NULL,
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
  );

  -- তোমার কার্ডের ডাটা এখানে সেভ হয়ে থাকবে (শুধু একবার হবে)
  INSERT OR IGNORE INTO university_data (university_name, master_id) 
  VALUES ('NORTHERN UNIVERSITY', '41240302505');
`);

console.log('University master data is ready for ID verification.');

// ======================================
// DATABASE CHECK
// ======================================

const requiredUserColumns = [
  'id',
  'name',
  'student_id',
  'department',
  'password_hash',
  'university',
  'profile_picture',
  'phone1',
  'phone2',
  'student_card',
  'gender',
  'gender_verified',
  'role',
  'account_status',
  'is_verified',
  'created_at'
];

const finalUserColumns = db.prepare(
  'PRAGMA table_info(users)'
).all();

const missingColumns = requiredUserColumns.filter(
  name => !finalUserColumns.some(column => column.name === name)
);

if (missingColumns.length > 0) {
  throw new Error(
    `Database migration incomplete. Missing users columns: ${missingColumns.join(', ')}`
  );
}

// ======================================
// DATABASE READY
// ======================================

console.log('CampusPool database migration completed.');
console.log('Database location:', dbPath);
console.log('Profile verification columns are ready.');
console.log('Gender columns are ready.');
console.log('Emergency Contact system is ready.');

module.exports = db;