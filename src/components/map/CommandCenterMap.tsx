import React, { useEffect, useRef, useState, useMemo } from 'react';
import L from 'leaflet';
import { 
  Layers, 
  MapPin, 
  Filter, 
  Maximize2, 
  Eye, 
  EyeOff, 
  Flame, 
  Factory, 
  Zap, 
  Pickaxe, 
  ShieldAlert,
  Building2,
  Warehouse,
  ExternalLink,
  ChevronRight
} from 'lucide-react';
import { ThermalEvent, PersistentSource, Region, REGION_BOUNDS, OSMFeature } from '../../types.ts';
import { api } from '../../services/api.ts';

interface CommandCenterMapProps {
  events: ThermalEvent[];
  selectedEvent: ThermalEvent | null;
  onSelectEvent: (event: ThermalEvent) => void;
  persistentSources: PersistentSource[];
  region: Region;
  onNavigateToThermalOps?: () => void;
}

// Professional GIS SVG Icons (NO ugly letter markers R/M/F/P)
const getIndustrialSvgIcon = (type: OSMFeature['type'], name: string) => {
  let color = '#ff5a3d'; // cyan factory default
  let borderColor = '#b91c1c';
  let svgPath = '';

  switch (type) {
    case 'refinery':
      color = '#f97316'; // orange
      borderColor = '#ea580c';
      // Oil refinery distillation tower + flare stack
      svgPath = `<path d="M4 21h16M7 21V9a2 2 0 0 1 2-2h2a2 2 0 0 1 2 2v12M17 21v-7a2 2 0 0 0-2-2h-2M10 7V4M10 4a1 1 0 0 1 1-1h0a1 1 0 0 1 1 1v3M7 12h6M7 16h6" stroke="${color}" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" fill="none"/>`;
      break;
    case 'mine':
      color = '#c026d3'; // purple
      borderColor = '#86198f';
      // Crossed pickaxes / mining excavation symbol
      svgPath = `<path d="m14 4 6 6M11.5 6.5l4 4M3 21l8.5-8.5M16 2l6 6-2 2-6-6 2-2zM4 14l6-6" stroke="${color}" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" fill="none"/>`;
      break;
    case 'power':
      color = '#ffb000'; // yellow / amber
      borderColor = '#b45309';
      // High-voltage lightning bolt power generation
      svgPath = `<path d="M13 2 3 14h9l-1 8 10-12h-9l1-8z" stroke="${color}" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" fill="${color}33"/>`;
      break;
    case 'industrial':
      color = '#ef4444'; // blue
      borderColor = '#991b1b';
      // Industrial sector park / warehouse grid
      svgPath = `<rect x="3" y="3" width="7" height="7" rx="1" stroke="${color}" stroke-width="1.8" fill="${color}22"/><rect x="14" y="3" width="7" height="7" rx="1" stroke="${color}" stroke-width="1.8" fill="${color}22"/><rect x="14" y="14" width="7" height="7" rx="1" stroke="${color}" stroke-width="1.8" fill="${color}22"/><rect x="3" y="14" width="7" height="7" rx="1" stroke="${color}" stroke-width="1.8" fill="${color}22"/>`;
      break;
    case 'factory':
    default:
      color = '#ff7043'; // cyan
      borderColor = '#c2410c';
      // Industrial plant with chimney stacks
      svgPath = `<path d="M2 20h20M4 20V8l5 4V8l5 4V4l6 4v12" stroke="${color}" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" fill="none"/>`;
      break;
  }

  const html = `
    <div class="gis-industrial-marker" style="
      width: 28px;
      height: 28px;
      background: rgba(6, 13, 25, 0.94);
      border: 1.5px solid ${borderColor};
      border-radius: 6px;
      display: flex;
      align-items: center;
      justify-content: center;
      box-shadow: 0 2px 10px rgba(0,0,0,0.8), 0 0 12px ${color}44;
      cursor: pointer;
      transition: transform 0.15s ease, box-shadow 0.15s ease;
    ">
      <svg width="17" height="17" viewBox="0 0 24 24" fill="none">
        ${svgPath}
      </svg>
    </div>
  `;

  return L.divIcon({
    className: 'gis-marker-wrapper',
    html,
    iconSize: [28, 28],
    iconAnchor: [14, 14],
  });
};

