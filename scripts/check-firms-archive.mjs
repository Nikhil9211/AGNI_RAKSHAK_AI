import fs from 'node:fs';
import path from 'node:path';

const root = path.resolve('server/data/historical/firms3y');
const manifestPath = path.join(root, 'manifest.json');
const required = [
  'modis_2022_India.csv.gz','modis_2023_India.csv.gz','modis_2024_India.csv.gz',
  'viirs-jpss1_2022_India.csv.gz','viirs-jpss1_2023_India.csv.gz','viirs-jpss1_2024_India.csv.gz',
  'viirs-snpp_2022_India.csv.gz','viirs-snpp_2023_India.csv.gz','viirs-snpp_2024_India.csv.gz'
];
if (!fs.existsSync(manifestPath)) throw new Error('Historical FIRMS manifest missing');
const manifest = JSON.parse(fs.readFileSync(manifestPath,'utf8'));
for (const file of required) {
  const p = path.join(root,'raw',file);
  if (!fs.existsSync(p)) throw new Error(`Missing archive: ${file}`);
}
console.log(`NASA FIRMS archive OK: ${manifest.total_records.toLocaleString()} India observations (2022–2024)`);
console.log(`Jhansi: ${manifest.jhansi.total_records.toLocaleString()} observations`);
console.log(`Jhansi repeat-cell candidates (≥3 obs across ≥2 dates): ${manifest.jhansi.persistence_cells_ge3_obs_2dates.toLocaleString()}`);
