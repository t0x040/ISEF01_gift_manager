# Geschenke-Manager

Webapp zur strukturierten Geschenkplanung - ISEF01 Projekt Software Engineering.

## Setup

```bash
npm install
npm start
```

Dann im Browser: http://localhost:3000

## Entwicklung (mit Auto-Reload)

```bash
npm run dev
```

## Features

- Personen mit Geburtstagen verwalten
- Geschenkideen mit Text, Links und Bildern erfassen
- Anlaesse verwalten (Geburtstag, Weihnachten + benutzerdefinierte)
- Geschenkideen als "besorgt" markieren oder in Geschenke umwandeln
- Vergangene Geschenke pro Person dokumentieren
- Geburtstags-Benachrichtigungen fuer den naechsten Monat
- Weihnachts-Status-Uebersicht (Nov-Dez)
- Geschenkideen per Link teilen
- Automatische Geschenkvorschlaege generieren
- Druckansicht als HTML

## Tech-Stack

| Komponente | Technologie | Begruendung |
|-----------|-------------|-------------|
| Runtime | **Node.js** | Leichtgewichtig, schneller Start auf Render, grosses Ecosystem |
| Backend-Framework | **Express** | Minimalistisch, flexibel, kein Overhead durch unnoetige Abstraktionen |
| Templating | **EJS** | Server-side Rendering ohne Build-Schritt; kein separates Frontend-Projekt noetig |
| Styling | **Tailwind CSS (CDN)** | Utility-first CSS ohne Build-Pipeline; CDN-Einbindung vermeidet Tooling-Komplexitaet |
| Datenbank | **SQLite (sql.js)** | Eingebettete DB ohne externen Service; keine Verbindungskonfiguration, kein Cold-Start |
| Datei-Uploads | **Multer** | Standard-Middleware fuer multipart/form-data in Express |
| Deployment | **Render** | PaaS mit automatischem HTTPS, GitHub-Integration und persistentem Disk-Storage |
| CI/CD | **GitHub Actions** | Automatischer Health-Check und Deploy-Trigger bei Push auf main |
