# Hotel Grand ERP System

A prototype ERP system for the hotel industry, built for the Business Process and ERP Systems group assignment. It demonstrates process integration across four core modules using a single Node.js/Express application backed by SQLite.

## Industry: Hotel

## Modules (4)
1. **Room Management** – Add/manage rooms, room types, pricing, and status (Available / Occupied / Maintenance).
2. **Guest Management** – Register and manage guest/customer records.
3. **Reservations** – Book a room for a guest. Booking a room automatically marks it Occupied. Checking out automatically marks the room Available again and generates a bill.
4. **Billing** – View and settle bills. Bills are auto-generated from reservation data (nights stayed × room rate + 10% tax), demonstrating integration rather than manual re-entry.

## Business Process Flow
```
Guest registered → Reservation created (Room: Available → Occupied)
       → Guest checks out (Bill auto-generated, Room: Occupied → Available)
       → Billing module records payment (Unpaid → Paid)
```
This flow is the core "integration" story for the assignment: data entered once in one module flows automatically into the others, instead of being duplicated.

## Tech Stack
- **Backend:** Node.js, Express 5
- **Database:** SQLite (via `better-sqlite3`) – file-based, zero external DB server required
- **Frontend:** Server-rendered EJS templates + plain CSS (no build step)
- **Auth:** Session-based login with bcrypt-hashed passwords
- **Deployment target:** Microsoft Azure App Service (Linux, Node.js runtime)

## Local Setup
```bash
npm install
npm start
```
The app runs on `http://localhost:3000`. On first run it automatically creates the SQLite database and seeds:
- A default login: **username:** `admin` **password:** `admin123`
- 5 demo rooms

## Project Structure
```
server.js          Express app + all routes for the 4 modules
db/init.js          SQLite schema creation + seed data
views/              EJS templates (login, dashboard, rooms, guests, reservations, billing)
public/css/         Stylesheet
```

## Database Schema
- `users` (login credentials)
- `rooms` (room_number, room_type, price_per_night, status)
- `guests` (full_name, email, phone, nic_passport)
- `reservations` (guest_id, room_id, check_in, check_out, status)
- `bills` (reservation_id, room_charge, tax, total, payment_status)