// Professional Cluster Bubble Icon
const createClusterIcon = (count: number, typesSummary: Record<string, number>) => {
  const isLarge = count >= 50;
  const size = isLarge ? 38 : count >= 10 ? 32 : 28;
  const color = typesSummary.refinery ? '#f97316' : typesSummary.mine ? '#c084fc' : typesSummary.power ? '#eab308' : '#38bdf8';

  const html = `
    <div style="
      width: ${size}px;
      height: ${size}px;
      background: rgba(6, 16, 31, 0.95);
      border: 2px solid ${color};
      border-radius: 50%;
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      box-shadow: 0 4px 14px rgba(0,0,0,0.85), 0 0 14px ${color}66;
      cursor: pointer;
      color: #f8fafc;
      font-family: 'Chakra Petch', monospace;
      font-weight: 700;
      font-size: ${size >= 34 ? 12 : 10}px;
    ">
      <span>${count}</span>
    </div>
  `;

  return L.divIcon({
    className: 'gis-cluster-icon',
    html,
    iconSize: [size, size],
    iconAnchor: [size / 2, size / 2],
  });
};

export const CommandCenterMap: React.FC<CommandCenterMapProps> = ({
  events,
  selectedEvent,
  onSelectEvent,
  persistentSources,
  region,
  onNavigateToThermalOps,
}) => {
  const mapContainerRef = useRef<HTMLDivElement>(null);
  const mapInstanceRef = useRef<L.Map | null>(null);

  // Layer groups
  const baseTileLayerRef = useRef<L.TileLayer | null>(null);
  const industrialLayerRef = useRef<L.LayerGroup | null>(null);
  const thermalLayerRef = useRef<L.LayerGroup | null>(null);
  const historyLayerRef = useRef<L.LayerGroup | null>(null);

  // States
  const [basemap, setBasemap] = useState<'satellite' | 'dark' | 'osm'>('satellite');
  const [showIndustrial, setShowIndustrial] = useState(true);
  const [showThermal, setShowThermal] = useState(true);
  const [showHistoricalArchive, setShowHistoricalArchive] = useState(false);
  const [typeFilters, setTypeFilters] = useState<Record<string, boolean>>({
    refinery: true,
    mine: true,
    factory: true,
    power: true,
    industrial: true,
  });

  const [osmFeatures, setOsmFeatures] = useState<OSMFeature[]>([]);
  const [historicalPoints, setHistoricalPoints] = useState<any[]>([]);
  const [selectedFeature, setSelectedFeature] = useState<OSMFeature | null>(null);
  const [mapZoom, setMapZoom] = useState<number>(6);

  // Fetch real OSM industrial features for current region
  useEffect(() => {
    let cancelled = false;
    const limit = region === 'JHANSI' ? 350 : 800;
    api.getOsmFeatures(region, limit)
      .then((data) => {
        if (!cancelled) setOsmFeatures(Array.isArray(data.features) ? data.features : []);
      })
      .catch(() => {
        if (!cancelled) setOsmFeatures([]);
      });
    return () => { cancelled = true; };
  }, [region]);

  // Fetch real historical FIRMS observations when enabled
  useEffect(() => {
    if (!showHistoricalArchive) {
      setHistoricalPoints([]);
      return;
    }
    let cancelled = false;
    const limit = region === 'JHANSI' ? 3000 : 6000;
    api.getHistoricalFirmsPoints(region, limit)
      .then((data) => {
        if (!cancelled) setHistoricalPoints(Array.isArray(data.points) ? data.points : []);
      })
      .catch(() => {
        if (!cancelled) setHistoricalPoints([]);
      });
    return () => { cancelled = true; };
  }, [region, showHistoricalArchive]);

  // Initialize Map
  useEffect(() => {
    if (!mapContainerRef.current || mapInstanceRef.current) return;

    const map = L.map(mapContainerRef.current, {
      zoomControl: false,
      attributionControl: true,
      maxBoundsViscosity: 0.8,
      minZoom: 2,
      maxZoom: 18,
    });

    L.control.zoom({ position: 'topleft' }).addTo(map);

    // Initial viewpoint
    const bounds = REGION_BOUNDS[region];
    if (region === 'JHANSI' && bounds) {
      map.fitBounds([[bounds.south, bounds.west], [bounds.north, bounds.east]], { padding: [25, 25] });
    } else if (region === 'INDIA') {
      map.setView([22.5937, 78.9629], 5);
    } else {
      map.setView([20, 0], 2.5);
    }

    map.on('zoomend', () => {
      setMapZoom(map.getZoom());
    });

    industrialLayerRef.current = L.layerGroup().addTo(map);
    thermalLayerRef.current = L.layerGroup().addTo(map);
    historyLayerRef.current = L.layerGroup().addTo(map);

    mapInstanceRef.current = map;

    return () => {
      map.remove();
      mapInstanceRef.current = null;
    };
  }, []);

  // Handle ResizeObserver
  useEffect(() => {
    if (!mapContainerRef.current) return;
    const ro = new ResizeObserver(() => {
      mapInstanceRef.current?.invalidateSize();
    });
    ro.observe(mapContainerRef.current);
    return () => ro.disconnect();
  }, []);

  // Update Region Bounds
  useEffect(() => {
    const map = mapInstanceRef.current;
    if (!map) return;
    const bounds = REGION_BOUNDS[region];
    if (region === 'JHANSI' && bounds) {
      map.flyToBounds([[bounds.south, bounds.west], [bounds.north, bounds.east]], { padding: [30, 30], duration: 1.2 });
    } else if (region === 'INDIA') {
      map.flyTo([22.5937, 78.9629], 5, { duration: 1.2 });
    } else {
      map.flyTo([20, 0], 2.5, { duration: 1.2 });
    }
  }, [region]);

  // Handle Basemap Switch
  useEffect(() => {
    const map = mapInstanceRef.current;
    if (!map) return;

    if (baseTileLayerRef.current) {
      map.removeLayer(baseTileLayerRef.current);
    }

    let url = 'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}';
    let attribution = 'Esri World Imagery';

    if (basemap === 'dark') {
      url = 'https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png';
      attribution = '© OpenStreetMap, © CARTO Dark';
    } else if (basemap === 'osm') {
      url = 'https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png';
      attribution = '© OpenStreetMap contributors';
    }

    const tile = L.tileLayer(url, { maxZoom: 18, attribution }).addTo(map);
    baseTileLayerRef.current = tile;
  }, [basemap]);

  // Filtered industrial features
  const filteredIndustrial = useMemo(() => {
    return osmFeatures.filter((f) => typeFilters[f.type] ?? true);
  }, [osmFeatures, typeFilters]);

  // Render Industrial Markers with Spatial Grid Clustering
  useEffect(() => {
    const layer = industrialLayerRef.current;
    const map = mapInstanceRef.current;
    if (!layer || !map) return;

    layer.clearLayers();
    if (!showIndustrial) return;

    const zoom = map.getZoom();
    const clusterThresholdZoom = region === 'JHANSI' ? 12 : 8;

    if (zoom < clusterThresholdZoom && filteredIndustrial.length > 8) {
      // Spatial grid clustering: group by ~0.08° grid at lower zoom
      const gridSize = zoom <= 5 ? 1.5 : zoom <= 8 ? 0.35 : 0.08;
      const clusters: Record<string, { lat: number; lon: number; items: OSMFeature[]; types: Record<string, number> }> = {};

      for (const item of filteredIndustrial) {
        const gridX = Math.floor(item.longitude / gridSize);
        const gridY = Math.floor(item.latitude / gridSize);
        const key = `${gridX}_${gridY}`;
        if (!clusters[key]) {
          clusters[key] = { lat: 0, lon: 0, items: [], types: {} };
        }
        clusters[key].items.push(item);
        clusters[key].types[item.type] = (clusters[key].types[item.type] || 0) + 1;
      }

      Object.values(clusters).forEach((c) => {
        const avgLat = c.items.reduce((s, i) => s + i.latitude, 0) / c.items.length;
        const avgLon = c.items.reduce((s, i) => s + i.longitude, 0) / c.items.length;
        const icon = createClusterIcon(c.items.length, c.types);
        const marker = L.marker([avgLat, avgLon], { icon });

        marker.on('click', () => {
          map.setView([avgLat, avgLon], zoom + 2);
        });

        const breakdown = Object.entries(c.types).map(([k, v]) => `${v} ${k}s`).join(', ');
        marker.bindTooltip(`Industrial Cluster: ${c.items.length} verified assets (${breakdown})`, {
          direction: 'top',
          className: 'agni-map-tooltip',
        });

        layer.addLayer(marker);
      });
    } else {
      // Individual Crisp Professional Markers
      for (const feat of filteredIndustrial) {
        if (!feat.latitude || !feat.longitude) continue;
        const icon = getIndustrialSvgIcon(feat.type, feat.name);
        const marker = L.marker([feat.latitude, feat.longitude], { icon });

        marker.on('click', () => {
          setSelectedFeature(feat);
        });

        marker.bindTooltip(`OSM Verified: ${feat.name} (${feat.type.toUpperCase()})`, {
          direction: 'top',
          className: 'agni-map-tooltip',
        });

        layer.addLayer(marker);
      }
    }
  }, [filteredIndustrial, showIndustrial, mapZoom, region]);

  // Render Real Thermal Events (FIRMS)
  useEffect(() => {
    const layer = thermalLayerRef.current;
    if (!layer) return;

    layer.clearLayers();
    if (!showThermal) return;

    for (const ev of events) {
      if (!ev.latitude || !ev.longitude) continue;

      const riskScore = ev.risk_analysis?.risk_score || 0;
      const isCritical = riskScore >= 81;
      const isHigh = riskScore >= 61 && !isCritical;
      const isSelected = selectedEvent?.id === ev.id;

      const color = isCritical ? '#ef4444' : isHigh ? '#f97316' : riskScore >= 31 ? '#eab308' : '#06b6d4';

      // Pulse ring for high/critical events
      if (isCritical || isHigh) {
        const halo = L.circleMarker([ev.latitude, ev.longitude], {
          radius: isCritical ? 14 : 10,
          color,
          weight: 1.5,
          opacity: 0.7,
          fillColor: color,
          fillOpacity: 0.15,
          className: isCritical ? 'radar-ping' : '',
        });
        layer.addLayer(halo);
      }

      // Center dot
      const marker = L.circleMarker([ev.latitude, ev.longitude], {
        radius: isSelected ? 8 : 5.5,
        color: isSelected ? '#ffffff' : color,
        weight: isSelected ? 2.5 : 1.5,
        opacity: 0.95,
        fillColor: color,
        fillOpacity: 0.9,
      });

      marker.on('click', () => {
        onSelectEvent(ev);
      });

      marker.bindTooltip(
        `FIRMS: ${ev.frp.toFixed(1)} MW FRP · ${ev.satellite} · Risk: ${ev.risk_analysis?.risk_level || 'LOW'} (${riskScore}%)`,
        { direction: 'top', className: 'agni-map-tooltip' }
      );

      layer.addLayer(marker);
    }
  }, [events, selectedEvent, showThermal]);

  // Render Historical Archive Points
  useEffect(() => {
    const layer = historyLayerRef.current;
    if (!layer) return;

    layer.clearLayers();
    if (!showHistoricalArchive || historicalPoints.length === 0) return;

    for (const p of historicalPoints) {
      const lat = p.latitude ?? p.lat;
      const lon = p.longitude ?? p.lon;
      if (!lat || !lon) continue;
      const frp = Number(p.frp || 0);
      const color = frp > 50 ? '#ff5252' : frp > 20 ? '#ff9800' : '#4fc3f7';

      const marker = L.circleMarker([lat, lon], {
        radius: 3,
        color: '#030712',
        weight: 0.5,
        fillColor: color,
        fillOpacity: 0.5,
      });

      marker.bindTooltip(
        `Archive: ${p.acq_date || p.date || '2022-2024'} · FRP ${frp.toFixed(1)} MW`,
        { direction: 'top', className: 'agni-map-tooltip' }
      );

      layer.addLayer(marker);
    }
  }, [historicalPoints, showHistoricalArchive]);

  return (
    <div className="relative w-full h-full min-h-0 flex flex-col bg-[#050b14] select-none overflow-hidden font-mono">
      {/* Top Map Control Bar */}
      <div className="z-10 bg-[#07111f]/95 border-b border-cyan-950/80 px-3 py-2 flex flex-wrap items-center justify-between gap-2 text-xs">
        {/* Left: Basemap switcher & Situation Context */}
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-1.5 font-hud font-bold text-cyan-300">
            <Building2 className="w-3.5 h-3.5 text-cyan-400" />
            <span>REGIONAL SITUATION MAP</span>
          </div>

          <span className="text-slate-600">|</span>

          {/* Basemaps */}
          <div className="flex items-center bg-[#050b14] border border-cyan-900/60 rounded p-0.5">
            {(['satellite', 'dark', 'osm'] as const).map((b) => (
              <button
                key={b}
                onClick={() => setBasemap(b)}
                className={`px-2 py-0.5 rounded text-[10px] font-semibold transition-colors ${
                  basemap === b
                    ? 'bg-cyan-500/20 text-cyan-300 border border-cyan-500/60'
                    : 'text-slate-400 hover:text-slate-200'
                }`}
              >
                {b === 'satellite' ? 'SATELLITE' : b === 'dark' ? 'DARK GIS' : 'OSM'}
              </button>
            ))}
          </div>
        </div>

        {/* Right: Layer Toggles */}
        <div className="flex items-center gap-2">
          {/* Industrial Assets Toggle */}
          <button
            onClick={() => setShowIndustrial(!showIndustrial)}
            className={`px-2 py-1 rounded text-[10px] flex items-center gap-1 border transition-colors ${
              showIndustrial
                ? 'bg-cyan-950/80 border-cyan-700 text-cyan-300'
                : 'bg-[#081223] border-slate-800 text-slate-500'
            }`}
          >
            <Factory className="w-3 h-3" />
            <span>OSM ASSETS ({filteredIndustrial.length})</span>
          </button>

          {/* Thermal Detections Toggle */}
          <button
            onClick={() => setShowThermal(!showThermal)}
            className={`px-2 py-1 rounded text-[10px] flex items-center gap-1 border transition-colors ${
              showThermal
                ? 'bg-orange-950/80 border-orange-700 text-orange-300'
                : 'bg-[#081223] border-slate-800 text-slate-500'
            }`}
          >
            <Flame className="w-3 h-3" />
            <span>FIRMS THERMAL ({events.length})</span>
          </button>

          {/* Historical FIRMS Toggle */}
          <button
            onClick={() => setShowHistoricalArchive(!showHistoricalArchive)}
            className={`px-2 py-1 rounded text-[10px] flex items-center gap-1 border transition-colors ${
              showHistoricalArchive
                ? 'bg-amber-950/80 border-amber-700 text-amber-300'
                : 'bg-[#081223] border-slate-800 text-slate-500'
            }`}
            title="Toggle historical NASA FIRMS archive observations"
          >
            <span>ARCHIVE ({historicalPoints.length || 'OFF'})</span>
          </button>
        </div>
      </div>

      {/* Main Map Container */}
      <div className="relative flex-1 w-full h-full min-h-0">
        <div ref={mapContainerRef} className="w-full h-full z-0" />

        {/* Floating Asset Filter Chips (bottom-left) */}
        <div className="absolute left-3 bottom-3 z-10 bg-[#060e1d]/90 border border-cyan-900/70 backdrop-blur-md rounded p-2 text-[10px] space-y-1.5 shadow-2xl max-w-sm">
          <div className="flex items-center justify-between text-[9px] text-slate-400 font-bold border-b border-cyan-950 pb-1">
            <span>INDUSTRIAL ASSET CATEGORIES</span>
            <span>{filteredIndustrial.length} FOUND</span>
          </div>

          <div className="flex flex-wrap gap-1.5 pt-0.5">
            {[
              { type: 'refinery', label: 'Refineries', color: '#f97316' },
              { type: 'mine', label: 'Mines/Quarries', color: '#c084fc' },
              { type: 'factory', label: 'Factories', color: '#06b6d4' },
              { type: 'power', label: 'Power Plants', color: '#eab308' },
              { type: 'industrial', label: 'Industrial Areas', color: '#3b82f6' },
            ].map(({ type, label, color }) => (
              <button
                key={type}
                onClick={() => setTypeFilters(prev => ({ ...prev, [type]: !prev[type] }))}
                className={`px-1.5 py-0.5 rounded text-[9px] flex items-center gap-1 border transition-all ${
                  typeFilters[type]
                    ? 'border-cyan-800 bg-[#0b1b30] text-slate-200'
                    : 'border-slate-800/60 bg-[#040810] text-slate-600 opacity-60'
                }`}
              >
                <span className="w-2 h-2 rounded-full" style={{ backgroundColor: color }} />
                <span>{label}</span>
              </button>
            ))}
          </div>
        </div>

        {/* Selected Industrial Feature Card (Floating bottom-right) */}
        {selectedFeature && (
          <div className="absolute right-3 bottom-3 z-20 bg-[#071324]/95 border border-cyan-700/80 rounded p-3 backdrop-blur-md shadow-2xl max-w-sm font-mono text-xs text-slate-200 animate-in fade-in slide-in-from-bottom-2">
            <div className="flex items-center justify-between border-b border-cyan-950 pb-1.5 mb-2">
              <div className="flex items-center gap-1.5 font-hud font-bold text-cyan-300">
                <Factory className="w-3.5 h-3.5 text-cyan-400" />
                <span className="truncate max-w-[200px]">{selectedFeature.name}</span>
              </div>
              <button
                onClick={() => setSelectedFeature(null)}
                className="text-slate-400 hover:text-white px-1 text-xs"
              >
                ×
              </button>
            </div>

            <div className="space-y-1 text-[11px]">
              <div className="flex justify-between">
                <span className="text-slate-500">TYPE:</span>
                <span className="text-cyan-300 uppercase font-semibold">{selectedFeature.type}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-500">LOCATION:</span>
                <span className="text-white">{selectedFeature.latitude.toFixed(4)}°N, {selectedFeature.longitude.toFixed(4)}°E</span>
              </div>
              {selectedFeature.tags?.operator && (
                <div className="flex justify-between">
                  <span className="text-slate-500">OPERATOR:</span>
                  <span className="text-slate-300 truncate max-w-[170px]">{selectedFeature.tags.operator}</span>
                </div>
              )}
            </div>

            {onNavigateToThermalOps && (
              <button
                onClick={onNavigateToThermalOps}
                className="mt-3 w-full py-1.5 bg-[#0b2238] border border-cyan-500/50 hover:bg-[#103254] text-cyan-300 rounded text-[10px] font-hud font-bold tracking-wider flex items-center justify-center gap-1 transition-colors"
              >
                <span>OPEN IN THERMAL OPERATIONS</span>
                <ChevronRight className="w-3.5 h-3.5" />
              </button>
            )}
          </div>
        )}
      </div>
    </div>
  );
};
