require('dotenv').config();
const express = require('express');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));
app.use(express.urlencoded({ extended: true }));
app.use(express.static(path.join(__dirname, 'public')));

// Dashboard-Route
app.get('/', (req, res) => {
  res.render('dashboard', {
    birthdays: [],
    christmasStatus: null,
    totalPersons: 0,
    totalIdeas: 0
  });
});

// Server starten
app.listen(PORT, () => {
  console.log(`Geschenke-Manager laeuft auf http://localhost:${PORT}`);
});
