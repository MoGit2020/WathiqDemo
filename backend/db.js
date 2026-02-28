const Database = require('better-sqlite3');
const path = require('path');

const DB_PATH = path.join(__dirname, 'wathiq.db');
const db = new Database(DB_PATH);

// Enable WAL mode for better concurrent read performance
db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');

// ─── Schema ──────────────────────────────────────────────────────────────────

db.exec(`
  CREATE TABLE IF NOT EXISTS users (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    name        TEXT    NOT NULL,
    email       TEXT    NOT NULL UNIQUE,
    password    TEXT    NOT NULL,
    role        TEXT    NOT NULL CHECK(role IN ('tenant','landlord')),
    civil_id    TEXT    UNIQUE,
    mobile      TEXT,
    nationality TEXT,
    sector      TEXT,
    malaa_score INTEGER DEFAULT 0,
    avatar_url  TEXT,
    rating      REAL    DEFAULT 0,
    verified    INTEGER DEFAULT 0,
    created_at  TEXT    DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS properties (
    id           INTEGER PRIMARY KEY AUTOINCREMENT,
    landlord_id  INTEGER NOT NULL REFERENCES users(id),
    title        TEXT    NOT NULL,
    price        REAL    NOT NULL,
    beds         INTEGER NOT NULL DEFAULT 0,
    baths        INTEGER NOT NULL DEFAULT 0,
    area         REAL,
    location     TEXT,
    block        TEXT,
    way          TEXT,
    building     TEXT,
    plot         TEXT,
    elec_account TEXT,
    water_account TEXT,
    image_url    TEXT,
    status       TEXT    NOT NULL DEFAULT 'available' CHECK(status IN ('available','rented','inactive')),
    created_at   TEXT    DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS reviews (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    reviewer_id INTEGER NOT NULL REFERENCES users(id),
    subject_id  INTEGER NOT NULL REFERENCES users(id),
    comment     TEXT    NOT NULL,
    rating      INTEGER NOT NULL CHECK(rating BETWEEN 1 AND 5),
    created_at  TEXT    DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS applications (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    tenant_id   INTEGER NOT NULL REFERENCES users(id),
    property_id INTEGER NOT NULL REFERENCES properties(id),
    status      TEXT    NOT NULL DEFAULT 'pending'
                        CHECK(status IN ('pending','approved','rejected','withdrawn')),
    message     TEXT,
    created_at  TEXT    DEFAULT (datetime('now')),
    updated_at  TEXT    DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS contracts (
    id               INTEGER PRIMARY KEY AUTOINCREMENT,
    application_id   INTEGER NOT NULL REFERENCES applications(id),
    property_id      INTEGER NOT NULL REFERENCES properties(id),
    tenant_id        INTEGER NOT NULL REFERENCES users(id),
    landlord_id      INTEGER NOT NULL REFERENCES users(id),
    rent_amount      REAL    NOT NULL,
    start_date       TEXT    NOT NULL,
    end_date         TEXT    NOT NULL,
    status           TEXT    NOT NULL DEFAULT 'draft'
                             CHECK(status IN ('draft','tenant_signed','landlord_signed','active','terminated')),
    tenant_signed_at  TEXT,
    landlord_signed_at TEXT,
    reference_no     TEXT    UNIQUE,
    created_at       TEXT    DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS payments (
    id           INTEGER PRIMARY KEY AUTOINCREMENT,
    contract_id  INTEGER NOT NULL REFERENCES contracts(id),
    tenant_id    INTEGER NOT NULL REFERENCES users(id),
    landlord_id  INTEGER NOT NULL REFERENCES users(id),
    amount       REAL    NOT NULL,
    platform_fee REAL    NOT NULL DEFAULT 0,
    due_date     TEXT    NOT NULL,
    paid_at      TEXT,
    status       TEXT    NOT NULL DEFAULT 'pending'
                         CHECK(status IN ('pending','paid','failed','overdue')),
    transaction_ref TEXT UNIQUE,
    created_at   TEXT    DEFAULT (datetime('now'))
  );
`);

module.exports = db;
