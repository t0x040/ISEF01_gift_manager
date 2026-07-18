require('dotenv').config();
const express = require('express');
const path = require('path');
const fs = require('fs');
const crypto = require('crypto');
const multer = require('multer');
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

// File Upload
const storage = multer.diskStorage({
  destination: path.join(__dirname, 'public/uploads'),
  filename: (req, file, cb) => {
    const ext = path.extname(file.originalname);
    cb(null, Date.now() + ext);
  }
});
const upload = multer({ storage });

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
  const result = db.exec(
    'SELECT COUNT(*) AS count FROM occasions'
  );

  const count = result[0]?.values[0]?.[0] ?? 0;

  if (count === 0) {
    db.run(
      'INSERT INTO occasions (name, is_fixed) VALUES (?, ?)',
      ['Geburtstag', 1]
    );

    db.run(
      'INSERT INTO occasions (name, is_fixed) VALUES (?, ?)',
      ['Weihnachten', 1]
    );
  }

  saveDatabase();
}

// ============================================================
// HELPER FUNCTIONS
// ============================================================

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

// Helper: notification for persons birthday next month
function getBirthdayNotifications() {
  const now = new Date();
  const nextMonth = now.getMonth() + 2;
  if (nextMonth > 12) nextMonth = 1;
  const monthStr = String(nextMonth).padStart(2, '0');

  return query(`
    SELECT p.*, COUNT(gi.id) AS idea_count
    FROM persons p
    LEFT JOIN gift_ideas gi ON gi.person_id = p.id
    WHERE substr(p.birthday, 6, 2) = ?
    GROUP BY p.id
  `, [monthStr]);
}

// Helper: check Christmas status
function getChristmasStatus() {
  const month = new Date().getMonth() + 1;
  if (month < 11) return null;

  return query(`
    SELECT p.*,
      COUNT(CASE WHEN gi.occasion_id = 2 AND gi.is_purchased = 1 THEN 1 END) AS purchased_count,
      COUNT(CASE WHEN gi.occasion_id = 2 THEN 1 END) AS total_ideas
    FROM persons p
    LEFT JOIN gift_ideas gi ON gi.person_id = p.id
    GROUP BY p.id
  `);
}

// Helper: Gift idea generator
const SUGGESTION_POOL = {
  'buch': ['Hoerbuch-Abo', 'Leselampe', 'Buchgutschein', 'Lesezeichen-Set', 'Buch-Abo'],
  'technik': ['Powerbank', 'Handyhuelle', 'USB-Hub', 'Bluetooth-Box', 'Tablet-Staender'],
  'kueche': ['Kochbuch', 'Gewuerzset', 'Schuerze', 'Tee-Sortiment', 'Kaffeemuehle'],
  'kleidung': ['Schal', 'Muetze', 'Socken-Abo', 'Gutschein Lieblingsmarke', 'Handschuhe'],
  'spiel': ['Puzzle', 'Kartenspiel', 'Brettspiel', 'Escape-Room-Gutschein', 'Videospiel'],
  'gutschein': ['Kino-Gutschein', 'Restaurant-Gutschein', 'Wellness-Gutschein', 'Erlebnis-Gutschein'],
  'musik': ['Konzertkarten', 'Vinyl-Platte', 'Kopfhoerer', 'Streaming-Abo'],
  'sport': ['Trinkflasche', 'Fitness-Band', 'Yoga-Matte', 'Sportgutschein'],
  'garten': ['Blumensamen', 'Gartenhandschuhe', 'Kraeutertopf', 'Giesskanne'],
  'kosmetik': ['Parfuem', 'Badebomben-Set', 'Handcreme', 'Duftkerze'],
};

function generateSuggestions(personId) {
  const pastGifts = query(`SELECT description FROM gifts WHERE person_id = ?`, [personId]);
  const existingIdeas = query(`SELECT title FROM gift_ideas WHERE person_id = ?`, [personId]);

  const allText = [...pastGifts.map(g => g.description), ...existingIdeas.map(i => i.title)]
  .join(' ').toLowerCase();

  const matchedCategories = Object.keys(SUGGESTION_POOL)
  .filter(category => allText.includes(category));

  let suggestions;
  if (matchedCategories.length === 0) {
    const allSuggestions = Object.values(SUGGESTION_POOL).flat();
    suggestions = allSuggestions.sort(() => Math.random() - 0.5).slice(0, 6);
  } else {
    suggestions = matchedCategories
      .flatMap(cat => SUGGESTION_POOL[cat])
      .filter(s => !allText.includes(s.toLowerCase()))
      .slice(0, 6);
  }
  return suggestions;
}

