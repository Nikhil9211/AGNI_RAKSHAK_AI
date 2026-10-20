import { OSMContext, Region, REGION_BOUNDS } from '../../src/types.ts';
import { dbService, haversineDistanceMeters } from '../db/databaseService.ts';

/**
 * Real OSM / Overpass context lookup. No hardcoded facility catalogue is used.
 * The returned context is evidence from OSM, not a fire classification.
 */
export class OSMService {
  private static OVERPASS_ENDPOINTS = [
    'https://overpass-api.de/api/interpreter',
    'https://lz4.overpass-api.de/api/interpreter',
    'https://overpass.kumi.systems/api/interpreter',
  ];
  private static endpointIndex = 0;
  private static CACHE_RADIUS_M = 350;
  private static FEATURE_CACHE_TTL_MS = 15 * 60 * 1000;
  private static featureCache = new Map<string, { timestamp: number; features: any[] }>();

  private static emptyContext(reason: string): OSMContext {
    return {
      feature_name: reason,
      feature_type: 'none',
      distance_meters: 9999,
      industrial_score: 0,
      verified: false,
    };
  }



  /** Fetch real OSM industrial features for the selected operational region. */
  public static async getIndustrialFeatures(region: Region, limit = 800): Promise<{ region: Region; available: boolean; features: any[]; source: string; error?: string }> {
    if (region === 'GLOBAL') {
      return { region, available: false, features: [], source: 'OpenStreetMap / Overpass', error: 'Global industrial feature retrieval is intentionally not requested; zoom/select INDIA or JHANSI.' };
    }
    const cacheKey = `${region}-${Math.min(Math.max(limit, 50), 2000)}`;
    const cached = this.featureCache.get(cacheKey);
    if (cached && Date.now() - cached.timestamp < this.FEATURE_CACHE_TTL_MS) {
      return { region, available: true, features: cached.features, source: 'OpenStreetMap / Overpass', };
    }
    const bbox = REGION_BOUNDS[region];
    const query = `
      [out:json][timeout:12];
      (
        nwr["industrial"~"^(refinery|mine|factory)$",i](${bbox.south},${bbox.west},${bbox.north},${bbox.east});
        nwr["landuse"="quarry"](${bbox.south},${bbox.west},${bbox.north},${bbox.east});
        nwr["man_made"="works"](${bbox.south},${bbox.west},${bbox.north},${bbox.east});
        nwr["power"="plant"](${bbox.south},${bbox.west},${bbox.north},${bbox.east});
      );
      out center tags;
    `;
    for (let attempt = 0; attempt < this.OVERPASS_ENDPOINTS.length; attempt++) {
      const endpoint = this.OVERPASS_ENDPOINTS[(this.endpointIndex + attempt) % this.OVERPASS_ENDPOINTS.length];
      try {
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 14000);
        const response = await fetch(endpoint, {
          method: 'POST',
          headers: { 'Content-Type': 'application/x-www-form-urlencoded; charset=UTF-8', 'User-Agent': 'AgniRakshakAI-SIH26162/1.0' },
          body: `data=${encodeURIComponent(query)}`,
          signal: controller.signal,
        });
        clearTimeout(timeoutId);
        if (!response.ok) throw new Error(`Overpass HTTP ${response.status}`);
        const data = await response.json();
        const elements = Array.isArray(data.elements) ? data.elements : [];
        const seen = new Set<string>();
        const features: any[] = [];
        for (const el of elements) {
          const key = `${el.type}/${el.id}`;
          if (seen.has(key)) continue;
          const tags = el.tags || {};
          const lat = typeof el.lat === 'number' ? el.lat : el.center?.lat;
          const lon = typeof el.lon === 'number' ? el.lon : el.center?.lon;
          if (!Number.isFinite(lat) || !Number.isFinite(lon)) continue;
          let type = 'industrial';
          if (tags.industrial === 'refinery') type = 'refinery';
          else if (tags.industrial === 'mine' || tags.landuse === 'quarry') type = 'mine';
          else if (tags.industrial === 'factory' || tags.man_made === 'works') type = 'factory';
          else if (tags.power === 'plant') type = 'power';
          features.push({
            id: key,
            latitude: lat,
            longitude: lon,
            type,
            name: tags.name || tags['name:en'] || tags.operator || tags.product || 'Unnamed OSM feature',
            tags,
          });
          seen.add(key);
        }
        features.sort((a, b) => {
          const priority = (x: any) => x.type === 'refinery' ? 0 : x.type === 'mine' ? 1 : x.type === 'factory' ? 2 : 3;
          return priority(a) - priority(b);
        });
        const bounded = features.slice(0, Math.min(Math.max(limit, 50), 2000));
        this.featureCache.set(cacheKey, { timestamp: Date.now(), features: bounded });
        this.endpointIndex = (this.endpointIndex + attempt) % this.OVERPASS_ENDPOINTS.length;
        return { region, available: true, features: bounded, source: 'OpenStreetMap / Overpass' };
      } catch (err: any) {
        if (attempt === this.OVERPASS_ENDPOINTS.length - 1) {
          return { region, available: false, features: [], source: 'OpenStreetMap / Overpass', error: err?.message || 'Overpass unavailable' };
        }
      }
    }
    return { region, available: false, features: [], source: 'OpenStreetMap / Overpass', error: 'Overpass unavailable' };
  }

  public static async getIndustrialContext(lat: number, lon: number): Promise<OSMContext> {
    const cached = dbService.getCachedOsmContext(lat, lon);
    if (cached) return cached;

    const query = `
      [out:json][timeout:8];
      (
        nwr["landuse"="industrial"](around:3000,${lat},${lon});
        nwr["industrial"](around:3000,${lat},${lon});
        nwr["power"~"plant|substation|generator",i](around:3000,${lat},${lon});
        nwr["man_made"~"works|kiln|storage_tank",i](around:3000,${lat},${lon});
        nwr["building"~"industrial|warehouse",i](around:3000,${lat},${lon});
      );
      out center tags;
    `;

    const attempts = this.OVERPASS_ENDPOINTS.length;
    for (let attempt = 0; attempt < attempts; attempt++) {
      const endpoint = this.OVERPASS_ENDPOINTS[this.endpointIndex % this.OVERPASS_ENDPOINTS.length];
      try {
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 9000);
        const response = await fetch(endpoint, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/x-www-form-urlencoded; charset=UTF-8',
            'User-Agent': 'AgniRakshakAI-SIH26162/1.0',
          },
          body: `data=${encodeURIComponent(query)}`,
          signal: controller.signal,
        });
        clearTimeout(timeoutId);

        if (!response.ok) throw new Error(`Overpass HTTP ${response.status}`);
        const data = await response.json();
        const elements = Array.isArray(data.elements) ? data.elements : [];

        let closest: any = null;
        let minDistance = Infinity;
        for (const el of elements) {
          const elLat = typeof el.lat === 'number' ? el.lat : el.center?.lat;
          const elLon = typeof el.lon === 'number' ? el.lon : el.center?.lon;
          if (typeof elLat !== 'number' || typeof elLon !== 'number') continue;
          const dist = haversineDistanceMeters(lat, lon, elLat, elLon);
          if (dist < minDistance) {
            minDistance = dist;
            closest = el;
          }
        }

        if (!closest || !Number.isFinite(minDistance)) {
          const empty = this.emptyContext('No verified industrial context within 3 km');
          return empty;
        }

        const tags = closest.tags || {};
        const name = tags.name || tags['name:en'] || tags.operator || tags.description || 'Unnamed OSM feature';
        let featureType: OSMContext['feature_type'] = 'industrial';
        if (tags.power === 'substation') featureType = 'substation';
        else if (tags.power) featureType = 'power';
        else if (tags.man_made === 'kiln') featureType = 'kiln';
        else if (tags.building === 'warehouse') featureType = 'warehouse';
        else if (tags.man_made === 'works') featureType = 'works';
        else if (tags.industrial || tags.building === 'industrial') featureType = 'factory';

        let contextScore = 0;
        if (minDistance <= 300) contextScore = 95;
        else if (minDistance <= 800) contextScore = 80;
        else if (minDistance <= 1500) contextScore = 60;
        else if (minDistance <= 3000) contextScore = 35;

        const rawLat = typeof closest.lat === 'number' ? closest.lat : closest.center?.lat;
        const rawLon = typeof closest.lon === 'number' ? closest.lon : closest.center?.lon;
        const result: OSMContext = {
          feature_name: name,
          feature_type: featureType,
          distance_meters: Math.round(minDistance),
          industrial_score: contextScore,
          verified: true,
          osm_id: `${closest.type}/${closest.id}`,
          coordinates: (typeof rawLat === 'number' && typeof rawLon === 'number') ? [rawLat, rawLon] : undefined,
          tags,
        };

        dbService.cacheOsmContext(`${lat.toFixed(3)}_${lon.toFixed(3)}`, result);
        return result;
      } catch (err: any) {
        this.endpointIndex++;
        if (attempt === attempts - 1) {
          return this.emptyContext('OSM Overpass lookup unavailable');
        }
      }
    }

    return this.emptyContext('OSM Overpass lookup unavailable');
  }
}
