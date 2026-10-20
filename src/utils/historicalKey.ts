/**
 * Generates a stable unique React key for historical NASA FIRMS archive observations.
 *
 * When server-side normalization is active, `p.id` is already a deterministic composite key.
 * If a raw data source or upstream client omitted the normalized id, this generates a stable
 * fallback key from coordinates, date, and time (with frp/satellite disambiguator), avoiding
 * index-based keys that break React reconciliation during sorting/filtering.
 *
 * Emits a dev-only console warning when falling back, helping catch unnormalized data feeds.
 */
export function getHistoricalFallbackKey(prefix: string, p: any): string {
  if (p?.id) {
    return p.id;
  }

  if (process.env.NODE_ENV !== 'production') {
    console.warn(`[FIRMS] Historical record missing normalized id; using fallback key:`, p);
  }

  const lat = p?.lat ?? p?.latitude ?? '0';
  const lon = p?.lon ?? p?.longitude ?? '0';
  const date = p?.date ?? p?.acq_date ?? '';
  const time = p?.time ?? p?.acq_time ?? '';
  const disambiguator = p?.frp != null ? `-${p.frp}` : (p?.satellite ? `-${p.satellite}` : '');

  return `${prefix}-${lat}-${lon}-${date}-${time}${disambiguator}`;
}
