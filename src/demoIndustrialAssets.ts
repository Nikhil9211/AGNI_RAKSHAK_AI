import { OSMFeature } from './types.ts';

// Deterministic PRNG (mulberry32) — fixed seed, same output on every load.
// This must NEVER use Date.now() or any other non-deterministic input:
// the spec requires fixed coordinates with no marker jumping between renders.
function makeRng(seed: number) {
  let t = seed >>> 0;
  return () => {
    t += 0x6d2b79f5;
    let r = Math.imul(t ^ (t >>> 15), 1 | t);
    r ^= r + Math.imul(r ^ (r >>> 7), 61 | r);
    return ((r ^ (r >>> 14)) >>> 0) / 4294967296;
  };
}

type AssetSeed = { name: string; lat: number; lon: number; type: OSMFeature['type'] };

// Real, named Indian industrial hubs used only as approximate anchor points for
// PRESENTATION SNAPSHOT markers in demo mode. These are not sourced from live
// OSM/Overpass data and must never be shown outside demo mode.
const INDIA_INDUSTRIAL_ANCHORS: AssetSeed[] = [
  { name: 'Jamnagar Refinery Complex', lat: 22.34, lon: 69.85, type: 'refinery' },
  { name: 'Vadodara Petrochemical Zone', lat: 22.31, lon: 73.19, type: 'refinery' },
  { name: 'Panipat Refinery & Petrochemicals', lat: 29.39, lon: 76.97, type: 'refinery' },
  { name: 'Mathura Refinery', lat: 27.49, lon: 77.67, type: 'refinery' },
  { name: 'Barauni Refinery', lat: 25.47, lon: 85.97, type: 'refinery' },
  { name: 'Visakhapatnam Refinery & Port', lat: 17.68, lon: 83.22, type: 'refinery' },
  { name: 'Bokaro Steel Plant', lat: 23.67, lon: 86.15, type: 'factory' },
  { name: 'Durgapur Steel & Industrial Belt', lat: 23.52, lon: 87.31, type: 'factory' },
  { name: 'Jamshedpur Steel Works', lat: 22.80, lon: 86.19, type: 'factory' },
  { name: 'Rourkela Steel Plant', lat: 22.22, lon: 84.85, type: 'factory' },
  { name: 'Bhilai Steel Plant', lat: 21.21, lon: 81.38, type: 'factory' },
  { name: 'Vijayanagar Steel Works', lat: 15.18, lon: 76.65, type: 'factory' },
  { name: 'Rajgangpur Cement Belt', lat: 22.19, lon: 84.60, type: 'factory' },
  { name: 'Satna Cement Corridor', lat: 24.58, lon: 80.83, type: 'industrial' },
  { name: 'Chandrapur Industrial Area', lat: 19.95, lon: 79.30, type: 'industrial' },
  { name: 'Korba Power & Coal Belt', lat: 22.35, lon: 82.68, type: 'power' },
  { name: 'Singrauli Power Cluster', lat: 24.20, lon: 82.68, type: 'power' },
  { name: 'Talcher Power & Coal Complex', lat: 20.95, lon: 85.23, type: 'power' },
  { name: 'Ramagundam Power Station', lat: 18.76, lon: 79.47, type: 'power' },
  { name: 'Neyveli Lignite Complex', lat: 11.61, lon: 79.48, type: 'power' },
  { name: 'Vapi Industrial Estate', lat: 20.37, lon: 72.91, type: 'industrial' },
  { name: 'Ankleshwar Chemical Zone', lat: 21.63, lon: 73.00, type: 'industrial' },
  { name: 'Manali Petrochemical Belt', lat: 13.17, lon: 80.27, type: 'refinery' },
  { name: 'Haldia Industrial & Port Zone', lat: 22.03, lon: 88.11, type: 'refinery' },
  { name: 'Paradip Refinery & Port', lat: 20.32, lon: 86.61, type: 'refinery' },
  { name: 'Kochi Refinery Complex', lat: 9.97, lon: 76.29, type: 'refinery' },
  { name: 'Numaligarh Refinery', lat: 26.60, lon: 93.72, type: 'refinery' },
  { name: 'Guwahati Industrial Belt', lat: 26.14, lon: 91.74, type: 'industrial' },
  { name: 'Bina Refinery', lat: 24.18, lon: 78.20, type: 'refinery' },
  { name: 'Sagar Industrial Corridor', lat: 23.84, lon: 78.74, type: 'industrial' },
  { name: 'Kanpur Industrial Belt', lat: 26.45, lon: 80.33, type: 'industrial' },
  { name: 'Bina-Katni Rail Industrial Corridor', lat: 23.90, lon: 79.93, type: 'industrial' },
  { name: 'Malanpur Industrial Area', lat: 26.20, lon: 78.30, type: 'industrial' },
  { name: 'Dewas Industrial Estate', lat: 22.97, lon: 76.06, type: 'industrial' },
  { name: 'Pithampur Industrial Cluster', lat: 22.61, lon: 75.65, type: 'industrial' },
  { name: 'Bina Thermal Power Station', lat: 24.14, lon: 78.24, type: 'power' },
  { name: 'Khajuraho–Chhatarpur Mining Belt', lat: 24.85, lon: 79.93, type: 'mine' },
  { name: 'Panna Diamond Mines', lat: 24.72, lon: 80.20, type: 'mine' },
  { name: 'Lalitpur Thermal Power Station', lat: 24.85, lon: 78.53, type: 'power' },
  { name: 'Orai Industrial Area', lat: 25.99, lon: 79.45, type: 'industrial' },
];