// ============================================================
// ROUTES
// ============================================================

// Dashboard
app.get('/', (req, res) => {
  const birthdays = getBirthdayNotifications();
  const christmasStatus = getChristmasStatus();
  const totalPersons = queryOne('SELECT COUNT(*) AS count FROM persons').count;
  const totalIdeas = queryOne('SELECT COUNT(*) AS count FROM gift_ideas WHERE is_purchased = 0').count;
  res.render('dashboard', { birthdays, christmasStatus, totalPersons, totalIdeas });
});

// Persons
app.get('/persons', (req, res) => {
  const persons = query(`
    SELECT p.*,
     COUNT(DISTINCT gi.id) AS idea_count,
     COUNT(DISTINCT g.id) AS gift_count
    FROM persons p
    LEFT JOIN gift_ideas gi ON gi.person_id = p.id
    LEFT JOIN gifts g ON g.person_id = p.id
    GROUP BY p.id
    ORDER BY p.name COLLATE NOCASE 
  `);
  res.render('persons', { persons });
});

app.post('/persons', (req, res) => {
  const { name, birthday, notes } = req.body;
  if (!name || name.trim() === '') return res.redirect('/persons');
  run('INSERT INTO persons (name, birthday, notes) VALUES (?, ?, ?)', [
    name.trim(), 
    birthday || null, 
    notes || null
  ]);
  res.redirect('/persons');
});

app.get('/persons/:id', (req, res) => {
  const personId = parseInt(req.params.id);
  const person = queryOne('SELECT * FROM persons WHERE id = ?', [personId]);
  if (!person) return res.redirect('/persons');

  const ideas = query(`
    SELECT gi.*, o.name AS occasion_name
    FROM gift_ideas gi
    LEFT JOIN occasions o ON o.id = gi.occasion_id
    WHERE gi.person_id = ?
    ORDER BY gi.purchased ASC
  `, [personId]);

  const gifts = query(`
    SELECT g.*, o.name AS occasion_name
    FROM gifts g
    LEFT JOIN occasions o ON o.id = g.occasion_id
    WHERE g.person_id = ?
    ORDER BY g.gift_date DESC
  `, [personId]);

  const occasions = query('SELECT * FROM occasions');
  const suggestions = req.query.suggest === '1' ? generateSuggestions(personId) : null;
  const shareLink = queryOne('SELECT * FROM share_links WHERE person_id = ?', [personId]);

  res.render('person', { person, ideas, gifts, occasions, suggestions, shareLink });
});

app.post('/persons/:id/update', (req, res) => {
  const { name, birthday, notes } = req.body;
  if (!name || name.trim() === '') return res.redirect(`/persons/${req.params.id}`);
  const personId = parseInt(req.params.id);
  run('UPDATE persons SET name = ?, birthday = ?, notes = ? WHERE id = ?', [
    name.trim(),
    birthday || null,
    notes || null,
    personId
  ]);
  res.redirect(`/persons/${req.params.id}`);
});

app.post('/persons/:id/delete', (req, res) => {
  const personId = parseInt(req.params.id);
  run('DELETE FROM persons WHERE id = ?', [personId]);
  res.redirect('/persons');
});

// Occasions
app.get('/occasions', (req, res) => {
  const occasions = query('SELECT * FROM occasions');
  res.render('occasions', { occasions });
});

app.post('/occasions', (req, res) => {
  const { name } = req.body;
  if (!name || name.trim() === '') return res.redirect('/occasions');
  run('INSERT INTO occasions (name, is_fixed) VALUES (?)', [name.trim()]);
  res.redirect('/occasions');
});

app.post('/occasions/:id/delete', (req, res) => {
  const occasion = queryOne('SELECT * FROM occasions WHERE id = ?', [parseInt(req.params.id)]);
  if (occasion && !occasion.is_fixed) {
    run('DELETE FROM occasions WHERE id = ?', [parseInt(req.params.id)]);
  }
  res.redirect('/occasions');
});

// Suggestions
app.get('/persons/:id/suggestions', (req, res) => {
  res.redirect(`/persons/${req.params.id}?suggest=1`);
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
