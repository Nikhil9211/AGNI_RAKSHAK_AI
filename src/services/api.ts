import { 
  ThermalEvent, 
  Region, 
  Alert, 
  EventNote, 
  PersistentSource, 
  FirmsStatus, 
  OSMContext,
  ResponseIncident,
  ResponseResourceType,
} from '../types.ts';
import { ReferenceHeatSource } from '../referenceTypes.ts';

export const api = {
  // Health
  async getHealth() {
    const res = await fetch('/api/health');
    return res.json();
  },

  // FIRMS Status
  async getFirmsStatus(): Promise<FirmsStatus> {
    const res = await fetch('/api/firms/status');
    if (!res.ok) throw new Error('Failed to fetch FIRMS status');
    return res.json();
  },

  // Fetch events by region
  async getEvents(region: Region, refresh: boolean = false, days: number = 1, sensor: 'ALL' | 'NOAA20' | 'NOAA21' | 'SNPP' | 'MODIS' = 'ALL'): Promise<{
    success: boolean;
    region: Region;
    source: string;
    cached: boolean;
    count: number;
    events: ThermalEvent[];
    error: string | null;
  }> {
    const endpoint = region === 'JHANSI' ? '/api/firms/jhansi' :
                     region === 'INDIA' ? '/api/firms/india' : '/api/firms/world';
    const params = new URLSearchParams();
    if (refresh) params.set('refresh', 'true');
    params.set('days', String(Math.min(Math.max(days, 1), 7)));
    if (sensor !== 'ALL') params.set('sensor', sensor);
    const res = await fetch(`${endpoint}?${params.toString()}`);
    if (!res.ok) {
      const err = await res.json().catch(() => ({ error: 'Network error' }));
      throw new Error(err.error || `HTTP ${res.status}`);
    }
    return res.json();
  },

  // Get specific event details + notes
  async getEventById(id: string): Promise<{ event: ThermalEvent; notes: EventNote[] }> {
    const res = await fetch(`/api/firms/event/${encodeURIComponent(id)}`);
    if (!res.ok) throw new Error('Event not found');
    return res.json();
  },

  // Get live OSM context
  async getOsmContext(lat: number, lon: number): Promise<OSMContext> {
    const res = await fetch(`/api/osm/context?lat=${lat}&lon=${lon}`);
    if (!res.ok) throw new Error('OSM context lookup failed');
    return res.json();
  },

  // Get Alerts
  async getAlerts(region?: Region): Promise<{ alerts: Alert[]; count: number }> {
    const query = region ? `?region=${region}` : '';
    const res = await fetch(`/api/alerts${query}`);
    if (!res.ok) throw new Error('Failed to fetch alerts');
    return res.json();
  },

  // Create Alert
  async createAlert(payload: {
    event_id: string;
    severity?: Alert['severity'];
    title?: string;
    context?: string;
    trigger_reasons?: string[];
    notes?: string;
  }): Promise<Alert> {
    const res = await fetch('/api/alerts', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    if (!res.ok) throw new Error('Failed to create alert');
    return res.json();
  },

  // Update Alert Status
  async updateAlertStatus(id: string, status: Alert['status'], operator: string = 'Duty Officer'): Promise<Alert> {
    const res = await fetch(`/api/alerts/${encodeURIComponent(id)}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status, operator }),
    });
    if (!res.ok) throw new Error('Failed to update alert');
    return res.json();
  },

  // Add Alert Note
  async addAlertNote(id: string, note: string): Promise<Alert> {
    const res = await fetch(`/api/alerts/${encodeURIComponent(id)}/notes`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ note }),
    });
    if (!res.ok) throw new Error('Failed to add note to alert');
    return res.json();
  },

  // Add Event Note
  async addEventNote(eventId: string, author: string, content: string): Promise<EventNote> {
    const res = await fetch('/api/notes', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ event_id: eventId, author, content }),
    });
    if (!res.ok) throw new Error('Failed to add event note');
    return res.json();
  },

  // Get Event Notes
  async getEventNotes(eventId: string): Promise<EventNote[]> {
    const res = await fetch(`/api/notes/${encodeURIComponent(eventId)}`);
    if (!res.ok) return [];
    return res.json();
  },

  // Emergency Response Orchestrator — fetch/compute the incident for an event
  async getResponseIncident(eventId: string): Promise<ResponseIncident> {
    const res = await fetch(`/api/response/${encodeURIComponent(eventId)}`);
    if (!res.ok) throw new Error('Failed to fetch response incident');
    return res.json();
  },

  // Apply one operator action (STAGE/DISPATCH/RESTRICT/ACTIVATE/COMPLETE/CANCEL/RESET) to one resource
  async updateResponseResource(
    eventId: string,
    resourceType: ResponseResourceType,
    action: string,
    actor?: string
  ): Promise<ResponseIncident> {
    const res = await fetch(`/api/response/${encodeURIComponent(eventId)}/action`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ resource_type: resourceType, action, actor }),
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({ error: 'Request failed' }));
      throw new Error(err.error || `HTTP ${res.status}`);
    }
    return res.json();
  },

  // Bundle current incident state into a real Alert record
  async createResponsePackage(eventId: string): Promise<{ incident: ResponseIncident; alert: Alert }> {
    const res = await fetch(`/api/response/${encodeURIComponent(eventId)}/package`, { method: 'POST' });
    if (!res.ok) throw new Error('Failed to create response package');
    return res.json();
  },




  async getOsmFeatures(region: Region = 'JHANSI', limit = 800) {
    const res = await fetch(`/api/osm/features?region=${region}&limit=${limit}`);
    if (!res.ok) throw new Error('Failed to fetch OSM industrial features');
    return res.json();
  },

  async getHighConfidenceArchive(region: Region = 'INDIA', fraction = 0.35, limit = 12000) {
    const res = await fetch(`/api/historical/firms/high-confidence?region=${region}&fraction=${fraction}&limit=${limit}`);
    if (!res.ok) throw new Error('Failed to fetch high-confidence FIRMS archive sample');
    return res.json();
  },

  async getReferenceHeatSources(region: Region = 'GLOBAL', limit = 1500): Promise<{ available: boolean; source: string; dataset_url: string; count: number; points: ReferenceHeatSource[] }> {
    const res = await fetch(`/api/reference/heat-sources?region=${region}&limit=${limit}`);
    if (!res.ok) throw new Error('Failed to fetch reference heat sources');
    return res.json();
  },

  async getFirmsHistory(region: Region = 'GLOBAL', days = 30): Promise<{ source: string; region: Region; days: number; count: number; events: ThermalEvent[] }> {
    const res = await fetch(`/api/firms/history?region=${region}&days=${days}`);
    if (!res.ok) throw new Error('Failed to fetch FIRMS history');
    return res.json();
  },


  async getHistoricalModis(region: Region = 'GLOBAL', years: number[] = [2022, 2023, 2024], limit = 4000, minConfidence = 0): Promise<any> {
    const params = new URLSearchParams({ region, years: years.join(','), limit: String(limit), minConfidence: String(minConfidence) });
    const res = await fetch(`/api/historical/modis?${params.toString()}`);
    if (!res.ok) throw new Error('Failed to fetch MODIS historical data');
    return res.json();
  },


  async getHistoricalPersistentCells(region: Region = 'JHANSI') {
    const res = await fetch(`/api/historical/firms/persistent-cells?region=${region}`);
    if (!res.ok) throw new Error('Failed to fetch historical persistent cells');
    return res.json();
  },

  async getHistoricalFirmsSummary(region: Region = 'GLOBAL') {
    const res = await fetch(`/api/historical/firms/summary?region=${region}`);
    if (!res.ok) throw new Error('Failed to fetch historical FIRMS summary');
    return res.json();
  },

  async getHistoricalFirmsPoints(region: Region = 'GLOBAL', limit = 12000) {
    const res = await fetch(`/api/historical/firms/points?region=${region}&limit=${limit}`);
    if (!res.ok) throw new Error('Failed to fetch historical FIRMS points');
    return res.json();
  },

  async getHistoricalModisStatus(): Promise<any> {
    const res = await fetch('/api/historical/modis/status');
    if (!res.ok) throw new Error('Failed to fetch MODIS dataset status');
    return res.json();
  },

  // Get Persistent Sources
  async getPersistentSources(region?: Region): Promise<{ sources: PersistentSource[]; count: number }> {
    const query = region ? `?region=${region}` : '';
    const res = await fetch(`/api/persistent-sources${query}`);
    if (!res.ok) throw new Error('Failed to fetch persistent sources');
    return res.json();
  },

  // Get System Stats
  async getStats() {
    const res = await fetch('/api/stats');
    if (!res.ok) throw new Error('Failed to fetch system stats');
    return res.json();
  },

  // Export CSV url
  getExportUrl(region?: Region): string {
    return `/api/export/csv${region ? `?region=${region}` : ''}`;
  }
};
