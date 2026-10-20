import { Alert, ThermalEvent, Region } from '../../src/types.ts';
import { dbService } from '../db/databaseService.ts';

export class AlertService {
  /**
   * Evaluate a thermal event to determine if an alert should be automatically raised.
   */
  public static evaluateAndCreateAlert(event: ThermalEvent): Alert | null {
    if (event.alert_id) {
      const existing = dbService.getAlertById(event.alert_id);
      if (existing) return existing;
    }

    const risk = event.risk_analysis;
    const triggers: string[] = [];

    if (event.frp >= 75) {
      triggers.push(`High Fire Radiative Power (${event.frp.toFixed(1)} MW)`);
    }
    if (event.is_persistent) {
      triggers.push('Persistent thermal activity across separated observations');
    }
    if (event.osm_context?.verified && event.osm_context.distance_meters <= 300) {
      triggers.push(`Very close to verified OSM ${event.osm_context.feature_type}: ${event.osm_context.feature_name}`);
    }
    if (risk && (risk.risk_level === 'CRITICAL' || risk.risk_level === 'HIGH')) {
      triggers.push(`AI risk ${risk.risk_level} (${risk.risk_score}/100)`);
    }
    if (event.confidence >= 90 && event.frp >= 40) {
      triggers.push(`High-confidence high-energy detection (${event.confidence}% confidence)`);
    }

    // Avoid alert fatigue: only high-signal events become automatic alerts.
    if (triggers.length === 0) return null;

    const severity: Alert['severity'] = risk?.risk_level || (event.frp >= 100 ? 'CRITICAL' : 'HIGH');
    const classification = risk?.classification || 'Thermal Detection';
    const title = `${classification} at ${event.latitude.toFixed(3)}°N, ${event.longitude.toFixed(3)}°E`;
    const context = event.osm_context?.verified
      ? `OSM context: ${event.osm_context.feature_name} (${event.osm_context.distance_meters}m). NASA source: ${event.source}/${event.satellite}.`
      : `NASA FIRMS thermal detection at [${event.latitude.toFixed(3)}, ${event.longitude.toFixed(3)}]. Source: ${event.source}/${event.satellite}.`;

    const alert = dbService.createAlert({
      event_id: event.id,
      severity,
      status: 'NEW',
      title,
      context,
      trigger_reasons: triggers,
      latitude: event.latitude,
      longitude: event.longitude,
      frp: event.frp,
      classification,
      notes: [`[${new Date().toISOString()}] Automated alert created from verified FIRMS event signals.`],
    });

    return alert;
  }

  public static getAlerts(region?: Region): Alert[] {
    return dbService.getAlerts(region);
  }

  public static getAlertById(id: string): Alert | undefined {
    return dbService.getAlertById(id);
  }

  public static updateStatus(id: string, status: Alert['status'], operator: string = 'Duty Officer'): Alert | null {
    return dbService.updateAlertStatus(id, status, operator);
  }

  public static addNote(id: string, note: string): Alert | null {
    return dbService.addAlertNote(id, note);
  }
}
