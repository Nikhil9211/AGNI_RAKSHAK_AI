import { Router, Request, Response } from 'express';
import fs from 'fs';
import path from 'path';
import { FirmsService } from '../services/firmsService.ts';
import { OSMService } from '../services/osmService.ts';
import { AlertService } from '../services/alertService.ts';
import { PersistenceService } from '../services/persistenceService.ts';
import { dbService } from '../db/databaseService.ts';
import { Region } from '../../src/types.ts';
import { ReferenceHeatSourcesService } from '../services/referenceHeatSourcesService.ts';
import { HistoricalFirmsArchiveService } from '../services/historicalFirmsArchiveService.ts';
import { ResponseOrchestratorService } from '../services/responseOrchestratorService.ts';
import { ResponseIncident, ResponseState } from '../../src/types.ts';

const router = Router();

// GET /api/health
router.get('/health', (req: Request, res: Response) => {
  const db = dbService.getHealth();
  const firms = FirmsService.getStatus();
  res.json({
    status: db.available && firms.has_api_key ? 'OPERATIONAL' : 'DEGRADED',
    system: 'AGNI RAKSHAK AI',
    problem_statement: 'SIH 26162',
    timestamp: new Date().toISOString(),
    database: db,
    firms: {
      configured: firms.has_api_key,
      last_successful_fetch: firms.last_successful_fetch,
      last_error: firms.last_error,
    },
  });
});

// GET /api/firms/status
router.get('/firms/status', (req: Request, res: Response) => {
  const status = FirmsService.getStatus();
  res.json(status);
});

// Helper for region fetching
async function handleRegionFetch(region: Region, req: Request, res: Response) {
  const force = req.query.refresh === 'true';
  const rawDays = Number(req.query.days || 1);
  const days = Math.min(Math.max(Number.isFinite(rawDays) ? rawDays : 1, 1), 7);
  const requestedSensor = String(req.query.sensor || 'ALL').toUpperCase();
  const sensor = ['NOAA20', 'NOAA21', 'SNPP', 'MODIS'].includes(requestedSensor) ? requestedSensor as 'NOAA20' | 'NOAA21' | 'SNPP' | 'MODIS' : 'ALL';
  try {
    const result = await FirmsService.fetchRegionData(region, force, days, sensor);
    const payload = {
      success: !result.error,
      region,
      source: result.source,
      cached: result.cached,
      count: result.events.length,
      events: result.events,
      error: result.error,
      days,
      sensor,
    };
    if (result.error && !result.cached) {
      res.status(503).setHeader('X-Source', 'NASA FIRMS').setHeader('X-Last-Success', FirmsService.getStatus().last_successful_fetch || '');
      return res.json(payload);
    }
    return res.json(payload);
  } catch (err: any) {
    res.status(500).json({
      success: false,
      region,
      count: 0,
      events: [],
      error: err.message || 'NASA FIRMS UNAVAILABLE',
    });
  }
}

// GET /api/firms/jhansi
router.get('/firms/jhansi', (req: Request, res: Response) => {
  handleRegionFetch('JHANSI', req, res);
});

// GET /api/firms/india
router.get('/firms/india', (req: Request, res: Response) => {
  handleRegionFetch('INDIA', req, res);
});

// GET /api/firms/world or /api/firms/global
router.get('/firms/world', (req: Request, res: Response) => {
  handleRegionFetch('GLOBAL', req, res);
});

router.get('/firms/global', (req: Request, res: Response) => {
  handleRegionFetch('GLOBAL', req, res);
});


