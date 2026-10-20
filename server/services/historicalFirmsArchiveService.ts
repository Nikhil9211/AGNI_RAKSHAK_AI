import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import { Region, REGION_BOUNDS } from '../../src/types.ts';

export type ArchiveSensor = 'ALL' | 'MODIS' | 'NOAA-20' | 'SUOMI-NPP';

export interface HistoricalFirmsPoint {
  id: string;
  latitude: number;
  longitude: number;
  lat: number;
  lon: number;
  acq_date: string;
  date: string;
  acq_time: string;
  time: string;
  satellite: string;
  instrument: string;
  confidence: number | null;
  confidence_raw: string;
  frp: number | null;
  brightness: number | null;
  bright_ti4: number | null;
  bright_ti5: number | null;
  bright_t31: number | null;
  scan: number | null;
  track: number | null;
  daynight: string | null;
  type: number | null;
  source: string;
  year: number;
}

interface Manifest {
  total_records: number;
  by_source: Record<string, number>;
  by_year: Record<string, number>;
  high_confidence_70plus_normalized: number;
  frp_max_mw: number;
  frp_mean_mw: number;
  by_type: Record<string, number>;
  jhansi: {
    total_records: number;
    by_source: Record<string, number>;
    by_year: Record<string, number>;
    high_confidence_70plus_normalized: number;
    frp_max_mw: number;
    frp_mean_mw: number;
    by_type: Record<string, number>;
    monthly: Record<string, number>;
    persistence_cells_ge2_dates: number;
    persistence_cells_ge3_obs_2dates: number;
  };
  india_monthly: Record<string, number>;
  manifest: Array<{ file: string; source: string; year: number; records: number }>;
}

interface SampleFile {
  source: string;
  scope: string;
  sampling: string;
  total_records: number;
  points: HistoricalFirmsPoint[];
}

const BASE = path.join(process.cwd(), 'server', 'data', 'historical', 'firms3y');
const MANIFEST_FILE = path.join(BASE, 'manifest.json');
const INDIA_SAMPLE_FILE = path.join(BASE, 'india_map_sample.json');
const JHANSI_FILE = path.join(BASE, 'jhansi_points.json');
const HIGH_CONF_SAMPLE_FILE = path.join(BASE, 'high_confidence_sample_35pct.json');

export class HistoricalFirmsArchiveService {
  private static manifest: Manifest | null = null;
  private static indiaSample: SampleFile | null = null;
  private static jhansiPoints: SampleFile | null = null;
  private static highConfidenceSample: { source: string; sampling: string; high_confidence_total: number; sample_fraction: number; sample_records: number; points: HistoricalFirmsPoint[] } | null = null;

  private static loadManifest(): Manifest | null {
    if (this.manifest) return this.manifest;
    try {
      if (!fs.existsSync(MANIFEST_FILE)) return null;
      this.manifest = JSON.parse(fs.readFileSync(MANIFEST_FILE, 'utf8')) as Manifest;
      return this.manifest;
    } catch (error) {
      console.error('[Historical FIRMS] manifest load failed:', error);
      return null;
    }
  }

  // NASA FIRMS raw exports do not contain a natural unique identifier for individual fire records.
  // We construct a deterministic composite ID from satellite, latitude, longitude, date, and time,
  // appending a stable record hash (frp, brightness, scan/track, confidence) as disambiguator
  // so IDs remain completely unique and deterministic across server reloads without using array indices.
  private static normalizePoint(p: any): HistoricalFirmsPoint {
    const lat = Number(p.latitude ?? p.lat ?? 0);
    const lon = Number(p.longitude ?? p.lon ?? 0);
    const date = String(p.acq_date ?? p.date ?? '');
    const time = String(p.acq_time ?? p.time ?? '');
    const satellite = String(p.satellite ?? p.instrument ?? 'SAT').replace(/[^a-zA-Z0-9_-]/g, '');
    const year = Number(p.year ?? (date ? parseInt(date.slice(0, 4), 10) : 2024));

    // Stable disambiguator for duplicate detections / co-located multi-satellite passes
    const disambiguator = crypto
      .createHash('md5')
      .update(`${satellite}|${lat.toFixed(5)}|${lon.toFixed(5)}|${date}|${time}|${p.frp ?? ''}|${p.brightness ?? ''}|${p.bright_ti4 ?? ''}|${p.bright_ti5 ?? ''}|${p.track ?? ''}|${p.scan ?? ''}|${p.daynight ?? ''}|${p.confidence_raw ?? p.confidence ?? ''}`)
      .digest('hex')
      .slice(0, 8);

    const generatedId = `hist_${satellite}_${lat.toFixed(4)}_${lon.toFixed(4)}_${date}_${time}_${disambiguator}`;
    const id = p.id ? String(p.id) : generatedId;

    return {
      ...p,
      id,
      latitude: lat,
      longitude: lon,
      lat,
      lon,
      acq_date: date,
      date,
      acq_time: time,
      time,
      satellite: p.satellite ?? '',
      instrument: p.instrument ?? '',
      confidence: p.confidence ?? null,
      confidence_raw: p.confidence_raw ?? '',
      frp: p.frp != null ? Number(p.frp) : null,
      brightness: p.brightness != null ? Number(p.brightness) : null,
      bright_ti4: p.bright_ti4 != null ? Number(p.bright_ti4) : null,
      bright_ti5: p.bright_ti5 != null ? Number(p.bright_ti5) : null,
      bright_t31: p.bright_t31 != null ? Number(p.bright_t31) : null,
      scan: p.scan != null ? Number(p.scan) : null,
      track: p.track != null ? Number(p.track) : null,
      daynight: p.daynight ?? null,
      type: p.type != null ? Number(p.type) : null,
      source: p.source ?? 'NASA FIRMS',
      year,
    };
  }

