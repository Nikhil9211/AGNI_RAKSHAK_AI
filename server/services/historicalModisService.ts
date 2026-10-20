import fs from 'fs';
import path from 'path';
import zlib from 'zlib';
import { Region, REGION_BOUNDS } from '../../src/types.ts';

export interface HistoricalModisObservation {
  id: string;
  latitude: number;
  longitude: number;
  brightness: number | null;
  scan: number | null;
  track: number | null;
  acq_date: string;
  acq_time: string;
  satellite: string;
  instrument: string;
  confidence: number | null;
  version: string;
  bright_t31: number | null;
  frp: number | null;
  daynight: 'D' | 'N' | null;
  type: 0 | 1 | 2 | 3 | null;
  source: 'NASA FIRMS MODIS C6.1 HISTORICAL';
}

interface CsvRow {
  latitude: string;
  longitude: string;
  brightness: string;
  scan: string;
  track: string;
  acq_date: string;
  acq_time: string;
  satellite: string;
  instrument: string;
  confidence: string;
  version: string;
  bright_t31: string;
  frp: string;
  daynight: string;
  type: string;
}

const DATA_DIR = path.join(process.cwd(), 'server', 'data', 'historical', 'modis');
const YEAR_FILES: Record<number, string> = {
  2022: path.join(DATA_DIR, 'modis_2022_India.csv.gz'),
  2023: path.join(DATA_DIR, 'modis_2023_India.csv.gz'),
  2024: path.join(DATA_DIR, 'modis_2024_India.csv.gz'),
};

export class HistoricalModisService {
  private static cache = new Map<number, HistoricalModisObservation[]>();

  private static num(value: string): number | null {
    const n = Number(value);
    return Number.isFinite(n) ? n : null;
  }

  private static parseCsv(raw: string, year: number): HistoricalModisObservation[] {
    const lines = raw.split(/\r?\n/).filter(Boolean);
    if (lines.length < 2) return [];

    const headers = lines[0].split(',').map((h) => h.trim());
    const idx = new Map(headers.map((h, i) => [h, i]));
    const get = (parts: string[], name: keyof CsvRow) => parts[idx.get(name) ?? -1]?.trim() ?? '';

    const observations: HistoricalModisObservation[] = [];
    for (let i = 1; i < lines.length; i++) {
      const parts = lines[i].split(',');
      const lat = this.num(get(parts, 'latitude'));
      const lon = this.num(get(parts, 'longitude'));
      if (lat === null || lon === null || lat < -90 || lat > 90 || lon < -180 || lon > 180) continue;

      const typeRaw = this.num(get(parts, 'type'));
      const type = typeRaw === 0 || typeRaw === 1 || typeRaw === 2 || typeRaw === 3 ? typeRaw : null;
      const date = get(parts, 'acq_date');
      const time = get(parts, 'acq_time').padStart(4, '0');
      const id = `MODIS-C61-${year}-${i}`;

      observations.push({
        id,
        latitude: lat,
        longitude: lon,
        brightness: this.num(get(parts, 'brightness')),
        scan: this.num(get(parts, 'scan')),
        track: this.num(get(parts, 'track')),
        acq_date: date,
        acq_time: time,
        satellite: get(parts, 'satellite'),
        instrument: get(parts, 'instrument'),
        confidence: this.num(get(parts, 'confidence')),
        version: get(parts, 'version'),
        bright_t31: this.num(get(parts, 'bright_t31')),
        frp: this.num(get(parts, 'frp')),
        daynight: get(parts, 'daynight').toUpperCase() === 'N' ? 'N' : 'D',
        type,
        source: 'NASA FIRMS MODIS C6.1 HISTORICAL',
      });
    }
    return observations;
  }

  private static loadYear(year: number): HistoricalModisObservation[] {
    const cached = this.cache.get(year);
    if (cached) return cached;
    const file = YEAR_FILES[year];
    if (!file || !fs.existsSync(file)) return [];

    try {
      const gz = fs.readFileSync(file);
      const raw = zlib.gunzipSync(gz).toString('utf8');
      const parsed = this.parseCsv(raw, year);
      this.cache.set(year, parsed);
      return parsed;
    } catch (error) {
      console.error(`[MODIS] Failed to load ${year}:`, error);
      return [];
    }
  }

