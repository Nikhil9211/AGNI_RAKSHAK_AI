import { PersistentSource, ThermalEvent, Region } from '../../src/types.ts';
import { dbService, haversineDistanceMeters } from '../db/databaseService.ts';

export class PersistenceService {
  private static RADIUS_M = 500;
  private static MIN_SEPARATION_HOURS = 1;
  private static MIN_DETECTIONS = 2;

  public static updateClusters(): PersistentSource[] {
    const allEvents = dbService.getEvents('GLOBAL');
    if (allEvents.length === 0) return [];

    // Only observations with valid timestamps participate in persistence analysis.
    const usable = allEvents.filter((e) => Number.isFinite(new Date(e.timestamp).getTime()));
    usable.sort((a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime());

    const clusters: Array<{ events: ThermalEvent[]; lat: number; lon: number }> = [];

    for (const event of usable) {
      let target = clusters.find((cluster) =>
        haversineDistanceMeters(event.latitude, event.longitude, cluster.lat, cluster.lon) <= this.RADIUS_M
      );

      if (!target) {
        target = { events: [], lat: event.latitude, lon: event.longitude };
        clusters.push(target);
      }

      target.events.push(event);
      target.lat = target.events.reduce((s, e) => s + e.latitude, 0) / target.events.length;
      target.lon = target.events.reduce((s, e) => s + e.longitude, 0) / target.events.length;
    }

    dbService.clearPersistentSources();
    const persistentSources: PersistentSource[] = [];

    const updates: ThermalEvent[] = [];

    for (const [idx, cluster] of clusters.entries()) {
      if (cluster.events.length < this.MIN_DETECTIONS) continue;

      let distinctIntervals = 0;
      let previousTime: number | null = null;
      const times = new Set<string>();
      for (const event of cluster.events) {
        const t = new Date(event.timestamp).getTime();
        const acquisitionKey = `${event.acq_date}-${event.acq_time}`;
        if (!times.has(acquisitionKey)) {
          times.add(acquisitionKey);
          if (previousTime === null || (t - previousTime) >= this.MIN_SEPARATION_HOURS * 3600000) {
            distinctIntervals++;
            previousTime = t;
          }
        }
      }

      if (distinctIntervals < 2) continue;

      const firstSeen = cluster.events[0].timestamp;
      const lastSeen = cluster.events[cluster.events.length - 1].timestamp;
      const durationHours = Math.max(0, (new Date(lastSeen).getTime() - new Date(firstSeen).getTime()) / 3600000);
      const avgFrp = cluster.events.reduce((s, e) => s + (e.frp || 0), 0) / cluster.events.length;
      const maxFrp = Math.max(...cluster.events.map((e) => e.frp || 0));

      const source: PersistentSource = {
        id: `PERSIST-${idx + 1}-${Math.round(cluster.lat * 1000)}-${Math.round(cluster.lon * 1000)}`,
        cluster_id: `CL-${idx + 1}`,
        latitude: Number(cluster.lat.toFixed(5)),
        longitude: Number(cluster.lon.toFixed(5)),
        detection_count: cluster.events.length,
        first_seen: firstSeen,
        last_seen: lastSeen,
        duration_hours: Number(durationHours.toFixed(1)),
        avg_frp: Number(avgFrp.toFixed(1)),
        max_frp: Number(maxFrp.toFixed(1)),
        cluster_radius_m: this.RADIUS_M,
        associated_event_ids: cluster.events.map((e) => e.id),
        nearest_industrial: cluster.events.find((e) => e.osm_context?.verified)?.osm_context?.feature_name,
      };

      dbService.savePersistentSource(source);
      persistentSources.push(source);

      for (const event of cluster.events) {
        event.is_persistent = true;
        event.persistent_source_id = source.id;
        updates.push(event);
      }
    }

    if (updates.length) dbService.updateEvents(updates);
    return persistentSources;
  }

  public static getPersistentSources(region?: Region): PersistentSource[] {
    return dbService.getPersistentSources(region);
  }
}
