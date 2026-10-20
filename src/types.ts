export type Region = 'JHANSI' | 'INDIA' | 'GLOBAL';

export interface BoundingBox {
  west: number;
  south: number;
  east: number;
  north: number;
}

export const REGION_BOUNDS: Record<Region, BoundingBox> = {
  JHANSI: {
    west: 78.30,
    south: 25.20,
    east: 78.85,
    north: 25.70,
  },
  INDIA: {
    west: 68.10,
    south: 6.70,
    east: 97.40,
    north: 35.50,
  },
  GLOBAL: {
    west: -180.0,
    south: -85.0,
    east: 180.0,
    north: 85.0,
  },
};


export interface OSMFeature {
  id: string;
  latitude: number;
  longitude: number;
  type: 'refinery' | 'mine' | 'factory' | 'power' | 'industrial';
  name: string;
  tags?: Record<string, string>;
}

export interface OSMContext {
  feature_name: string;
  feature_type: 'industrial' | 'factory' | 'power' | 'substation' | 'warehouse' | 'works' | 'infrastructure' | 'kiln' | 'none';
  distance_meters: number;
  osm_id?: string;
  industrial_score: number; // 0 - 100
  coordinates?: [number, number];
  tags?: Record<string, string>;
  verified: boolean;
}

export type RiskLevel = 'LOW' | 'MODERATE' | 'HIGH' | 'CRITICAL';

export type AIClassification = 
  | 'Potential Industrial Thermal Event'
  | 'Persistent Thermal Source'
  | 'Agricultural Burn'
  | 'Vegetation Fire'
  | 'Unknown Thermal Anomaly';

export interface RiskAnalysis {
  risk_score: number; // 0 - 100
  risk_level: RiskLevel;
  classification: AIClassification;
  explainability: string[];
  primary_reason: string;
  component_scores: {
    thermal_intensity: number; // weight 30%
    persistence: number;       // weight 25%
    industrial_context: number;// weight 20%
    historical_anomaly: number;// weight 15%
    detection_confidence: number;// weight 10%
  };
  ai_confidence: number;
  engine_label: 'PROTOTYPE / RULE-ASSISTED AI';
}

export interface ThermalEvent {
  id: string;
  external_id: string;
  latitude: number;
  longitude: number;
  acq_date: string;
  acq_time: string;
  satellite: string;
  instrument: string;
  confidence: number; // normalized 0 - 100
  confidence_raw?: string | number;
  frp: number; // Fire Radiative Power (MW)
  bright_ti4: number | null; // Kelvin
  bright_ti5: number | null; // Kelvin
  scan: number | null;
  track: number | null;
  daynight: 'D' | 'N' | null;
  source: string;
  timestamp: string; // ISO format
  is_persistent?: boolean;
  persistent_source_id?: string;
  osm_context?: OSMContext | null;
  risk_analysis?: RiskAnalysis;
  notes_count?: number;
  alert_id?: string;
  created_at: string;
  updated_at: string;
}

export interface PersistentSource {
  id: string;
  cluster_id: string;
  latitude: number;
  longitude: number;
  detection_count: number;
  first_seen: string;
  last_seen: string;
  duration_hours: number;
  avg_frp: number;
  max_frp: number;
  cluster_radius_m: number;
  associated_event_ids: string[];
  nearest_industrial?: string;
}

export type AlertSeverity = 'LOW' | 'MODERATE' | 'HIGH' | 'CRITICAL';
export type AlertStatus = 'NEW' | 'INVESTIGATING' | 'ACKNOWLEDGED' | 'RESOLVED';

export interface Alert {
  id: string;
  event_id: string;
  severity: AlertSeverity;
  status: AlertStatus;
  title: string;
  context: string;
  trigger_reasons: string[];
  latitude: number;
  longitude: number;
  frp: number;
  classification: string;
  notes: string[];
  created_at: string;
  updated_at: string;
  acknowledged_at?: string;
  resolved_at?: string;
  acknowledged_by?: string;
  resolved_by?: string;
}

// --- Emergency Response Orchestrator (decision-support only) ---
export type ResponseResourceType = 'FIRE' | 'MEDICAL' | 'EVACUATION' | 'ROAD';

export type ResponseState =
  | 'STANDBY'
  | 'RECOMMENDED'
  | 'STAGED'
  | 'ACTIVATED'
  | 'COMPLETED'
  | 'CANCELLED';

export interface ResponseResourceHistoryEntry {
  at: string;
  from: ResponseState;
  to: ResponseState;
  actor: string;
}

export interface ResponseResource {
  type: ResponseResourceType;
  label: string;
  status: ResponseState;
  /** Evidence-based reasoning, or a literal "RECOMMENDATION NOT SUPPORTED" explanation. */
  recommendation: string;
  recommendation_supported: boolean;
  /** Only populated when derivable from a real measured distance; otherwise null. */
  eta_minutes: number | null;
  /** Plain-language explanation of how eta_minutes was derived; null when eta_minutes is null. */
  eta_basis: string | null;
  updated_at: string;
  history: ResponseResourceHistoryEntry[];
}

export interface ResponseIncident {
  id: string;
  event_id: string;
  severity: RiskLevel | 'UNASSESSED';
  overall_status: ResponseState;
  resources: ResponseResource[];
  created_at: string;
  updated_at: string;
  approved_at: string | null;
  package_alert_id?: string;
}

export interface EventNote {
  id: string;
  event_id: string;
  author: string;
  content: string;
  created_at: string;
}

export interface FetchLog {
  id: string;
  source: string;
  region: string;
  status: 'SUCCESS' | 'ERROR' | 'CACHED' | 'RATE_LIMITED';
  records_fetched: number;
  latency_ms: number;
  timestamp: string;
  error_message?: string;
}

export interface FirmsStatus {
  available: boolean;
  has_api_key: boolean;
  last_successful_fetch: string | null;
  last_error: string | null;
  active_source: string;
  total_events_in_db: number;
  total_persistent_sources: number;
  total_active_alerts: number;
  cache_age_seconds: number | null;
  latency_ms: number;
}

export interface HistoricalFirmsSummary {
  available: boolean;
  source: string;
  scope: string;
  region?: Region;
  years: number[];
  total_records: number;
  by_source?: Record<string, number>;
  by_year?: Record<string, number>;
  high_confidence_70plus_normalized?: number;
  frp_max_mw?: number;
  frp_mean_mw?: number;
  monthly?: Record<string, number>;
  persistence_cells_ge2_dates?: number;
  persistence_cells_ge3_obs_2dates?: number;
  provenance?: string;
  note?: string;
}
