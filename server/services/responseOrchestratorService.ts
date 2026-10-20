import {
  ThermalEvent,
  ResponseResource,
  ResponseResourceType,
  ResponseState,
} from '../../src/types.ts';

const RESOURCE_LABELS: Record<ResponseResourceType, string> = {
  FIRE: 'FIRE RESPONSE UNIT',
  MEDICAL: 'AMBULANCE / MEDICAL SUPPORT',
  EVACUATION: 'EVACUATION ZONE',
  ROAD: 'ROAD / TRAFFIC CONTROL',
};

// This system has no real fire-station, ambulance, or road-network dataset.
// The ONLY real distance we can measure is straight-line distance from the
// FIRMS detection to a verified OSM industrial context point. We use that,
// with an assumed average response speed, ONLY to produce a clearly-labeled
// estimate -- never a fabricated figure. If no verified distance exists,
// eta_minutes stays null and the UI must render "DATA NOT AVAILABLE".
const ASSUMED_RESPONSE_SPEED_KMH = 35;

function estimateEta(distanceMeters: number | null | undefined): { minutes: number | null; basis: string | null } {
  if (distanceMeters == null || !Number.isFinite(distanceMeters)) {
    return { minutes: null, basis: null };
  }
  const km = distanceMeters / 1000;
  const minutes = Math.max(1, Math.round((km / ASSUMED_RESPONSE_SPEED_KMH) * 60));
  return {
    minutes,
    basis: `Estimated from straight-line distance (${km.toFixed(2)} km) to the nearest verified OSM context point at an assumed ${ASSUMED_RESPONSE_SPEED_KMH} km/h response speed. Not a routed or real-time ETA.`,
  };
}

// Priority order used to derive a single incident-level status from the
// four resource statuses (most operationally significant first).
const STATUS_PRIORITY: ResponseState[] = ['ACTIVATED', 'STAGED', 'RECOMMENDED', 'CANCELLED', 'COMPLETED', 'STANDBY'];

// Allowed state transitions. Enforced server-side so a stale/forged client
// request can never skip a step (e.g. STANDBY straight to ACTIVATED).
const TRANSITIONS: Record<ResponseState, ResponseState[]> = {
  STANDBY: ['RECOMMENDED', 'STAGED', 'CANCELLED'],
  RECOMMENDED: ['STAGED', 'CANCELLED', 'STANDBY'],
  STAGED: ['ACTIVATED', 'STANDBY', 'CANCELLED'],
  ACTIVATED: ['COMPLETED', 'CANCELLED'],
  COMPLETED: [],
  CANCELLED: ['STANDBY'],
};

export class ResponseOrchestratorService {
  static buildRecommendations(event: ThermalEvent): ResponseResource[] {
    const now = new Date().toISOString();
    const risk = event.risk_analysis?.risk_level || 'LOW';
    const frp = event.frp || 0;
    const osm = event.osm_context;
    const industrialVerified = Boolean(osm?.verified);
    const persistent = Boolean(event.is_persistent);
    const distanceMeters = industrialVerified ? osm?.distance_meters ?? null : null;
    const eta = estimateEta(distanceMeters);

    const make = (
      type: ResponseResourceType,
      status: ResponseState,
      recommendation: string,
      supported: boolean,
      includeEta: boolean
    ): ResponseResource => ({
      type,
      label: RESOURCE_LABELS[type],
      status,
      recommendation,
      recommendation_supported: supported,
      eta_minutes: includeEta ? eta.minutes : null,
      eta_basis: includeEta ? eta.basis : null,
      updated_at: now,
      history: [],
    });

    // FIRE RESPONSE UNIT
    const fire = (risk === 'CRITICAL' || (risk === 'HIGH' && frp >= 20))
      ? make('FIRE', 'RECOMMENDED',
          `${risk} risk with ${frp.toFixed(1)} MW FRP${industrialVerified ? ` near a verified ${osm?.feature_type} asset` : ''}. Recommend staging a fire response unit for field verification.`,
          true, industrialVerified)
      : make('FIRE', 'STANDBY',
          `Current evidence (${risk} risk, ${frp.toFixed(1)} MW FRP) does not meet the threshold to recommend staging a fire unit.`,
          false, false);

    // AMBULANCE / MEDICAL SUPPORT
    const medical = ((risk === 'CRITICAL' || risk === 'HIGH') && industrialVerified)
      ? make('MEDICAL', 'RECOMMENDED',
          `${risk} risk thermal event within a verified industrial context (${osm?.feature_type}) may pose exposure risk to personnel. Recommend medical support on standby.`,
          true, industrialVerified)
      : make('MEDICAL', 'STANDBY',
          'RECOMMENDATION NOT SUPPORTED — no verified industrial exposure context or insufficient risk evidence.',
          false, false);

    // EVACUATION ZONE — population/exposure counts are never available here,
    // so this can only ever flag the need for a manual field assessment.
    const evacuation = (risk === 'CRITICAL' && persistent)
      ? make('EVACUATION', 'RECOMMENDED',
          'CRITICAL, persistent thermal activity warrants a manual field assessment of evacuation need. Population/exposure counts are not available to this system.',
          true, false)
      : make('EVACUATION', 'STANDBY',
          'RECOMMENDATION NOT SUPPORTED — population and exposure data are not available; evacuation decisions require manual field assessment.',
          false, false);

    // ROAD / TRAFFIC CONTROL
    const road = (industrialVerified && distanceMeters != null && distanceMeters < 1500)
      ? make('ROAD', 'RECOMMENDED',
          `Event is ${(distanceMeters / 1000).toFixed(2)} km from a verified ${osm?.feature_type} asset. Recommend restricting approach roads pending verification.`,
          true, true)
      : make('ROAD', 'STANDBY',
          industrialVerified
            ? 'Distance to the nearest verified asset does not meet the proximity threshold for a road-restriction recommendation.'
            : 'RECOMMENDATION NOT SUPPORTED — no verified industrial context to anchor a road-restriction recommendation.',
          false, false);

    return [fire, medical, evacuation, road];
  }

  static deriveOverallStatus(resources: ResponseResource[]): ResponseState {
    for (const status of STATUS_PRIORITY) {
      if (resources.some((r) => r.status === status)) return status;
    }
    return 'STANDBY';
  }

  static validTransition(from: ResponseState, to: ResponseState): boolean {
    return TRANSITIONS[from]?.includes(to) ?? false;
  }

  static actionToTargetState(action: string): ResponseState | null {
    const map: Record<string, ResponseState> = {
      STAGE: 'STAGED',
      DISPATCH: 'STAGED',
      RESTRICT: 'STAGED',
      ACTIVATE: 'ACTIVATED',
      COMPLETE: 'COMPLETED',
      CANCEL: 'CANCELLED',
      RESET: 'STANDBY',
    };
    return map[action] ?? null;
  }
}
