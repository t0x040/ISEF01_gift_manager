require('dotenv').config();
const express = require('express');
const path = require('path');
const fs = require('fs');
const initSqlJs = require('sql.js');

const app = express();
const PORT = process.env.PORT || 3000;
const DB_PATH = process.env.DATABASE_PATH || './geschenke.db';

// ============================================================
// MIDDLEWARE
// ============================================================
app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));
app.use(express.urlencoded({ extended: true }));
app.use(express.static(path.join(__dirname, 'public')));

// ============================================================
// SQLITE-DATENBANK (sql.js)
// ============================================================
let db;

function saveDatabase() {
  const data = db.export();
  fs.writeFileSync(DB_PATH, Buffer.from(data));
}

async function initDatabase() {
  const SQL = await initSqlJs();

  if (fs.existsSync(DB_PATH)) {
    const fileBuffer = fs.readFileSync(DB_PATH);
    db = new SQL.Database(fileBuffer);
  } else {
    db = new SQL.Database();
  }

  db.run('PRAGMA foreign_keys = ON');

  db.run(`
    CREATE TABLE IF NOT EXISTS persons (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      birthday TEXT,
      notes TEXT,
      created_at TEXT DEFAULT (datetime('now'))
    )
  `);

  db.run(`
    CREATE TABLE IF NOT EXISTS occasions (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      is_fixed INTEGER NOT NULL DEFAULT 0
    )
  `);

  db.run(`
    CREATE TABLE IF NOT EXISTS gifts (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      person_id INTEGER NOT NULL,
      occasion_id INTEGER,
      description TEXT NOT NULL,
      gift_date TEXT,
      notes TEXT,
      FOREIGN KEY (person_id) REFERENCES persons(id) ON DELETE CASCADE,
      FOREIGN KEY (occasion_id) REFERENCES occasions(id) ON DELETE SET NULL
    )
  `);

  db.run(`
    CREATE TABLE IF NOT EXISTS gift_ideas (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      person_id INTEGER NOT NULL,
      occasion_id INTEGER,
      title TEXT NOT NULL,
      description TEXT,
      link TEXT,
      image_path TEXT,
      is_purchased INTEGER NOT NULL DEFAULT 0,
      open_tasks TEXT,
      created_at TEXT DEFAULT (datetime('now')),
      FOREIGN KEY (person_id) REFERENCES persons(id) ON DELETE CASCADE,
      FOREIGN KEY (occasion_id) REFERENCES occasions(id) ON DELETE SET NULL
    )
  `);

  db.run(`
    CREATE TABLE IF NOT EXISTS share_links (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      token TEXT NOT NULL UNIQUE,
      person_id INTEGER NOT NULL,
      FOREIGN KEY (person_id) REFERENCES persons(id) ON DELETE CASCADE
    )
  `);

  // Seed default occasions if empty
  const [{ count }] = db.exec('SELECT COUNT(*) as count FROM occasions')[0]?.values || [[0]];
  if (count === 0) {
    db.run('INSERT INTO occasions (name, is_fixed) VALUES (?, ?)', ['Geburtstag', 1]);
    db.run('INSERT INTO occasions (name, is_fixed) VALUES (?, ?)', ['Weihnachten', 1]);
  }

  saveDatabase();
}

// Helper: run SELECT and return array of objects
function query(sql, params = []) {
  const stmt = db.prepare(sql);
  stmt.bind(params);
  const rows = [];
  while (stmt.step()) {
    rows.push(stmt.getAsObject());
  }
  stmt.free();
  return rows;
}

// Helper: run SELECT and return first row or null
function queryOne(sql, params = []) {
  const rows = query(sql, params);
  return rows.length > 0 ? rows[0] : null;
}

// Helper: run INSERT/UPDATE/DELETE
function run(sql, params = []) {
  db.run(sql, params);
  saveDatabase();
}

// ============================================================
// ROUTES
// ============================================================

app.get('/', (req, res) => {
  res.render('dashboard', {
    birthdays: [],
    christmasStatus: null,
    totalPersons: 0,
    totalIdeas: 0
  });
});

// ============================================================
// START SERVER
// ============================================================

initDatabase().then(() => {
  app.listen(PORT, () => {
    console.log(`Geschenke-Manager laeuft auf http://localhost:${PORT}`);
  });
}).catch(err => {
  console.error('Datenbank-Initialisierung fehlgeschlagen:', err);
  process.exit(1);
});