// GET /api/firms/wms — secure server-side proxy for NASA FIRMS WMS
router.get('/firms/wms', async (req: Request, res: Response) => {
  const apiKey = dbService.getFirmsApiKey();
  if (!apiKey) {
    return res.status(503).json({ status: 'unavailable', source: 'NASA FIRMS WMS', error: 'FIRMS_API_KEY is not configured' });
  }

  try {
    const upstream = new URL(`https://firms.modaps.eosdis.nasa.gov/mapserver/wms/fires/${encodeURIComponent(apiKey)}/`);
    const allowed = new Set(['layers', 'styles', 'format', 'transparent', 'version', 'srs', 'crs', 'width', 'height', 'bbox', 'time', 'symbols', 'size', 'colors']);
    for (const [rawKey, value] of Object.entries(req.query)) {
      const key = rawKey.toLowerCase();
      if (!allowed.has(key) || value == null) continue;
      const normalized = Array.isArray(value) ? String(value[0]) : String(value);
      upstream.searchParams.set(key, normalized);
    }

    upstream.searchParams.set('service', 'WMS');
    upstream.searchParams.set('request', 'GetMap');
    upstream.searchParams.set('version', String(req.query.version || '1.1.1'));
    upstream.searchParams.set('format', String(req.query.format || 'image/png'));
    upstream.searchParams.set('transparent', String(req.query.transparent ?? 'true'));
    if (!upstream.searchParams.has('srs') && !upstream.searchParams.has('crs')) upstream.searchParams.set('srs', 'EPSG:3857');
    if (!upstream.searchParams.has('styles')) upstream.searchParams.set('styles', '');
    if (!upstream.searchParams.has('layers')) upstream.searchParams.set('layers', 'fires_viirs_24');

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 15000);
    let upstreamRes: globalThis.Response;
    try {
      upstreamRes = await fetch(upstream, { signal: controller.signal });
    } finally {
      clearTimeout(timeoutId);
    }

    const contentType = upstreamRes.headers.get('content-type') || 'image/png';
    const body = Buffer.from(await upstreamRes.arrayBuffer());
    res.status(upstreamRes.status);
    res.setHeader('Content-Type', contentType);
    res.setHeader('X-Source', 'NASA FIRMS WMS');
    res.setHeader('Cache-Control', 'public, max-age=60');
    return res.send(body);
  } catch (err: any) {
    console.error('[FIRMS WMS] Proxy error:', err?.message || err);
    return res.status(502).json({
      status: 'unavailable',
      source: 'NASA FIRMS WMS',
      error: err?.name === 'AbortError' ? 'NASA FIRMS WMS request timed out' : 'NASA FIRMS WMS request failed',
    });
  }
});

// GET /api/firms/event/:id — enrich the selected event on demand with live OSM context and risk
router.get('/firms/event/:id', async (req: Request, res: Response) => {
  const event = dbService.getEventById(req.params.id);
  if (!event) return res.status(404).json({ error: 'Event not found' });

  try {
    const context = await OSMService.getIndustrialContext(event.latitude, event.longitude);
    event.osm_context = context;
    const persistent = event.persistent_source_id
      ? dbService.getPersistentSources('GLOBAL').find((p) => p.id === event.persistent_source_id)
      : undefined;
    event.risk_analysis = (await import('../services/riskService.ts')).RiskService.calculateRisk(
      event, context, Boolean(event.is_persistent), persistent?.detection_count || 1
    );
    dbService.upsertEvent(event);
  } catch (error) {
    // Return the real event even when OSM is temporarily unavailable.
    console.warn('[EVENT ENRICHMENT]', error);
  }

  const notes = dbService.getNotesForEvent(req.params.id);
  res.json({ event: dbService.getEventById(req.params.id), notes });
});

// GET /api/osm/context?lat=...&lon=...
router.get('/osm/features', async (req: Request, res: Response) => {
  const region = (req.query.region as Region) || 'JHANSI';
  const rawLimit = Number(req.query.limit || 800);
  const limit = Math.min(Math.max(Number.isFinite(rawLimit) ? rawLimit : 800, 50), 2000);
  try {
    const result = await OSMService.getIndustrialFeatures(region, limit);
    res.json(result);
  } catch (err: any) {
    res.status(503).json({ region, available: false, features: [], source: 'OpenStreetMap / Overpass', error: err?.message || 'OSM feature lookup failed' });
  }
});

router.get('/osm/context', async (req: Request, res: Response) => {
  const lat = parseFloat(req.query.lat as string);
  const lon = parseFloat(req.query.lon as string);

  if (isNaN(lat) || isNaN(lon)) {
    return res.status(400).json({ error: 'Valid latitude and longitude required' });
  }

  try {
    const context = await OSMService.getIndustrialContext(lat, lon);
    res.json(context);
  } catch (err: any) {
    res.status(500).json({ error: err.message || 'OSM context lookup failed' });
  }
});

// GET /api/alerts
router.get('/alerts', (req: Request, res: Response) => {
  const region = (req.query.region as Region) || undefined;
  const alerts = AlertService.getAlerts(region);
  res.json({ alerts, count: alerts.length });
});

// POST /api/alerts
router.post('/alerts', (req: Request, res: Response) => {
  const { event_id, severity, title, context, trigger_reasons, notes } = req.body;
  if (!event_id) {
    return res.status(400).json({ error: 'event_id is required' });
  }

  const event = dbService.getEventById(event_id);
  if (!event) {
    return res.status(404).json({ error: 'Target thermal event not found' });
  }

  const alert = dbService.createAlert({
    event_id,
    severity: severity || 'HIGH',
    status: 'NEW',
    title: title || `Alert for event ${event_id}`,
    context: context || `Manual operator alert for ${event.source}`,
    trigger_reasons: trigger_reasons || ['Operator Dispatched Incident'],
    latitude: event.latitude,
    longitude: event.longitude,
    frp: event.frp,
    classification: event.risk_analysis?.classification || 'Potential Industrial Thermal Event',
    notes: notes ? [notes] : [`Created by operator at ${new Date().toISOString()}`],
  });

  res.status(201).json(alert);
});

