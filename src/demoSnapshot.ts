import { Alert, ThermalEvent } from './types.ts';
import { createDemoIndustrialAssets } from './demoIndustrialAssets.ts';

// Deterministic PRNG (mulberry32). PRESENTATION SNAPSHOT / SIMULATED DATA only.
// Fixed seed on purpose: the spec requires fixed coordinates and no marker
// jumping between renders, so this must never depend on Date.now() or any
// other non-deterministic input.
function makeRng(seed: number) {
  let t = seed >>> 0;
  return () => {
    t += 0x6D2B79F5;
    let r = Math.imul(t ^ (t >>> 15), 1 | t);
    r ^= r + Math.imul(r ^ (r >>> 7), 61 | r);
    return ((r ^ (r >>> 14)) >>> 0) / 4294967296;
  };
}

const DEMO_SEED = 90210; // fixed — do not derive from time/date

// Anchor zones for the wider India spread. Each entry is [lat, lon, weight]
// roughly following real industrial corridors, so demo hotspots cluster near
// the demo industrial asset layer instead of scattering randomly across India.
const INDIA_HOTSPOT_ZONES: Array<{ lat: number; lon: number; spread: number }> = [
  { lat: 22.34, lon: 69.85, spread: 0.35 },  // Jamnagar / Gujarat refinery belt
  { lat: 23.67, lon: 86.15, spread: 0.4 },   // Bokaro / Jharkhand steel belt
  { lat: 22.35, lon: 82.68, spread: 0.4 },   // Korba / Chhattisgarh power-coal belt
  { lat: 20.95, lon: 85.23, spread: 0.4 },   // Talcher / Odisha coal-power belt
  { lat: 26.45, lon: 80.33, spread: 0.5 },   // Kanpur industrial belt, UP
  { lat: 20.37, lon: 72.91, spread: 0.35 },  // Vapi / South Gujarat chemical belt
  { lat: 19.95, lon: 79.30, spread: 0.45 },  // Chandrapur, Vidarbha
  { lat: 22.61, lon: 75.65, spread: 0.4 },   // Pithampur / Indore-Dewas belt, MP
];

// Jhansi / Bundelkhand corridor — the priority monitoring region, given a
// deliberately tighter spread and a larger share of total events.
const JHANSI_ZONE = { lat: 25.44, lon: 78.62, spread: 0.22 };

const TOTAL_EVENTS = 48;
const JHANSI_SHARE = 22; // remainder spread across the wider India zones

