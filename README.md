# AGNI RAKSHAK AI

AI-assisted industrial fire and persistent thermal-source monitoring using NASA FIRMS, OpenStreetMap context, historical FIRMS evidence, and explainable risk scoring.

## Run on Windows
1. Install Node.js 20 or newer.
2. Double-click `START_AGNI_RAKSHAK.bat`. It checks dependencies, starts the server in a separate window, waits for `/api/health`, and then opens the app.
3. Keep the server window open while using the app. If startup fails, read the error in that window.

## Configuration
- NASA FIRMS API key is read from `FIRMS_API_KEY` in `.env` on the server only.
- The Settings panel shows only whether the key is configured.
- Persistent application records are stored in `server/.data/agni_rakshak_db.json`. The file is created automatically and is kept outside the frontend source tree.
- This version uses its built-in persistent JSON file database. It does not connect to PostgreSQL/PostGIS. The database file is created under `server/.data/` when the server runs.

## Data regions
Use the region selector for Jhansi, India, or Global. Live NASA FIRMS results and historical archive context are separate data sources. Historical detections are not presented as current incidents.

## Security
Do not commit or share `.env` publicly. If the key has been exposed, rotate it at the NASA FIRMS portal.

## Troubleshooting
- If the app window is blank, check the server window and browser console. The app now displays a readable message for uncaught screen-rendering errors.
- If the map has no imagery, verify that the computer can reach the Esri tile service and that the internet connection allows map tiles.
- NASA live detections require a valid FIRMS key and access to the NASA FIRMS API. The map basemap itself does not require the FIRMS key.
- If a previous dependency install was interrupted, delete the incomplete `node_modules` folder and run `npm ci` from this directory.
