import { 
  ThermalEvent, 
  Region, 
  REGION_BOUNDS, 
  BoundingBox, 
  FirmsStatus 
} from '../../src/types.ts';
import { dbService, haversineDistanceMeters } from '../db/databaseService.ts';
import { OSMService } from './osmService.ts';
import { RiskService } from './riskService.ts';
import { PersistenceService } from './persistenceService.ts';
import { AlertService } from './alertService.ts';

export interface RawFirmsRow {
  latitude: number;
  longitude: number;
  bright_ti4?: number;
  scan?: number;
  track?: number;
  acq_date: string;
  acq_time: string;
  satellite: string;
  instrument: string;
  confidence: string | number;
  bright_ti5?: number;
  frp: number;
  daynight?: 'D' | 'N';
}

interface CacheEntry {
  timestamp: number;
  events: ThermalEvent[];
  region: Region;
  days: number;
  sensor: 'ALL' | 'NOAA20' | 'NOAA21' | 'SNPP' | 'MODIS';
}

export class FirmsService {
  private static cache: Map<string, CacheEntry> = new Map();
  private static CACHE_TTL_MS = 15 * 60 * 1000; // 15 minutes
  private static lastSuccessfulFetch: string | null = null;
  private static lastError: string | null = null;
  private static lastLatencyMs: number = 0;

  /**
   * Helper to format area coordinates for NASA FIRMS Area API:
   * Format: west,south,east,north
   */
  private static getAreaParam(region: Region): string {
    if (region === 'GLOBAL') return 'world';
    const bbox = REGION_BOUNDS[region];
    return `${bbox.west.toFixed(2)},${bbox.south.toFixed(2)},${bbox.east.toFixed(2)},${bbox.north.toFixed(2)}`;
  }

  /**
   * Parse CSV from NASA FIRMS API into normalized ThermalEvent objects
   * Real fields: latitude, longitude, bright_ti4, scan, track, acq_date, acq_time,
   * satellite, instrument, confidence, version, bright_ti5, frp, daynight
   */
  public static parseFirmsCsv(csvText: string, source: string): ThermalEvent[] {
    const lines = csvText.trim().split('\n');
    if (lines.length <= 1) {
      return [];
    }

    const headers = lines[0].split(',').map((h) => h.trim().toLowerCase());
    const events: ThermalEvent[] = [];

    const latIdx = headers.indexOf('latitude');
    const lonIdx = headers.indexOf('longitude');
    if (latIdx === -1 || lonIdx === -1) {
      return [];
    }
    const dateIdx = headers.indexOf('acq_date');
    const timeIdx = headers.indexOf('acq_time');
    const satIdx = headers.indexOf('satellite');
    const instIdx = headers.indexOf('instrument');
    const confIdx = headers.indexOf('confidence');
    const frpIdx = headers.indexOf('frp');
    const b4Idx = headers.indexOf('bright_ti4');
    const b5Idx = headers.indexOf('bright_ti5');
    const scanIdx = headers.indexOf('scan');
    const trackIdx = headers.indexOf('track');
    const dnIdx = headers.indexOf('daynight');

    for (let i = 1; i < lines.length; i++) {
      const row = lines[i].split(',').map((val) => val.trim());
      if (row.length < 2) continue;

      const lat = parseFloat(row[latIdx]);
      const lon = parseFloat(row[lonIdx]);
      if (isNaN(lat) || isNaN(lon)) continue;

      const acqDate = row[dateIdx] || new Date().toISOString().split('T')[0];
      const rawTime = row[timeIdx] || '0000';
      const paddedTime = rawTime.padStart(4, '0');
      const timeStr = `${paddedTime.substring(0, 2)}:${paddedTime.substring(2, 4)}:00`;
      const isoTimestamp = `${acqDate}T${timeStr}Z`;

      // Confidence normalization (can be 'n'/'h'/'l' or numeric 0-100)
      let confNum = 50;
      const rawConf = row[confIdx];
      if (rawConf) {
        if (rawConf.toLowerCase() === 'h' || rawConf.toLowerCase() === 'high') confNum = 90;
        else if (rawConf.toLowerCase() === 'n' || rawConf.toLowerCase() === 'nominal') confNum = 65;
        else if (rawConf.toLowerCase() === 'l' || rawConf.toLowerCase() === 'low') confNum = 30;
        else {
          const parsed = parseFloat(rawConf);
          if (!isNaN(parsed)) confNum = Math.min(100, Math.max(0, parsed));
        }
      }

      const frpVal = frpIdx !== -1 && !isNaN(parseFloat(row[frpIdx])) ? parseFloat(row[frpIdx]) : 0;
      const b4Val = b4Idx !== -1 && !isNaN(parseFloat(row[b4Idx])) ? parseFloat(row[b4Idx]) : null;
      const b5Val = b5Idx !== -1 && !isNaN(parseFloat(row[b5Idx])) ? parseFloat(row[b5Idx]) : null;
      const scanVal = scanIdx !== -1 && !isNaN(parseFloat(row[scanIdx])) ? parseFloat(row[scanIdx]) : null;
      const trackVal = trackIdx !== -1 && !isNaN(parseFloat(row[trackIdx])) ? parseFloat(row[trackIdx]) : null;
      const daynightVal = dnIdx !== -1 ? (row[dnIdx].toUpperCase() === 'N' ? 'N' : 'D') : null;

      // Unique deterministic ID to prevent duplicates
      const externalId = `FIRMS-${source.replace(/[^A-Za-z0-9_-]/g, '_')}-${lat.toFixed(4)}_${lon.toFixed(4)}_${acqDate}_${paddedTime}`;

      const event: ThermalEvent = {
        id: externalId,
        external_id: externalId,
        latitude: lat,
        longitude: lon,
        acq_date: acqDate,
        acq_time: paddedTime,
        satellite: row[satIdx] || 'NOAA-20',
        instrument: row[instIdx] || 'VIIRS',
        confidence: confNum,
        confidence_raw: rawConf || 'nominal',
        frp: frpVal,
        bright_ti4: b4Val,
        bright_ti5: b5Val,
        scan: scanVal,
        track: trackVal,
        daynight: daynightVal,
        source: source,
        timestamp: isoTimestamp,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      };

      events.push(event);
    }

    return events;
  }