  private static loadIndiaSample(): SampleFile {
    if (this.indiaSample) return this.indiaSample;
    try {
      const raw = JSON.parse(fs.readFileSync(INDIA_SAMPLE_FILE, 'utf8'));
      this.indiaSample = {
        ...raw,
        points: (Array.isArray(raw.points) ? raw.points : []).map((p: any) => this.normalizePoint(p)),
      };
    } catch {
      this.indiaSample = { source: 'NASA FIRMS historical archive', scope: 'India', sampling: 'unavailable', total_records: 0, points: [] };
    }
    return this.indiaSample;
  }

  private static loadJhansiPoints(): SampleFile {
    if (this.jhansiPoints) return this.jhansiPoints;
    try {
      const raw = JSON.parse(fs.readFileSync(JHANSI_FILE, 'utf8'));
      this.jhansiPoints = {
        ...raw,
        points: (Array.isArray(raw.points) ? raw.points : []).map((p: any) => this.normalizePoint(p)),
      };
    } catch {
      this.jhansiPoints = { source: 'NASA FIRMS historical archive', scope: 'Jhansi', sampling: 'all matching records', total_records: 0, points: [] };
    }
    return this.jhansiPoints;
  }

  private static inRegion(point: HistoricalFirmsPoint, region: Region): boolean {
    if (region === 'GLOBAL') return true;
    const bbox = REGION_BOUNDS[region];
    return point.latitude >= bbox.south && point.latitude <= bbox.north && point.longitude >= bbox.west && point.longitude <= bbox.east;
  }

  private static inDateRange(point: HistoricalFirmsPoint, fromYear?: number, toYear?: number): boolean {
    if (!fromYear && !toYear) return true;
    if (fromYear && point.year < fromYear) return false;
    if (toYear && point.year > toYear) return false;
    return true;
  }

  static getStatus() {
    const manifest = this.loadManifest();
    if (!manifest) {
      return {
        available: false,
        source: 'NASA FIRMS historical archive',
        scope: 'India',
        years: [],
        total_records: 0,
        provenance: 'User-supplied NASA FIRMS archive files',
      };
    }
    return {
      available: manifest.total_records > 0,
      source: 'NASA FIRMS historical archive',
      scope: 'India',
      years: Object.keys(manifest.by_year).map(Number).sort(),
      total_records: manifest.total_records,
      by_source: manifest.by_source,
      by_year: manifest.by_year,
      high_confidence_70plus_normalized: manifest.high_confidence_70plus_normalized,
      frp_max_mw: manifest.frp_max_mw,
      frp_mean_mw: manifest.frp_mean_mw,
      jhansi: manifest.jhansi,
      files: manifest.manifest,
      provenance: 'User-supplied NASA FIRMS India archive: MODIS C6.1, VIIRS NOAA-20, VIIRS Suomi-NPP, 2022–2024',
      note: 'Historical archive data is not current NRT activity. Confidence values are normalized to a prototype 0–100 scale for cross-sensor display.',
    };
  }

