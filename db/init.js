// db/init.js
// Sets up the SQLite database and seeds it with demo data for the presentation.
const Database = require('better-sqlite3');
const bcrypt = require('bcryptjs');
const path = require('path');

const db = new Database(path.join(__dirname, 'hotel.db'));
db.pragma('journal_mode = WAL');

db.exec(`
CREATE TABLE IF NOT EXISTS users (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  username TEXT UNIQUE NOT NULL,
  password TEXT NOT NULL,
  role TEXT NOT NULL DEFAULT 'staff'
);

CREATE TABLE IF NOT EXISTS rooms (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  room_number TEXT UNIQUE NOT NULL,
  room_type TEXT NOT NULL,
  price_per_night REAL NOT NULL,
  status TEXT NOT NULL DEFAULT 'Available' -- Available, Occupied, Maintenance
);

CREATE TABLE IF NOT EXISTS guests (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  full_name TEXT NOT NULL,
  email TEXT,
  phone TEXT,
  nic_passport TEXT,
  created_at TEXT DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS reservations (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  guest_id INTEGER NOT NULL,
  room_id INTEGER NOT NULL,
  check_in TEXT NOT NULL,
  check_out TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'Confirmed', -- Confirmed, CheckedIn, CheckedOut, Cancelled
  created_at TEXT DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (guest_id) REFERENCES guests(id),
  FOREIGN KEY (room_id) REFERENCES rooms(id)
);

CREATE TABLE IF NOT EXISTS bills (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  reservation_id INTEGER NOT NULL,
  room_charge REAL NOT NULL,
  extra_charges REAL NOT NULL DEFAULT 0,
  tax REAL NOT NULL DEFAULT 0,
  total REAL NOT NULL,
  payment_status TEXT NOT NULL DEFAULT 'Unpaid', -- Unpaid, Paid
  generated_at TEXT DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (reservation_id) REFERENCES reservations(id)
);
`);

// Seed an admin user if none exists
const userCount = db.prepare('SELECT COUNT(*) AS c FROM users').get().c;
if (userCount === 0) {
  const hash = bcrypt.hashSync('admin123', 10);
  db.prepare('INSERT INTO users (username, password, role) VALUES (?, ?, ?)')
    .run('admin', hash, 'admin');
  console.log('Seeded default user -> username: admin | password: admin123');
}

// Seed some rooms for demo purposes
const roomCount = db.prepare('SELECT COUNT(*) AS c FROM rooms').get().c;
if (roomCount === 0) {
  const insertRoom = db.prepare(
    'INSERT INTO rooms (room_number, room_type, price_per_night, status) VALUES (?, ?, ?, ?)'
  );
  const demoRooms = [
    ['101', 'Standard', 8000, 'Available'],
    ['102', 'Standard', 8000, 'Occupied'],
    ['201', 'Deluxe', 14000, 'Available'],
    ['202', 'Deluxe', 14000, 'Available'],
    ['301', 'Suite', 25000, 'Maintenance'],
  ];
  demoRooms.forEach((r) => insertRoom.run(...r));
  console.log('Seeded demo rooms');
}

module.exports = db;
