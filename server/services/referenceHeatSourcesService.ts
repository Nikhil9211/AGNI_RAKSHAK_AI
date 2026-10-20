import fs from 'fs';
import path from 'path';
import { ReferenceHeatSource } from '../../src/referenceTypes.ts';
import { Region, REGION_BOUNDS } from '../../src/types.ts';

const DATA_FILE = path.join(process.cwd(), 'server', 'data', 'reference', 'gihs.geojson');
const DATASET_URL = 'https://zenodo.org/records/8308133';

function centroidFromGeometry(geometry: any): [number, number] | null {
  if (!geometry) return null;
  if (geometry.type === 'Point' && Array.isArray(geometry.coordinates)) {
    const [lon, lat] = geometry.coordinates;
    if (Number.isFinite(lat) && Number.isFinite(lon)) return [lat, lon];
  }
  if (geometry.type === 'MultiPoint' || geometry.type === 'LineString') {
    const coords = geometry.coordinates || [];
    if (!coords.length) return null;
    const avgLon = coords.reduce((s: number, p: any) => s + Number(p[0] || 0), 0) / coords.length;
    const avgLat = coords.reduce((s: number, p: any) => s + Number(p[1] || 0), 0) / coords.length;
    return Number.isFinite(avgLat) && Number.isFinite(avgLon) ? [avgLat, avgLon] : null;
  }
  if (geometry.type === 'Polygon' || geometry.type === 'MultiPolygon') {
    const coords = geometry.type === 'Polygon' ? geometry.coordinates?.[0] : geometry.coordinates?.[0]?.[0];
    if (!Array.isArray(coords) || !coords.length) return null;
    const avgLon = coords.reduce((s: number, p: any) => s + Number(p[0] || 0), 0) / coords.length;
    const avgLat = coords.reduce((s: number, p: any) => s + Number(p[1] || 0), 0) / coords.length;
    return Number.isFinite(avgLat) && Number.isFinite(avgLon) ? [avgLat, avgLon] : null;
  }
  return null;
}

function toReference(feature: any, index: number): ReferenceHeatSource | null {
  const [lat, lon] = centroidFromGeometry(feature?.geometry) || [];
  if (!Number.isFinite(lat) || !Number.isFinite(lon)) return null;
  const p = feature.properties || {};
  const id = String(p.FID ?? p.id ?? `GIHS-${index + 1}`);
  const annual_activity: Record<string, number> = {};
  for (let year = 2012; year <= 2021; year++) {
    const key = `date${year}_p`;
    const value = Number(p[key]);
    if (Number.isFinite(value)) annual_activity[String(year)] = value;
  }
  return {
    id,
    latitude: Number(lat.toFixed(6)),
    longitude: Number(lon.toFixed(6)),
    name: p.Locations || p.location || p.name,
    type: p.Type || p.type,
    country: p.Nation_Name || p.country,
    continent: p.CONTINENT || p.continent,
    min_date: p.Min_date || p.min_date,
    max_date: p.Max_date || p.max_date,
    source: 'GIHS_2012_2021',
    dataset_url: DATASET_URL,
    verified: p.verified === undefined ? null : Boolean(p.verified),
    annual_activity,
  };
}

export class ReferenceHeatSourcesService {
  private static cache: ReferenceHeatSource[] | null = null;

  static isAvailable(): boolean {
    return fs.existsSync(DATA_FILE);
  }

  static loadAll(): ReferenceHeatSource[] {
    if (this.cache) return this.cache;
    if (!this.isAvailable()) return [];
    try {
      const raw = JSON.parse(fs.readFileSync(DATA_FILE, 'utf8'));
      const features = Array.isArray(raw?.features) ? raw.features : [];
      this.cache = features.map(toReference).filter(Boolean) as ReferenceHeatSource[];
      return this.cache;
    } catch (error) {
      console.error('[GIHS] Failed to read reference GeoJSON:', error);
      return [];
    }
  }

  static getForRegion(region: Region, limit = 1500): ReferenceHeatSource[] {
    const all = this.loadAll();
    if (region === 'GLOBAL') return all.slice(0, limit);
    const bbox = REGION_BOUNDS[region];
    return all.filter((p) => p.latitude >= bbox.south && p.latitude <= bbox.north && p.longitude >= bbox.west && p.longitude <= bbox.east).slice(0, limit);
  }

  static getStatus() {
    const items = this.loadAll();
    return {
      available: this.isAvailable(),
      source: 'GIHS 2012-2021',
      dataset_url: DATASET_URL,
      count: items.length,
      file: DATA_FILE,
    };
  }
}