  private static candidateYears(years?: number[]): number[] {
    const available = Object.keys(YEAR_FILES).map(Number).sort();
    if (!years || years.length === 0) return available;
    return years.filter((y) => available.includes(y));
  }

  private static withinRegion(obs: HistoricalModisObservation, region: Region): boolean {
    if (region === 'GLOBAL') {
      // The supplied archive files are India-only. GLOBAL means the full supplied archive scope.
      return true;
    }
    const bbox = REGION_BOUNDS[region];
    return obs.latitude >= bbox.south && obs.latitude <= bbox.north && obs.longitude >= bbox.west && obs.longitude <= bbox.east;
  }

  private static representativeSample(items: HistoricalModisObservation[], limit: number): HistoricalModisObservation[] {
    if (items.length <= limit) return items;
    // Deterministic spatial grid: choose the highest-FRP observation per cell, then fill from remaining records.
    const grid = new Map<string, HistoricalModisObservation>();
    const cellSize = 0.25;
    for (const item of items) {
      const gx = Math.floor((item.longitude + 180) / cellSize);
      const gy = Math.floor((item.latitude + 90) / cellSize);
      const key = `${gx}:${gy}`;
      const existing = grid.get(key);
      const score = (item.frp ?? 0) * 0.7 + (item.confidence ?? 0) * 0.3;
      const existingScore = existing ? (existing.frp ?? 0) * 0.7 + (existing.confidence ?? 0) * 0.3 : -1;
      if (!existing || score > existingScore) grid.set(key, item);
    }

    const result = Array.from(grid.values());
    if (result.length >= limit) {
      return result.sort((a, b) => ((b.frp ?? 0) - (a.frp ?? 0)) || ((b.confidence ?? 0) - (a.confidence ?? 0))).slice(0, limit);
    }

    const selected = new Set(result.map((r) => r.id));
    const remainder = items
      .filter((r) => !selected.has(r.id))
      .sort((a, b) => ((b.frp ?? 0) - (a.frp ?? 0)) || ((b.confidence ?? 0) - (a.confidence ?? 0)));
    return result.concat(remainder.slice(0, limit - result.length));
  }

  static query(options: { region?: Region; years?: number[]; limit?: number; minConfidence?: number }) {
    const region = options.region ?? 'GLOBAL';
    const limit = Math.min(Math.max(options.limit ?? 4000, 1), 10000);
    const minConfidence = options.minConfidence ?? 0;
    const years = this.candidateYears(options.years);
    const all = years.flatMap((year) => this.loadYear(year));
    const filtered = all.filter((obs) => this.withinRegion(obs, region) && (obs.confidence ?? 0) >= minConfidence);
    const points = this.representativeSample(filtered, limit);

    const typeCounts = { presumed_vegetation_fire: 0, active_volcano: 0, other_static_land_source: 0, offshore: 0, unknown: 0 };
    for (const item of filtered) {
      if (item.type === 0) typeCounts.presumed_vegetation_fire++;
      else if (item.type === 1) typeCounts.active_volcano++;
      else if (item.type === 2) typeCounts.other_static_land_source++;
      else if (item.type === 3) typeCounts.offshore++;
      else typeCounts.unknown++;
    }

    return {
      source: 'NASA FIRMS MODIS C6.1 HISTORICAL',
      dataset_scope: 'India',
      years,
      region,
      total_records: filtered.length,
      returned_points: points.length,
      min_confidence: minConfidence,
      sampling: points.length < filtered.length ? 'deterministic spatial sample for map performance' : 'all matching records',
      type_counts: typeCounts,
      points,
    };
  }

  static getStatus() {
    const years = this.candidateYears();
    const records = years.reduce((sum, year) => sum + this.loadYear(year).length, 0);
    return {
      available: years.length > 0 && records > 0,
      source: 'NASA FIRMS MODIS C6.1 HISTORICAL',
      dataset_scope: 'India',
      years,
      total_records: records,
      files: years.map((year) => path.basename(YEAR_FILES[year])),
      dataset_date_range: years.length ? `${years[0]}-01-01 to ${years[years.length - 1]}-12-31` : null,
      provenance: 'User-supplied NASA FIRMS MODIS C6.1 India CSV archives',
    };
  }
}
