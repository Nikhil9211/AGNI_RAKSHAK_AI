import fs from 'fs';
import crypto from 'crypto';
import path from 'path';
import { 
  ThermalEvent, 
  PersistentSource, 
  Alert, 
  EventNote, 
  FetchLog, 
  OSMContext, 
  Region, 
  REGION_BOUNDS, 
  BoundingBox,
  ResponseIncident,
} from '../../src/types.ts';

// Spatial Haversine Distance in meters
export function haversineDistanceMeters(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const R = 6371000; // Earth radius in meters
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLon = ((lon2 - lon1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos((lat1 * Math.PI) / 180) *
      Math.cos((lat2 * Math.PI) / 180) *
      Math.sin(dLon / 2) *
      Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
}

export function isWithinBoundingBox(lat: number, lon: number, bbox: BoundingBox): boolean {
  return lat >= bbox.south && lat <= bbox.north && lon >= bbox.west && lon <= bbox.east;
}

interface DatabaseSchema {
  thermal_events: Record<string, ThermalEvent>;
  persistent_sources: Record<string, PersistentSource>;
  industrial_features: Record<string, OSMContext>;
  alerts: Record<string, Alert>;
  event_notes: Record<string, EventNote[]>;
  response_incidents: Record<string, ResponseIncident>;
  fetch_logs: FetchLog[];
  settings: {
    firms_api_key?: string;
    last_firms_fetch?: string;
    last_firms_success?: string;
    last_firms_error?: string;
  };
}

const DATA_DIR = path.join(process.cwd(), 'server', '.data');
const DB_FILE = path.join(DATA_DIR, 'agni_rakshak_db.json');

class DatabaseService {
  private data: DatabaseSchema;
  private initialized: boolean = false;

  constructor() {
    this.data = {
      thermal_events: {},
      persistent_sources: {},
      industrial_features: {},
      alerts: {},
      event_notes: {},
      response_incidents: {},
      fetch_logs: [],
      settings: {},
    };
    this.init();
  }

  private init() {
    try {
      if (!fs.existsSync(DATA_DIR)) {
        fs.mkdirSync(DATA_DIR, { recursive: true });
      }
      if (fs.existsSync(DB_FILE)) {
        const raw = fs.readFileSync(DB_FILE, 'utf-8');
        const parsed = JSON.parse(raw);
        const loadedSettings = parsed.settings || {};
        delete loadedSettings.firms_api_key;
        this.data = {
          thermal_events: parsed.thermal_events || {},
          persistent_sources: parsed.persistent_sources || {},
          industrial_features: parsed.industrial_features || {},
          alerts: parsed.alerts || {},
          event_notes: parsed.event_notes || {},
          response_incidents: parsed.response_incidents || {},
          fetch_logs: parsed.fetch_logs || [],
          settings: loadedSettings,
        };
      } else {
        this.save();
      }
      this.initialized = true;
    } catch (err) {
      console.error('[DB] Failed to load local database:', err);
      this.initialized = true;
    }
  }

  private save() {
    try {
      if (!fs.existsSync(DATA_DIR)) {
        fs.mkdirSync(DATA_DIR, { recursive: true });
      }
      const tempFile = `${DB_FILE}.${process.pid}.tmp`;
      fs.writeFileSync(tempFile, JSON.stringify(this.data, null, 2), { encoding: 'utf-8', mode: 0o600 });
      fs.renameSync(tempFile, DB_FILE);
    } catch (err) {
      console.error('[DB] Failed to save database to disk:', err);
    }
  }


  public getHealth() {
    let writable = true;
    try {
      if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
      const probe = path.join(DATA_DIR, `.health-${process.pid}.tmp`);
      fs.writeFileSync(probe, 'ok', 'utf8');
      fs.unlinkSync(probe);
    } catch {
      writable = false;
    }
    return {
      available: writable && this.initialized,
      storage: 'LOCAL SERVER FILE STORE',
      path: DB_FILE,
      persistent: true,
      note: 'PostgreSQL/PostGIS migration is a separate phase; this build intentionally reports the actual storage backend.'
    };
  }

  // --- Settings & Secrets ---
  public getFirmsApiKey(): string {
    // Secrets must never be persisted to the local data store.
    return process.env.FIRMS_API_KEY || '';
  }

  public setFirmsApiKey(_key: string): void {
    throw new Error('FIRMS API key is server-configured only; update FIRMS_API_KEY in .env.');
  }

  public getSettings() {
    return this.data.settings;
  }

  public updateSettings(partial: Partial<DatabaseSchema['settings']>) {
    this.data.settings = { ...this.data.settings, ...partial };
    this.save();
  }

  // --- Thermal Events ---
  public getEvents(region?: Region): ThermalEvent[] {
    const all = Object.values(this.data.thermal_events);
    if (!region || region === 'GLOBAL') {
      // Sort newest first
      return all.sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());
    }

    const bbox = REGION_BOUNDS[region];
    return all
      .filter((ev) => isWithinBoundingBox(ev.latitude, ev.longitude, bbox))
      .sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());
  }

  public getEventById(id: string): ThermalEvent | undefined {
    return this.data.thermal_events[id];
  }

  /**
   * Deduplication Logic:
   * 500m spatial proximity + 30-minute time window
   */
  public isDuplicateEvent(newEvent: { latitude: number; longitude: number; timestamp: string }): boolean {
    const newTime = new Date(newEvent.timestamp).getTime();
    const thirtyMins = 30 * 60 * 1000;

    for (const existing of Object.values(this.data.thermal_events)) {
      const existingTime = new Date(existing.timestamp).getTime();
      if (Math.abs(newTime - existingTime) <= thirtyMins) {
        const dist = haversineDistanceMeters(
          newEvent.latitude,
          newEvent.longitude,
          existing.latitude,
          existing.longitude
        );
        if (dist <= 500) {
          return true;
        }
      }
    }
    return false;
  }

  public upsertEvent(event: ThermalEvent): ThermalEvent {
    this.data.thermal_events[event.id] = {
      ...this.data.thermal_events[event.id],
      ...event,
      updated_at: new Date().toISOString(),
    };
    this.save();
    return this.data.thermal_events[event.id];
  }

  public batchUpsertEvents(events: ThermalEvent[]): number {
    let count = 0;
    for (const ev of events) {
      if (!this.data.thermal_events[ev.id]) {
        // If not already existing by ID, check deduplication
        if (!this.isDuplicateEvent(ev)) {
          this.data.thermal_events[ev.id] = ev;
          count++;
        }
      } else {
        // Update existing record
        this.data.thermal_events[ev.id] = {
          ...this.data.thermal_events[ev.id],
          ...ev,
          updated_at: new Date().toISOString(),
        };
      }
    }
    this.save();
    return count;
  }

  public updateEvents(events: ThermalEvent[]): void {
    const now = new Date().toISOString();
    for (const event of events) {
      const existing = this.data.thermal_events[event.id];
      if (existing) {
        this.data.thermal_events[event.id] = { ...existing, ...event, updated_at: now };
      } else {
        this.data.thermal_events[event.id] = { ...event, updated_at: now };
      }
    }
    this.save();
  }

  // --- Persistent Sources ---
  public getPersistentSources(region?: Region): PersistentSource[] {
    const all = Object.values(this.data.persistent_sources);
    if (!region || region === 'GLOBAL') {
      return all;
    }
    const bbox = REGION_BOUNDS[region];
    return all.filter((s) => isWithinBoundingBox(s.latitude, s.longitude, bbox));
  }

  public savePersistentSource(source: PersistentSource): void {
    this.data.persistent_sources[source.id] = source;
    this.save();
  }

  public clearPersistentSources(): void {
    this.data.persistent_sources = {};
    this.save();
  }

  // --- Alerts ---
  public getAlerts(region?: Region): Alert[] {
    const all = Object.values(this.data.alerts);
    let filtered = all;
    if (region && region !== 'GLOBAL') {
      const bbox = REGION_BOUNDS[region];
      filtered = all.filter((a) => isWithinBoundingBox(a.latitude, a.longitude, bbox));
    }
    return filtered.sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
  }

  public getAlertById(id: string): Alert | undefined {
    return this.data.alerts[id];
  }

  public createAlert(alert: Omit<Alert, 'id' | 'created_at' | 'updated_at'>): Alert {
    const id = `ALT-${crypto.randomUUID()}`;
    const now = new Date().toISOString();
    const newAlert: Alert = {
      ...alert,
      id,
      created_at: now,
      updated_at: now,
    };
    this.data.alerts[id] = newAlert;
    
    // Also tag the corresponding thermal event
    if (this.data.thermal_events[alert.event_id]) {
      this.data.thermal_events[alert.event_id].alert_id = id;
    }

    this.save();
    return newAlert;
  }

  public updateAlertStatus(
    id: string, 
    status: Alert['status'], 
    operatorName: string = 'Duty Officer'
  ): Alert | null {
    const alert = this.data.alerts[id];
    if (!alert) return null;

    const now = new Date().toISOString();
    alert.status = status;
    alert.updated_at = now;

    if (status === 'ACKNOWLEDGED') {
      alert.acknowledged_at = now;
      alert.acknowledged_by = operatorName;
    } else if (status === 'RESOLVED') {
      alert.resolved_at = now;
      alert.resolved_by = operatorName;
    }

    this.save();
    return alert;
  }

  public addAlertNote(id: string, noteText: string): Alert | null {
    const alert = this.data.alerts[id];
    if (!alert) return null;
    alert.notes.push(`[${new Date().toISOString()}] ${noteText}`);
    alert.updated_at = new Date().toISOString();
    this.save();
    return alert;
  }

  // --- Response Orchestrator (decision-support incidents) ---
  public getResponseIncident(eventId: string): ResponseIncident | undefined {
    return this.data.response_incidents[eventId];
  }

  public upsertResponseIncident(incident: ResponseIncident): ResponseIncident {
    this.data.response_incidents[incident.event_id] = incident;
    this.save();
    return incident;
  }

  // --- Event Notes ---
  public getNotesForEvent(eventId: string): EventNote[] {
    return this.data.event_notes[eventId] || [];
  }

  public addEventNote(eventId: string, author: string, content: string): EventNote {
    if (!this.data.event_notes[eventId]) {
      this.data.event_notes[eventId] = [];
    }
    const note: EventNote = {
      id: `NOTE-${Date.now()}`,
      event_id: eventId,
      author,
      content,
      created_at: new Date().toISOString(),
    };
    this.data.event_notes[eventId].push(note);
    
    // Update count on event
    if (this.data.thermal_events[eventId]) {
      this.data.thermal_events[eventId].notes_count = this.data.event_notes[eventId].length;
    }

    this.save();
    return note;
  }

  // --- OSM Cache ---
  public getCachedOsmContext(lat: number, lon: number): OSMContext | null {
    // Check if we have a feature cached within 250m
    for (const ctx of Object.values(this.data.industrial_features)) {
      if (ctx.coordinates) {
        const dist = haversineDistanceMeters(lat, lon, ctx.coordinates[0], ctx.coordinates[1]);
        if (dist <= 250) {
          return ctx;
        }
      }
    }
    return null;
  }

  public cacheOsmContext(key: string, ctx: OSMContext): void {
    this.data.industrial_features[key] = ctx;
    this.save();
  }

  public getLastSuccessfulFetch(source?: string): string | null {
    const hit = this.data.fetch_logs.find((log) => log.status === 'SUCCESS' && (!source || log.source.includes(source)));
    return hit?.timestamp || null;
  }

  // --- Fetch Logs ---
  public logFetch(log: Omit<FetchLog, 'id' | 'timestamp'>): FetchLog {
    const fullLog: FetchLog = {
      ...log,
      id: `LOG-${crypto.randomUUID()}`,
      timestamp: new Date().toISOString(),
    };
    this.data.fetch_logs.unshift(fullLog);
    // Keep last 100 logs
    if (this.data.fetch_logs.length > 100) {
      this.data.fetch_logs.pop();
    }
    this.save();
    return fullLog;
  }

  public getFetchLogs(): FetchLog[] {
    return this.data.fetch_logs;
  }

  public getStats() {
    return {
      total_events: Object.keys(this.data.thermal_events).length,
      total_persistent_sources: Object.keys(this.data.persistent_sources).length,
      total_alerts: Object.keys(this.data.alerts).length,
      active_alerts: Object.values(this.data.alerts).filter(
        (a) => a.status === 'NEW' || a.status === 'INVESTIGATING'
      ).length,
      cached_osm_features: Object.keys(this.data.industrial_features).length,
      fetch_logs_count: this.data.fetch_logs.length,
    };
  }
}

export const dbService = new DatabaseService();