// Jhansi / Bundelkhand-corridor anchors — the region the spec calls out for a
// stronger concentration of demo assets around the priority monitoring area.
const JHANSI_CORRIDOR_ANCHORS: AssetSeed[] = [
  { name: 'Jhansi Industrial Area (Prem Nagar)', lat: 25.4380, lon: 78.5680, type: 'industrial' },
  { name: 'Jhansi Rail & Freight Yard', lat: 25.4520, lon: 78.5890, type: 'industrial' },
  { name: 'Gursarai Stone Crushing Belt', lat: 25.3540, lon: 78.9880, type: 'mine' },
  { name: 'Moth Quarry Cluster', lat: 25.7460, lon: 78.9330, type: 'mine' },
  { name: 'Babina Ordnance & Industrial Estate', lat: 25.2280, lon: 78.4610, type: 'factory' },
  { name: 'Jhansi Thermal Power Station', lat: 25.5300, lon: 78.6200, type: 'power' },
  { name: 'Chirgaon Industrial Belt', lat: 25.2110, lon: 78.8090, type: 'industrial' },
  { name: 'Garautha Cement & Stone Belt', lat: 25.5680, lon: 79.2870, type: 'factory' },
  { name: 'Mauranipur Industrial Cluster', lat: 25.2440, lon: 78.9970, type: 'industrial' },
  { name: 'Bangra Industrial Estate', lat: 25.4830, lon: 78.6120, type: 'industrial' },
];

export interface DemoIndustrialAsset extends OSMFeature {
  category: string;
}

const CATEGORY_LABELS: Record<OSMFeature['type'], string> = {
  refinery: 'REFINERY / PETROCHEMICAL',
  factory: 'FACTORY / STEEL-METAL',
  power: 'POWER PLANT',
  mine: 'MINE / QUARRY',
  industrial: 'INDUSTRIAL AREA',
};

function jitter(rand: () => number, spread: number) {
  return (rand() - 0.5) * spread;
}

/**
 * Deterministic, fixed-coordinate demo industrial asset layer for
 * PRESENTATION SNAPSHOT / SIMULATED DATA mode only. Never used in LIVE mode —
 * live mode always sources industrial context from the real OSM/Overpass API.
 */
export function createDemoIndustrialAssets(): DemoIndustrialAsset[] {
  const rand = makeRng(1337); // fixed seed — deterministic across every render
  const assets: DemoIndustrialAsset[] = [];

  INDIA_INDUSTRIAL_ANCHORS.forEach((anchor, i) => {
    assets.push({
      id: `DEMO-IND-${String(i + 1).padStart(3, '0')}`,
      latitude: anchor.lat + jitter(rand, 0.05),
      longitude: anchor.lon + jitter(rand, 0.05),
      type: anchor.type,
      name: anchor.name,
      tags: { source: 'PRESENTATION DEMO' },
      category: CATEGORY_LABELS[anchor.type],
    });
  });

  JHANSI_CORRIDOR_ANCHORS.forEach((anchor, i) => {
    assets.push({
      id: `DEMO-JH-IND-${String(i + 1).padStart(3, '0')}`,
      latitude: anchor.lat + jitter(rand, 0.015),
      longitude: anchor.lon + jitter(rand, 0.015),
      type: anchor.type,
      name: anchor.name,
      tags: { source: 'PRESENTATION DEMO' },
      category: CATEGORY_LABELS[anchor.type],
    });
  });

  return assets;
}

/** Subset of the full India dataset scoped to the Jhansi bounding box, for the JHANSI region view. */
export function getDemoIndustrialAssetsForRegion(region: 'JHANSI' | 'INDIA' | 'GLOBAL'): DemoIndustrialAsset[] {
  const all = createDemoIndustrialAssets();
  if (region === 'JHANSI') {
    return all.filter(a => a.latitude >= 25.20 && a.latitude <= 25.70 && a.longitude >= 78.30 && a.longitude <= 78.85);
  }
  return all;
}