// PATCH /api/alerts/:id
router.patch('/alerts/:id', (req: Request, res: Response) => {
  const { status, operator } = req.body;
  if (!status) {
    return res.status(400).json({ error: 'status is required' });
  }

  const updated = AlertService.updateStatus(req.params.id, status, operator);
  if (!updated) {
    return res.status(404).json({ error: 'Alert not found' });
  }

  res.json(updated);
});

// POST /api/alerts/:id/notes
router.post('/alerts/:id/notes', (req: Request, res: Response) => {
  const { note } = req.body;
  if (!note) {
    return res.status(400).json({ error: 'note text is required' });
  }

  const updated = AlertService.addNote(req.params.id, note);
  if (!updated) {
    return res.status(404).json({ error: 'Alert not found' });
  }

  res.json(updated);
});

// GET /api/response/:eventId
// Computes (or re-reads) the Emergency Response Orchestrator incident for a
// thermal event. Recommendations for resources still at STANDBY/RECOMMENDED
// are recomputed from current evidence on every call; any resource an
// operator has already moved to STAGED/ACTIVATED/COMPLETED/CANCELLED is left
// untouched so an operator's decision is never silently overwritten.
router.get('/response/:eventId', (req: Request, res: Response) => {
  const event = dbService.getEventById(req.params.eventId);
  if (!event) {
    return res.status(404).json({ error: 'Event not found' });
  }

  const existing = dbService.getResponseIncident(event.id);
  const freshResources = ResponseOrchestratorService.buildRecommendations(event);
  const OPERATOR_CONTROLLED: ResponseState[] = ['STAGED', 'ACTIVATED', 'COMPLETED', 'CANCELLED'];

  const resources = freshResources.map((fresh) => {
    const prior = existing?.resources.find((r) => r.type === fresh.type);
    if (prior && OPERATOR_CONTROLLED.includes(prior.status)) {
      return prior;
    }
    return fresh;
  });

  const incident: ResponseIncident = {
    id: existing?.id || `INC-${event.id}`,
    event_id: event.id,
    severity: event.risk_analysis?.risk_level || 'UNASSESSED',
    overall_status: ResponseOrchestratorService.deriveOverallStatus(resources),
    resources,
    created_at: existing?.created_at || new Date().toISOString(),
    updated_at: new Date().toISOString(),
    approved_at: existing?.approved_at || null,
    package_alert_id: existing?.package_alert_id,
  };

  dbService.upsertResponseIncident(incident);
  res.json(incident);
});

// POST /api/response/:eventId/action  { resource_type, action, actor? }
// Applies one operator-driven state transition to one resource. Transitions
// are validated server-side against the allowed state graph so a stale or
// forged client request can never skip a step.
router.post('/response/:eventId/action', (req: Request, res: Response) => {
  const { resource_type, action, actor } = req.body || {};
  if (!resource_type || !action) {
    return res.status(400).json({ error: 'resource_type and action are required' });
  }

  const incident = dbService.getResponseIncident(req.params.eventId);
  if (!incident) {
    return res.status(404).json({ error: 'No response incident found for this event. Fetch GET /api/response/:eventId first.' });
  }

  const resource = incident.resources.find((r) => r.type === resource_type);
  if (!resource) {
    return res.status(404).json({ error: `Unknown resource type ${resource_type}` });
  }

  const target = ResponseOrchestratorService.actionToTargetState(action);
  if (!target) {
    return res.status(400).json({ error: `Unknown action ${action}` });
  }

  if (!ResponseOrchestratorService.validTransition(resource.status, target)) {
    return res.status(409).json({ error: `Cannot move ${resource_type} from ${resource.status} to ${target}` });
  }

  const now = new Date().toISOString();
  resource.history.push({ at: now, from: resource.status, to: target, actor: actor || 'Duty Officer' });
  resource.status = target;
  resource.updated_at = now;
  if (target === 'STAGED' && !incident.approved_at) {
    incident.approved_at = now;
  }

  incident.overall_status = ResponseOrchestratorService.deriveOverallStatus(incident.resources);
  incident.updated_at = now;

  dbService.upsertResponseIncident(incident);
  res.json(incident);
});