export function createPresentationDemoSnapshot() {
  const rand = makeRng(DEMO_SEED);
  const now = Date.now();
  const classes = ['Potential Industrial Thermal Event', 'Persistent Thermal Source', 'Vegetation Fire', 'Agricultural Burn', 'Unknown Thermal Anomaly'] as const;
  const satellites = ['NOAA-20', 'NOAA-21'];
  const industrialAssets = createDemoIndustrialAssets();

  const events: ThermalEvent[] = Array.from({ length: TOTAL_EVENTS }, (_, i) => {
    const inJhansi = i < JHANSI_SHARE;
    const zone = inJhansi ? JHANSI_ZONE : INDIA_HOTSPOT_ZONES[(i - JHANSI_SHARE) % INDIA_HOTSPOT_ZONES.length];
    const latitude = zone.lat + (rand() - 0.5) * zone.spread;
    const longitude = zone.lon + (rand() - 0.5) * zone.spread;

    // Roughly a quarter of events are "high" severity, weighted toward Jhansi.
    const high = rand() < (inJhansi ? 0.4 : 0.22);
    const confidence = high ? 78 + Math.round(rand() * 20) : 52 + Math.round(rand() * 28);
    const frp = high ? 55 + rand() * 125 : 8 + rand() * 45;

    // Attach industrial context when a demo industrial asset is genuinely nearby
    // (rather than a coin-flip), so ASSESS IMPACT reasoning stays consistent
    // with the industrial layer shown on the map.
    let nearestAsset: (typeof industrialAssets)[number] | null = null;
    let nearestDistM = Infinity;
    for (const asset of industrialAssets) {
      const dLat = (asset.latitude - latitude) * 111320;
      const dLon = (asset.longitude - longitude) * 111320 * Math.cos(latitude * Math.PI / 180);
      const dist = Math.sqrt(dLat * dLat + dLon * dLon);
      if (dist < nearestDistM) { nearestDistM = dist; nearestAsset = asset; }
    }
    const industrial = Boolean(nearestAsset) && nearestDistM <= 1800;
    const persistent = high && rand() > 0.5;

    const classification = industrial ? 'Potential Industrial Thermal Event' : persistent ? 'Persistent Thermal Source' : classes[2 + Math.floor(rand() * 3)];
    const riskScore = Math.round(Math.min(96, (frp / 2.2) * 0.45 + confidence * 0.45 + (industrial ? 15 : 2) + (persistent ? 12 : 0)));
    const ts = new Date(now - i * (11 + Math.floor(rand() * 19)) * 60_000).toISOString();

    return {
      id: `DEMO-EV-${String(i + 1).padStart(3, '0')}`,
      external_id: `DEMO-EV-${String(i + 1).padStart(3, '0')}`,
      latitude, longitude,
      acq_date: ts.slice(0, 10),
      acq_time: ts.slice(11, 16),
      satellite: satellites[i % 2], instrument: 'VIIRS',
      confidence, confidence_raw: confidence,
      frp: Number(frp.toFixed(1)),
      bright_ti4: Number((318 + rand() * 20).toFixed(1)),
      bright_ti5: Number((301 + rand() * 15).toFixed(1)),
      scan: Number((0.35 + rand() * 0.35).toFixed(2)),
      track: Number((0.25 + rand() * 0.3).toFixed(2)),
      daynight: rand() > 0.78 ? 'N' : 'D',
      source: 'PRESENTATION DEMO', timestamp: ts,
      is_persistent: persistent, persistent_source_id: persistent ? `DEMO-PS-${(i % 4) + 1}` : undefined,
      osm_context: industrial && nearestAsset ? {
        feature_name: nearestAsset.name,
        feature_type: nearestAsset.type,
        distance_meters: Math.round(nearestDistM),
        industrial_score: 70 + Math.round(rand() * 25),
        verified: true,
      } : null,
      risk_analysis: {
        risk_score: riskScore,
        risk_level: riskScore >= 81 ? 'CRITICAL' : riskScore >= 61 ? 'HIGH' : riskScore >= 31 ? 'MODERATE' : 'LOW',
        classification,
        explainability: [
          high ? 'Elevated thermal intensity in demonstration scenario.' : 'Moderate thermal intensity.',
          industrial ? 'Mapped industrial context is nearby.' : 'No verified industrial context is attached.',
          persistent ? 'Repeated detections are available in the demonstration scenario.' : 'Persistence remains unconfirmed.'
        ],
        primary_reason: industrial ? 'High thermal intensity with mapped industrial context; priority review recommended.' : 'Thermal anomaly requires contextual review before industrial classification.',
        component_scores: {
          thermal_intensity: Math.round(Math.min(30, (frp / 6))),
          persistence: persistent ? 18 : 4,
          industrial_context: industrial ? 18 : 4,
          historical_anomaly: persistent ? 11 : 5,
          detection_confidence: Math.round(confidence / 10)
        },
        ai_confidence: Math.min(95, Math.round((confidence + (industrial ? 10 : 0)) * 0.86)),
        engine_label: 'PROTOTYPE / RULE-ASSISTED AI'
      },
      created_at: ts,
      updated_at: ts
    } as ThermalEvent;
  });

  const alerts: Alert[] = events.filter((e) => ['HIGH', 'CRITICAL'].includes(e.risk_analysis?.risk_level || '')).slice(0, 6).map((e, i) => ({
    id: `DEMO-AL-${String(i + 1).padStart(3, '0')}`,
    event_id: e.id,
    severity: e.risk_analysis!.risk_level as Alert['severity'],
    status: i === 0 ? 'NEW' : i === 1 ? 'INVESTIGATING' : i === 2 ? 'ACKNOWLEDGED' : 'NEW',
    title: e.risk_analysis!.classification,
    context: e.risk_analysis!.primary_reason,
    trigger_reasons: e.risk_analysis!.explainability,
    latitude: e.latitude, longitude: e.longitude, frp: e.frp,
    classification: e.risk_analysis!.classification,
    notes: [], created_at: e.created_at, updated_at: e.updated_at
  }));

  const persistent = events.filter((e) => e.is_persistent).slice(0, 5).map((e, i) => ({
    id: `DEMO-PS-${i + 1}`, cluster_id: `DEMO-C-${i + 1}`, latitude: e.latitude, longitude: e.longitude,
    detection_count: 3 + i, first_seen: e.created_at, last_seen: e.updated_at, duration_hours: 12 + i * 8,
    avg_frp: e.frp * 0.72, max_frp: e.frp, cluster_radius_m: 400 + i * 120,
    associated_event_ids: [e.id], nearest_industrial: e.osm_context?.feature_name
  }));

  return { events, alerts, persistentSources: persistent };
}

export const presentationDemoEvents: ThermalEvent[] = createPresentationDemoSnapshot().events;
export const presentationDemoAlerts = createPresentationDemoSnapshot().alerts;