  /**
   * Fetch FIRMS data for a specific region
   */
  public static async fetchRegionData(region: Region, forceRefresh: boolean = false, days: number = 1, sensor: 'ALL' | 'NOAA20' | 'NOAA21' | 'SNPP' | 'MODIS' = 'ALL'): Promise<{
    events: ThermalEvent[];
    source: string;
    cached: boolean;
    error: string | null;
  }> {
    const started = Date.now();
    days = Math.min(Math.max(Math.floor(days) || 1, 1), region === 'GLOBAL' ? 1 : 7);
    const cacheKey = `${region}-${days}-${sensor}`;
    const apiKey = dbService.getFirmsApiKey();

    if (!forceRefresh) {
      const cached = this.cache.get(cacheKey);
      if (cached && Date.now() - cached.timestamp < this.CACHE_TTL_MS) {
        return { events: cached.events, source: 'CACHE', cached: true, error: null };
      }
    }

    if (!apiKey) {
      const error = 'NASA FIRMS API key not configured';
      this.lastError = error;
      return { events: [], source: 'NASA FIRMS', cached: false, error };
    }

    const areaParam = this.getAreaParam(region);
    // A world-wide CSV request across every sensor is too large and often times out.
    // Use the current NOAA-20 global feed for the vector event list; the WMS map still
    // supports the selected sensor layers independently. Regional requests retain all sensors.
    const sources = region === 'GLOBAL'
      ? ['VIIRS_NOAA20_NRT']
      : sensor === 'NOAA20'
        ? ['VIIRS_NOAA20_NRT']
      : sensor === 'NOAA21'
        ? ['VIIRS_NOAA21_NRT']
        : sensor === 'SNPP'
          ? ['VIIRS_SNPP_NRT']
          : sensor === 'MODIS'
            ? ['MODIS_NRT']
            : ['VIIRS_NOAA20_NRT', 'VIIRS_NOAA21_NRT', 'VIIRS_SNPP_NRT', 'MODIS_NRT'];

    const responses = await Promise.allSettled(sources.map(async (src) => {
      const url = `https://firms.modaps.eosdis.nasa.gov/api/area/csv/${apiKey}/${src}/${areaParam}/${days}`;
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), region === 'GLOBAL' ? 45000 : 20000);
      try {
        const res = await fetch(url, { signal: controller.signal });
        const text = await res.text();
        if (!res.ok) throw new Error(`NASA FIRMS ${src}: HTTP ${res.status}`);
        const header = text.split(/\r?\n/, 1)[0] || '';
        if (/map[_ ]?key.*not valid|invalid map key|error|too many requests|not found/i.test(header) && !/latitude.*longitude/i.test(header)) {
          throw new Error(text.trim().slice(0, 300) || `NASA FIRMS ${src}: invalid response`);
        }
        if (!/latitude/i.test(header) || !/longitude/i.test(header)) {
          throw new Error(`NASA FIRMS ${src}: unexpected response (not a CSV feed)`);
        }
        return { src, events: this.parseFirmsCsv(text, src) };
      } finally {
        clearTimeout(timeoutId);
      }
    }));

    const successful = responses
      .filter((r): r is PromiseFulfilledResult<{src: string; events: ThermalEvent[]}> => r.status === 'fulfilled')
      .map((r) => r.value);

    if (!successful.length) {
      const errors = responses
        .filter((r): r is PromiseRejectedResult => r.status === 'rejected')
        .map((r) => r.reason?.message || 'FIRMS request failed');
      const error = errors.join(' | ') || 'NASA FIRMS UNAVAILABLE';
      this.lastError = error;
      dbService.logFetch({ source: 'NASA FIRMS', region, status: 'ERROR', records_fetched: 0, latency_ms: Date.now() - started, error_message: error });
      return { events: [], source: 'NASA FIRMS', cached: false, error };
    }

    // Merge both sensors and remove exact repeats; spatial/temporal de-dup is handled by the DB too.
    const merged = successful.flatMap((x) => x.events);
    const unique = new Map<string, ThermalEvent>();
    for (const event of merged) unique.set(event.id, event);
    const fetchedEvents = Array.from(unique.values());

    // Persist the complete fetched set. The frontend can request bounded/region-specific views.
    const freshEvents: ThermalEvent[] = [];
    for (const event of fetchedEvents) {
      if (!dbService.getEventById(event.id)) freshEvents.push(event);
    }
    dbService.batchUpsertEvents(fetchedEvents);

    // Build persistence state from everything stored so far.
    const persistentSources = PersistenceService.updateClusters();
    const persistentIds = new Set<string>(persistentSources.flatMap((p) => p.associated_event_ids));

    const persistedEvents = dbService.getEvents(region).map((event) => {
      if (persistentIds.has(event.id)) {
        event.is_persistent = true;
        event.persistent_source_id = persistentSources.find((p) => p.associated_event_ids.includes(event.id))?.id;
      }
      return event;
    });

    // Risk can be computed immediately. Real OSM context is deliberately fetched only for a small
    // number of high-priority Jhansi events to avoid hammering public Overpass infrastructure.
    for (const event of persistedEvents) {
      const existingPersistence = event.persistent_source_id ? persistentSources.find((p) => p.id === event.persistent_source_id) : undefined;
      const clusterCount = existingPersistence?.detection_count || 1;
      event.risk_analysis = RiskService.calculateRisk(event, event.osm_context || null, Boolean(event.is_persistent), clusterCount);
    }

    if (region === 'JHANSI') {
      const priority = [...persistedEvents]
        .sort((a, b) => (b.frp - a.frp) || (b.confidence - a.confidence))
        .slice(0, 20);
      for (const event of priority) {
        try {
          const context = await OSMService.getIndustrialContext(event.latitude, event.longitude);
          event.osm_context = context;
          const source = event.persistent_source_id ? persistentSources.find((p) => p.id === event.persistent_source_id) : undefined;
          event.risk_analysis = RiskService.calculateRisk(event, context, Boolean(event.is_persistent), source?.detection_count || 1);
        } catch {
          // Keep the event usable with the non-OSM risk calculation.
        }
      }
    }

    dbService.updateEvents(persistedEvents);

    // Alert only freshly ingested events; do not re-evaluate the entire historical database every refresh.
    for (const event of freshEvents) {
      const hydrated = dbService.getEventById(event.id);
      if (hydrated) AlertService.evaluateAndCreateAlert(hydrated);
    }

    const latency = Date.now() - started;
    this.lastLatencyMs = latency;
    this.lastSuccessfulFetch = new Date().toISOString();
    this.lastError = null;

    dbService.logFetch({ source: successful.map((x) => x.src).join(' + '), region, status: 'SUCCESS', records_fetched: fetchedEvents.length, latency_ms: latency });

    const cutoff = Date.now() - days * 86400000;
    const responseEvents = dbService.getEvents(region).filter((event) => {
      const ts = new Date(event.timestamp).getTime();
      return Number.isFinite(ts) && ts >= cutoff;
    });
    this.cache.set(cacheKey, { timestamp: Date.now(), events: responseEvents, region, days, sensor });

    return {
      events: responseEvents,
      source: successful.map((x) => x.src).join(' + '),
      cached: false,
      error: null,
    };
  }

  private static convertRawRowToEvent(row: RawFirmsRow, source: string): ThermalEvent {
    let confNum = 65;
    if (typeof row.confidence === 'number') {
      confNum = row.confidence;
    } else if (typeof row.confidence === 'string') {
      const c = row.confidence.toLowerCase();
      if (c === 'h' || c === 'high') confNum = 90;
      else if (c === 'n' || c === 'nominal') confNum = 65;
      else if (c === 'l' || c === 'low') confNum = 30;
      else {
        const p = parseFloat(row.confidence);
        if (!isNaN(p)) confNum = p;
      }
    }

    const paddedTime = (row.acq_time || '0000').padStart(4, '0');
    const isoTimestamp = `${row.acq_date}T${paddedTime.substring(0, 2)}:${paddedTime.substring(2, 4)}:00.000Z`;
    const externalId = `FIRMS-${source.replace(/[^A-Za-z0-9_-]/g, '_')}-${row.latitude.toFixed(4)}_${row.longitude.toFixed(4)}_${row.acq_date}_${paddedTime}`;

    return {
      id: externalId,
      external_id: externalId,
      latitude: row.latitude,
      longitude: row.longitude,
      acq_date: row.acq_date,
      acq_time: paddedTime,
      satellite: row.satellite || 'NOAA-20',
      instrument: row.instrument || 'VIIRS',
      confidence: confNum,
      confidence_raw: String(row.confidence || 'nominal'),
      frp: row.frp,
      bright_ti4: row.bright_ti4 || null,
      bright_ti5: row.bright_ti5 || null,
      scan: row.scan || null,
      track: row.track || null,
      daynight: row.daynight || 'D',
      source,
      timestamp: isoTimestamp,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };
  }

  public static getStatus(): FirmsStatus {
    const apiKey = dbService.getFirmsApiKey();
    const stats = dbService.getStats();

    const persistedLastSuccess = dbService.getLastSuccessfulFetch('NASA FIRMS');
    const lastSuccess = this.lastSuccessfulFetch || persistedLastSuccess;
    return {
      available: Boolean(lastSuccess) && this.lastError === null,
      has_api_key: Boolean(apiKey && apiKey.length > 5),
      last_successful_fetch: lastSuccess,
      last_error: this.lastError,
      active_source: 'VIIRS NOAA-20 NRT / VIIRS NOAA-21 NRT / VIIRS S-NPP NRT',
      total_events_in_db: stats.total_events,
      total_persistent_sources: stats.total_persistent_sources,
      total_active_alerts: stats.active_alerts,
      cache_age_seconds: lastSuccess
        ? Math.round((Date.now() - new Date(lastSuccess).getTime()) / 1000)
        : null,
      latency_ms: this.lastLatencyMs,
    };
  }
}