// POST /api/response/:eventId/package
// Generates a response package: bundles the current incident/resource state
// into a real Alert record (reusing the existing alert infrastructure)
// rather than inventing a separate, untracked artifact.
router.post('/response/:eventId/package', (req: Request, res: Response) => {
  const event = dbService.getEventById(req.params.eventId);
  const incident = dbService.getResponseIncident(req.params.eventId);
  if (!event || !incident) {
    return res.status(404).json({ error: 'Event or response incident not found' });
  }

  const summaryLines = incident.resources.map((r) =>
    `${r.label}: ${r.status}${r.eta_minutes != null ? ` (est. ${r.eta_minutes} min)` : ''} — ${r.recommendation}`
  );

  const alert = dbService.createAlert({
    event_id: event.id,
    severity: (incident.severity === 'UNASSESSED' ? 'MODERATE' : incident.severity) as any,
    status: 'NEW',
    title: `Response package — ${incident.id}`,
    context: event.risk_analysis?.primary_reason || 'Response package generated from orchestrator evidence.',
    trigger_reasons: event.risk_analysis?.explainability || ['Response package generated'],
    latitude: event.latitude,
    longitude: event.longitude,
    frp: event.frp,
    classification: event.risk_analysis?.classification || 'Potential Industrial Thermal Event',
    notes: [`Incident ${incident.id} — overall status ${incident.overall_status}`, ...summaryLines],
  });

  incident.package_alert_id = alert.id;
  incident.updated_at = new Date().toISOString();
  dbService.upsertResponseIncident(incident);

  res.status(201).json({ incident, alert });
});

// POST /api/notes
router.post('/notes', (req: Request, res: Response) => {
  const { event_id, author, content } = req.body;
  if (!event_id || !content) {
    return res.status(400).json({ error: 'event_id and content are required' });
  }

  const note = dbService.addEventNote(event_id, author || 'Duty Officer', content);
  res.status(201).json(note);
});

// GET /api/notes/:eventId
router.get('/notes/:eventId', (req: Request, res: Response) => {
  const notes = dbService.getNotesForEvent(req.params.eventId);
  res.json(notes);
});


// GET /api/reference/heat-sources?region=JHANSI|INDIA|GLOBAL&limit=...
router.get('/reference/heat-sources', (req: Request, res: Response) => {
  const region = (req.query.region as Region) || 'GLOBAL';
  const rawLimit = Number(req.query.limit || 1500);
  const limit = Math.min(Math.max(Number.isFinite(rawLimit) ? rawLimit : 1500, 1), 10000);
  res.json({
    ...ReferenceHeatSourcesService.getStatus(),
    region,
    points: ReferenceHeatSourcesService.getForRegion(region, limit),
  });
});


// GET /api/historical/firms/status
router.get('/historical/firms/status', (_req: Request, res: Response) => {
  res.json(HistoricalFirmsArchiveService.getStatus());
});

// GET /api/historical/firms/summary?region=JHANSI|INDIA|GLOBAL
router.get('/historical/firms/summary', (req: Request, res: Response) => {
  const region = (req.query.region as Region) || 'GLOBAL';
  res.json(HistoricalFirmsArchiveService.getSummary(region));
});

// GET /api/historical/firms/points?region=...&sensor=ALL|MODIS|NOAA-20|SUOMI-NPP
router.get('/historical/firms/persistent-cells', (req: Request, res: Response) => {
  const region = (req.query.region as Region) || 'JHANSI';
  if (region !== 'JHANSI') {
    return res.json({ region, source: 'NASA FIRMS historical archive', available: false, count: 0, cells: [], note: 'Precomputed repeat-cell evidence is currently supplied for Jhansi only.' });
  }
  try {
    const file = path.join(process.cwd(), 'server', 'data', 'historical', 'firms3y', 'jhansi_repeat_cells.json');
    const data = JSON.parse(fs.readFileSync(file, 'utf8'));
    return res.json({ region: 'JHANSI', source: data.region === 'JHANSI' ? data.region + ' · NASA FIRMS historical archive' : 'NASA FIRMS historical archive', available: true, count: data.count, cells: data.cells, method: data.cells?.[0]?.method || 'precomputed repeat-cell evidence' });
  } catch {
    return res.status(503).json({ region, available: false, count: 0, cells: [], error: 'Historical repeat-cell dataset unavailable' });
  }
});

