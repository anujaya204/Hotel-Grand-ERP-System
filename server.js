// server.js
// Hotel Grand ERP System - single-file Express server
require('dotenv').config();
const express = require('express');
const session = require('express-session');
const bcrypt = require('bcryptjs');
const path = require('path');
const db = require('./db/init');

const app = express();
const PORT = process.env.PORT || 3000;

app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));
app.use(express.urlencoded({ extended: true }));
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

app.use(
  session({
    secret: process.env.SESSION_SECRET || 'hotel-grand-erp-secret-key',
    resave: false,
    saveUninitialized: false,
    cookie: { maxAge: 1000 * 60 * 60 * 4 }, // 4 hours
  })
);

// ---------- Auth middleware ----------
function requireLogin(req, res, next) {
  if (req.session && req.session.user) return next();
  return res.redirect('/login');
}

app.use((req, res, next) => {
  res.locals.user = req.session.user || null;
  next();
});

// ---------- AUTH ROUTES ----------
app.get('/login', (req, res) => {
  if (req.session.user) return res.redirect('/dashboard');
  res.render('login', { error: null });
});

app.post('/login', (req, res) => {
  const { username, password } = req.body;
  const user = db.prepare('SELECT * FROM users WHERE username = ?').get(username);
  if (!user || !bcrypt.compareSync(password, user.password)) {
    return res.render('login', { error: 'Invalid username or password' });
  }
  req.session.user = { id: user.id, username: user.username, role: user.role };
  res.redirect('/dashboard');
});

app.post('/logout', (req, res) => {
  req.session.destroy(() => res.redirect('/login'));
});

app.get('/', (req, res) => res.redirect(req.session.user ? '/dashboard' : '/login'));

// ---------- DASHBOARD ----------
app.get('/dashboard', requireLogin, (req, res) => {
  const totalRooms = db.prepare('SELECT COUNT(*) AS c FROM rooms').get().c;
  const availableRooms = db.prepare("SELECT COUNT(*) AS c FROM rooms WHERE status='Available'").get().c;
  const occupiedRooms = db.prepare("SELECT COUNT(*) AS c FROM rooms WHERE status='Occupied'").get().c;
  const totalGuests = db.prepare('SELECT COUNT(*) AS c FROM guests').get().c;
  const activeReservations = db
    .prepare("SELECT COUNT(*) AS c FROM reservations WHERE status IN ('Confirmed','CheckedIn')")
    .get().c;
  const unpaidBills = db.prepare("SELECT COUNT(*) AS c FROM bills WHERE payment_status='Unpaid'").get().c;
  const revenue = db.prepare("SELECT COALESCE(SUM(total),0) AS s FROM bills WHERE payment_status='Paid'").get().s;

  const recentReservations = db
    .prepare(
      `SELECT r.id, g.full_name, ro.room_number, r.check_in, r.check_out, r.status
       FROM reservations r
       JOIN guests g ON g.id = r.guest_id
       JOIN rooms ro ON ro.id = r.room_id
       ORDER BY r.id DESC LIMIT 5`
    )
    .all();

  res.render('dashboard', {
    stats: { totalRooms, availableRooms, occupiedRooms, totalGuests, activeReservations, unpaidBills, revenue },
    recentReservations,
  });
});

// ---------- MODULE 1: ROOM MANAGEMENT ----------
app.get('/rooms', requireLogin, (req, res) => {
  const rooms = db.prepare('SELECT * FROM rooms ORDER BY room_number').all();
  res.render('rooms', { rooms });
});

app.post('/rooms', requireLogin, (req, res) => {
  const { room_number, room_type, price_per_night, status } = req.body;
  db.prepare(
    'INSERT INTO rooms (room_number, room_type, price_per_night, status) VALUES (?, ?, ?, ?)'
  ).run(room_number, room_type, price_per_night, status);
  res.redirect('/rooms');
});

app.post('/rooms/:id/update', requireLogin, (req, res) => {
  const { status } = req.body;
  db.prepare('UPDATE rooms SET status = ? WHERE id = ?').run(status, req.params.id);
  res.redirect('/rooms');
});

app.post('/rooms/:id/delete', requireLogin, (req, res) => {
  db.prepare('DELETE FROM rooms WHERE id = ?').run(req.params.id);
  res.redirect('/rooms');
});

// ---------- MODULE 2: GUEST / CUSTOMER MANAGEMENT ----------
app.get('/guests', requireLogin, (req, res) => {
  const guests = db.prepare('SELECT * FROM guests ORDER BY id DESC').all();
  res.render('guests', { guests });
});