  static getSummary(region: Region = 'GLOBAL') {
    const manifest = this.loadManifest();
    if (!manifest) return this.getStatus();
    if (region === 'JHANSI') {
      return { ...this.getStatus(), region, total_records: manifest.jhansi.total_records, by_source: manifest.jhansi.by_source, by_year: manifest.jhansi.by_year, high_confidence_70plus_normalized: manifest.jhansi.high_confidence_70plus_normalized, frp_max_mw: manifest.jhansi.frp_max_mw, frp_mean_mw: manifest.jhansi.frp_mean_mw, by_type: manifest.jhansi.by_type, monthly: manifest.jhansi.monthly, persistence_cells_ge2_dates: manifest.jhansi.persistence_cells_ge2_dates, persistence_cells_ge3_obs_2dates: manifest.jhansi.persistence_cells_ge3_obs_2dates };
    }
    if (region === 'INDIA') return { ...this.getStatus(), region, monthly: manifest.india_monthly };
    return { ...this.getStatus(), region: 'GLOBAL', note: 'The supplied historical archive covers India only; GLOBAL here means the full supplied archive scope.' };
  }

  static getPoints(options: { region?: Region; sensor?: ArchiveSensor; fromYear?: number; toYear?: number; limit?: number }) {
    const region = options.region ?? 'GLOBAL';
    const sensor = options.sensor ?? 'ALL';
    const limit = Math.min(Math.max(options.limit ?? (region === 'JHANSI' ? 5000 : 12000), 1), 20000);
    const source = region === 'JHANSI' ? this.loadJhansiPoints() : this.loadIndiaSample();
    let points = source.points.filter((point) => this.inDateRange(point, options.fromYear, options.toYear));

    if (sensor !== 'ALL') {
      points = points.filter((point) => point.source === sensor || point.satellite === sensor);
    }

    if (region === 'INDIA') {
      points = points.filter((p) => this.inRegion(p, 'INDIA'));
    }

    if (points.length > limit) {
      points = [...points]
        .sort((a, b) => ((b.frp ?? 0) - (a.frp ?? 0)) || ((b.confidence ?? 0) - (a.confidence ?? 0)))
        .slice(0, limit);
    }

    return {
      source: 'NASA FIRMS historical archive',
      region,
      sensor,
      from_year: options.fromYear ?? 2022,
      to_year: options.toYear ?? 2024,
      total_records_in_archive_scope: region === 'JHANSI' ? this.loadJhansiPoints().total_records : this.loadIndiaSample().total_records,
      returned_points: points.length,
      sampling: source.sampling,
      points,
    };
  }


  private static loadHighConfidenceSample() {
    if (this.highConfidenceSample) return this.highConfidenceSample;
    try {
      const raw = JSON.parse(fs.readFileSync(HIGH_CONF_SAMPLE_FILE, 'utf8'));
      this.highConfidenceSample = {
        ...raw,
        points: (Array.isArray(raw.points) ? raw.points : []).map((p: any) => this.normalizePoint(p)),
      };
    } catch {
      this.highConfidenceSample = {
        source: 'NASA FIRMS user-supplied India archive',
        sampling: 'unavailable',
        high_confidence_total: 0,
        sample_fraction: 0,
        sample_records: 0,
        points: [],
      };
    }
    return this.highConfidenceSample;
  }

  static getHighConfidenceSample(options: { region?: Region; fraction?: number; limit?: number }) {
    const sample = this.loadHighConfidenceSample();
    const region = options.region ?? 'INDIA';
    const fraction = 0.35;
    const limit = Math.min(Math.max(options.limit ?? (region === 'JHANSI' ? 1000 : 12000), 1), 20000);
    let points = sample.points;
    if (region === 'JHANSI') {
      points = points.filter((point) => this.inRegion(point, 'JHANSI'));
    } else if (region === 'INDIA' || region === 'GLOBAL') {
      points = points.filter((point) => this.inRegion(point, 'INDIA'));
    }
    // The packaged sample is a stable 35% deterministic sample. It is never regenerated at runtime.
    if (points.length > limit) points = points.slice(0, limit);
    return {
      source: sample.source,
      region,
      sample_fraction: 0.35,
      requested_fraction: 0.35,
      high_confidence_total: sample.high_confidence_total,
      sample_records_total: sample.sample_records,
      returned_points: points.length,
      total_records_in_region_high_confidence: region === 'JHANSI' ? this.getStatus().jhansi.high_confidence_70plus_normalized : sample.high_confidence_total,
      sampling: sample.sampling,
      points,
      note: 'Stable deterministic 35% sample of normalized high-confidence observations; not synthetic data.',
    };
  }

  static getJhansiPointById(id: string): HistoricalFirmsPoint | null {
    return this.loadJhansiPoints().points.find((p) => p.id === id) ?? null;
  }
}