router.get('/historical/firms/points', (req: Request, res: Response) => {
  const region = (req.query.region as Region) || 'GLOBAL';
  const sensor = String(req.query.sensor || 'ALL') as any;
  const fromYear = Number(req.query.fromYear || 2022);
  const toYear = Number(req.query.toYear || 2024);
  const rawLimit = Number(req.query.limit || (region === 'JHANSI' ? 5000 : 12000));
  const limit = Math.min(Math.max(Number.isFinite(rawLimit) ? rawLimit : 12000, 1), 20000);
  res.json(HistoricalFirmsArchiveService.getPoints({ region, sensor, fromYear, toYear, limit }));
});

// GET /api/historical/modis?region=...&years=2022,2023,2024&limit=...&minConfidence=...
router.get('/historical/firms/high-confidence', (req: Request, res: Response) => {
  const region = (req.query.region as Region) || 'INDIA';
  const rawFraction = Number(req.query.fraction || 0.35);
  const fraction = Math.min(Math.max(Number.isFinite(rawFraction) ? rawFraction : 0.35, 0.30), 0.40);
  const rawLimit = Number(req.query.limit || (region === 'JHANSI' ? 1000 : 12000));
  const limit = Math.min(Math.max(Number.isFinite(rawLimit) ? rawLimit : 12000, 1), 20000);
  res.json(HistoricalFirmsArchiveService.getHighConfidenceSample({ region, fraction, limit }));
});

router.get('/historical/modis', (req: Request, res: Response) => {
  const region = (req.query.region as Region) || 'GLOBAL';
  const fromYear = Number(req.query.fromYear || 2022);
  const toYear = Number(req.query.toYear || 2024);
  const rawLimit = Number(req.query.limit || (region === 'JHANSI' ? 5000 : 12000));
  const limit = Math.min(Math.max(Number.isFinite(rawLimit) ? rawLimit : 12000, 1), 20000);
  const result = HistoricalFirmsArchiveService.getPoints({ region, sensor: 'MODIS', fromYear, toYear, limit });
  res.json({ ...result, source: 'NASA FIRMS MODIS C6.1 historical archive' });
});

// GET /api/historical/modis/status
router.get('/historical/modis/status', (_req: Request, res: Response) => {
  const status = HistoricalFirmsArchiveService.getStatus();
  res.json({
    available: status.available,
    source: 'NASA FIRMS MODIS C6.1 historical archive',
    dataset_scope: status.scope,
    years: status.years,
    total_records: status.by_source?.MODIS || 0,
    provenance: status.provenance,
  });
});

// GET /api/firms/history?region=...&days=...
router.get('/firms/history', (req: Request, res: Response) => {
  const region = (req.query.region as Region) || 'GLOBAL';
  const days = Math.min(Math.max(Number(req.query.days || 30), 1), 3650);
  const cutoff = Date.now() - days * 86400000;
  const events = dbService.getEvents(region).filter((event) => new Date(event.timestamp).getTime() >= cutoff);
  res.json({
    source: 'NASA FIRMS / stored observations',
    region,
    days,
    count: events.length,
    events,
  });
});

// GET /api/persistent-sources
router.get('/persistent-sources', (req: Request, res: Response) => {
  const region = (req.query.region as Region) || undefined;
  const sources = PersistenceService.getPersistentSources(region);
  res.json({ sources, count: sources.length });
});

// GET /api/stats
router.get('/stats', (req: Request, res: Response) => {
  const stats = dbService.getStats();
  const firmsStatus = FirmsService.getStatus();
  res.json({
    ...stats,
    database: dbService.getHealth(),
    firms: firmsStatus,
    historical_firms: HistoricalFirmsArchiveService.getSummary('INDIA'),
  });
});

// GET /api/export/csv
router.get('/export/csv', (req: Request, res: Response) => {
  const region = (req.query.region as Region) || undefined;
  const events = dbService.getEvents(region);

  const header = 'id,latitude,longitude,acq_date,acq_time,satellite,instrument,confidence,frp,classification,risk_score,risk_level,industrial_feature,distance_m\n';
  const rows = events.map((e) => {
    const risk = e.risk_analysis;
    const osm = e.osm_context;
    return `"${e.id}",${e.latitude},${e.longitude},"${e.acq_date}","${e.acq_time}","${e.satellite}","${e.instrument}",${e.confidence},${e.frp},"${risk?.classification || 'N/A'}",${risk?.risk_score || 0},"${risk?.risk_level || 'N/A'}","${osm?.feature_name || 'N/A'}",${osm?.distance_meters || 'N/A'}`;
  }).join('\n');

  res.setHeader('Content-Type', 'text/csv');
  res.setHeader('Content-Disposition', `attachment; filename=agni_rakshak_${region || 'all'}_events.csv`);
  res.send(header + rows);
});

export default router;