app.post('/guests', requireLogin, (req, res) => {
  const { full_name, email, phone, nic_passport } = req.body;
  db.prepare(
    'INSERT INTO guests (full_name, email, phone, nic_passport) VALUES (?, ?, ?, ?)'
  ).run(full_name, email, phone, nic_passport);
  res.redirect('/guests');
});

app.post('/guests/:id/delete', requireLogin, (req, res) => {
  db.prepare('DELETE FROM guests WHERE id = ?').run(req.params.id);
  res.redirect('/guests');
});

// ---------- MODULE 3: RESERVATIONS (integrates Rooms + Guests) ----------
app.get('/reservations', requireLogin, (req, res) => {
  const reservations = db
    .prepare(
      `SELECT r.id, g.full_name, ro.room_number, ro.price_per_night, r.check_in, r.check_out, r.status, r.room_id, r.guest_id
       FROM reservations r
       JOIN guests g ON g.id = r.guest_id
       JOIN rooms ro ON ro.id = r.room_id
       ORDER BY r.id DESC`
    )
    .all();
  const guests = db.prepare('SELECT * FROM guests ORDER BY full_name').all();
  const rooms = db.prepare("SELECT * FROM rooms WHERE status = 'Available' ORDER BY room_number").all();
  res.render('reservations', { reservations, guests, rooms });
});

app.post('/reservations', requireLogin, (req, res) => {
  const { guest_id, room_id, check_in, check_out } = req.body;
  const insert = db.prepare(
    'INSERT INTO reservations (guest_id, room_id, check_in, check_out, status) VALUES (?, ?, ?, ?, ?)'
  );
  insert.run(guest_id, room_id, check_in, check_out, 'Confirmed');
  // Business process integration: booking a room marks it Occupied
  db.prepare("UPDATE rooms SET status = 'Occupied' WHERE id = ?").run(room_id);
  res.redirect('/reservations');
});

app.post('/reservations/:id/checkout', requireLogin, (req, res) => {
  const reservation = db.prepare('SELECT * FROM reservations WHERE id = ?').get(req.params.id);
  if (reservation) {
    db.prepare("UPDATE reservations SET status = 'CheckedOut' WHERE id = ?").run(reservation.id);
    db.prepare("UPDATE rooms SET status = 'Available' WHERE id = ?").run(reservation.room_id);

    // Business process integration: checkout auto-generates a bill
    const room = db.prepare('SELECT * FROM rooms WHERE id = ?').get(reservation.room_id);
    const nights = Math.max(
      1,
      Math.round(
        (new Date(reservation.check_out) - new Date(reservation.check_in)) / (1000 * 60 * 60 * 24)
      )
    );
    const roomCharge = nights * room.price_per_night;
    const tax = roomCharge * 0.1;
    const total = roomCharge + tax;
    db.prepare(
      'INSERT INTO bills (reservation_id, room_charge, extra_charges, tax, total, payment_status) VALUES (?, ?, ?, ?, ?, ?)'
    ).run(reservation.id, roomCharge, 0, tax, total, 'Unpaid');
  }
  res.redirect('/reservations');
});

app.post('/reservations/:id/cancel', requireLogin, (req, res) => {
  const reservation = db.prepare('SELECT * FROM reservations WHERE id = ?').get(req.params.id);
  if (reservation) {
    db.prepare("UPDATE reservations SET status = 'Cancelled' WHERE id = ?").run(reservation.id);
    db.prepare("UPDATE rooms SET status = 'Available' WHERE id = ?").run(reservation.room_id);
  }
  res.redirect('/reservations');
});

// ---------- MODULE 4: BILLING (integrates Reservations) ----------
app.get('/billing', requireLogin, (req, res) => {
  const bills = db
    .prepare(
      `SELECT b.*, g.full_name, ro.room_number
       FROM bills b
       JOIN reservations r ON r.id = b.reservation_id
       JOIN guests g ON g.id = r.guest_id
       JOIN rooms ro ON ro.id = r.room_id
       ORDER BY b.id DESC`
    )
    .all();
  res.render('billing', { bills });
});

app.post('/billing/:id/pay', requireLogin, (req, res) => {
  db.prepare("UPDATE bills SET payment_status = 'Paid' WHERE id = ?").run(req.params.id);
  res.redirect('/billing');
});

app.listen(PORT, () => {
  console.log(`Hotel Grand ERP System running on port ${PORT}`);
});
