import React, { useEffect, useRef, useState, useMemo } from 'react';
import L from 'leaflet';
import { 
  Flame, 
  Satellite, 
  Layers, 
  Crosshair, 
  Radio, 
  Eye, 
  EyeOff, 
  Sliders, 
  Maximize2,
  Clock,
  Sparkles,
  Info
} from 'lucide-react';
import { ThermalEvent, PersistentSource, Region, REGION_BOUNDS } from '../../types.ts';
import { api } from '../../services/api.ts';

interface ThermalOperationsMapProps {
  events: ThermalEvent[];
  selectedEvent: ThermalEvent | null;
  onSelectEvent: (event: ThermalEvent) => void;
  persistentSources: PersistentSource[];
  region: Region;
  wmsHours?: number; // 24, 48, 72, 7 (days)
  wmsSensor?: 'ALL' | 'NOAA20' | 'NOAA21' | 'SNPP' | 'MODIS';
  onTimeSensorChange?: (hours: number, sensor: 'ALL' | 'NOAA20' | 'NOAA21' | 'SNPP' | 'MODIS') => void;
}


// FIRMS WMS valid layer names are grouped by instrument and time window.
// The API's vector feed can filter individual satellites; the WMS layer cannot.
function getFirmsWmsLayer(sensor: 'ALL' | 'NOAA20' | 'NOAA21' | 'SNPP' | 'MODIS', hours: number): string {
  const instrument = sensor === 'MODIS' ? 'modis' : 'viirs';
  const window = hours === 24 || hours === 48 ? String(hours) : '7';
  return `fires_${instrument}_${window}`;
}

// Thermal reticle icon for selected event
const createSelectedReticleIcon = (lat: number, lon: number, frp: number) => {
  const html = `
    <div class="thermal-reticle-container" style="
      position: relative;
      width: 48px;
      height: 48px;
      pointer-events: none;
    ">
      <!-- Pulsing Outer Ring -->
      <div style="
        position: absolute;
        inset: 0;
        border: 1.5px solid #22d3ee;
        border-radius: 50%;
        animation: radar-pulse 2s cubic-bezier(0, 0.2, 0.8, 1) infinite;
        opacity: 0.8;
      "></div>

      <!-- Reticle Box with 4 Corner Ticks -->
      <div style="
        position: absolute;
        inset: 8px;
        border: 1.5px dashed rgba(255, 255, 255, 0.9);
        border-radius: 4px;
        box-shadow: 0 0 12px rgba(34, 211, 238, 0.6);
      "></div>

      <!-- Center Crosshair Dot -->
      <div style="
        position: absolute;
        left: 50%;
        top: 50%;
        width: 8px;
        height: 8px;
        transform: translate(-50%, -50%);
        background: #ffffff;
        border-radius: 50%;
        box-shadow: 0 0 8px #f97316;
      "></div>
    </div>
  `;

  return L.divIcon({
    className: 'thermal-reticle-wrapper',
    html,
    iconSize: [48, 48],
    iconAnchor: [24, 24],
  });
};

// Persistent source concentric rings icon
const createPersistentSourceIcon = (count: number, avgFrp: number) => {
  const html = `
    <div style="
      width: 26px;
      height: 26px;
      border: 2px solid #f59e0b;
      border-radius: 50%;
      background: rgba(245, 158, 11, 0.2);
      display: flex;
      align-items: center;
      justify-content: center;
      box-shadow: 0 0 12px rgba(245, 158, 11, 0.7);
      cursor: pointer;
    ">
      <div style="
        width: 12px;
        height: 12px;
        border: 1.5px solid #ffffff;
        border-radius: 50%;
        background: #f59e0b;
      "></div>
    </div>
  `;

  return L.divIcon({
    className: 'persistent-source-wrapper',
    html,
    iconSize: [26, 26],
    iconAnchor: [13, 13],
  });
};

// Low-zoom cluster pill
const createThermalClusterIcon = (count: number, maxFrp: number) => {
  const color = maxFrp >= 80 ? '#ef4444' : maxFrp >= 30 ? '#f97316' : '#22d3ee';
  const html = `
    <div style="
      padding: 3px 8px;
      background: rgba(5, 12, 24, 0.94);
      border: 1.5px solid ${color};
      border-radius: 14px;
      display: inline-flex;
      align-items: center;
      gap: 4px;
      color: #ffffff;
      font-family: 'Chakra Petch', monospace;
      font-weight: 700;
      font-size: 11px;
      box-shadow: 0 4px 14px rgba(0,0,0,0.8), 0 0 12px ${color}66;
      cursor: pointer;
      white-space: nowrap;
    ">
      <span style="display:inline-block;width:6px;height:6px;border-radius:50%;background:${color};"></span>
      <span>${count}</span>
      <span style="font-size:9px;color:${color};">(${maxFrp.toFixed(0)}MW)</span>
    </div>
  `;

  return L.divIcon({
    className: 'thermal-cluster-wrapper',
    html,
    iconSize: [60, 24],
    iconAnchor: [30, 12],
  });
};

export const ThermalOperationsMap: React.FC<ThermalOperationsMapProps> = ({
  events,
  selectedEvent,
  onSelectEvent,
  persistentSources,
  region,
  wmsHours = 24,
  wmsSensor = 'ALL',
  onTimeSensorChange,
}) => {
  const mapContainerRef = useRef<HTMLDivElement>(null);
  const mapInstanceRef = useRef<L.Map | null>(null);

  // Layer references
  const satTileLayerRef = useRef<L.TileLayer | null>(null);
  const firmsWmsLayerRef = useRef<L.TileLayer.WMS | null>(null);
  const radianceGlowLayerRef = useRef<L.LayerGroup | null>(null);
  const vectorEventsLayerRef = useRef<L.LayerGroup | null>(null);
  const persistentLayerRef = useRef<L.LayerGroup | null>(null);
  const selectedMarkerRef = useRef<L.Marker | null>(null);
  const historicalArchiveLayerRef = useRef<L.LayerGroup | null>(null);

  // Controls state
  const [showWms, setShowWms] = useState(true);
  const [wmsOpacity, setWmsOpacity] = useState(0.85);
  const [showRadianceGlow, setShowRadianceGlow] = useState(true);
  const [showPersistent, setShowPersistent] = useState(true);
  const [showArchive, setShowArchive] = useState(false);
  const [historicalPoints, setHistoricalPoints] = useState<any[]>([]);
  const [mapZoom, setMapZoom] = useState<number>(6);

  // Local sync with props
  const [activeHours, setActiveHours] = useState<number>(wmsHours);
  const [activeSensor, setActiveSensor] = useState<'ALL' | 'NOAA20' | 'NOAA21' | 'SNPP' | 'MODIS'>(wmsSensor);

  useEffect(() => {
    setActiveHours(wmsHours);
  }, [wmsHours]);

  useEffect(() => {
    setActiveSensor(wmsSensor);
  }, [wmsSensor]);

  // Load historical points when toggled
  useEffect(() => {
    if (!showArchive) {
      setHistoricalPoints([]);
      return;
    }
    let cancelled = false;
    const limit = region === 'JHANSI' ? 3500 : 8000;
    api.getHistoricalFirmsPoints(region, limit)
      .then((data) => {
        if (!cancelled) setHistoricalPoints(Array.isArray(data.points) ? data.points : []);
      })
      .catch(() => {
        if (!cancelled) setHistoricalPoints([]);
      });
    return () => { cancelled = true; };
  }, [region, showArchive]);

  // Map Initialization
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

    // Initial View
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

    // Dark Satellite Basemap (Esri World Imagery styled with dark thermal theme)
    const satTile = L.tileLayer(
      'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}',
      {
        maxZoom: 18,
        attribution: 'Esri World Imagery | NASA FIRMS',
        className: 'thermal-satellite-tiles',
      }
    ).addTo(map);
    satTileLayerRef.current = satTile;

    // PRIMARY LAYER: NASA FIRMS WMS
    // Layer name calculated dynamically
    // NASA FIRMS WMS exposes combined VIIRS/MODIS layers, not per-satellite
    // NOAA-20/NOAA-21/SNPP layer names. Use the supported layer identifiers.
    const initialLayer = getFirmsWmsLayer(activeSensor, activeHours);

    const firmsWms = L.tileLayer.wms('/api/firms/wms', {
      layers: initialLayer,
      format: 'image/png',
      transparent: true,
      opacity: wmsOpacity,
      version: '1.1.1',
      maxZoom: 18,
      attribution: 'NASA FIRMS NRT WMS',
    });

    if (showWms) {
      firmsWms.addTo(map);
    }
    firmsWmsLayerRef.current = firmsWms;

    // Vector layer groups
    radianceGlowLayerRef.current = L.layerGroup().addTo(map);
    vectorEventsLayerRef.current = L.layerGroup().addTo(map);
    persistentLayerRef.current = L.layerGroup().addTo(map);
    historicalArchiveLayerRef.current = L.layerGroup().addTo(map);

    mapInstanceRef.current = map;

    return () => {
      map.remove();
      mapInstanceRef.current = null;
    };
  }, []);

  // ResizeObserver to ensure map viewport stays crisp
  useEffect(() => {
    if (!mapContainerRef.current) return;
    const ro = new ResizeObserver(() => {
      mapInstanceRef.current?.invalidateSize();
    });
    ro.observe(mapContainerRef.current);
    return () => ro.disconnect();
  }, []);

  // Handle Region Bounds Update
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

  // Update FIRMS WMS layer when hours, sensor, opacity, or visibility changes!
  useEffect(() => {
    const wms = firmsWmsLayerRef.current;
    const map = mapInstanceRef.current;
    if (!wms || !map) return;

    if (!showWms) {
      if (map.hasLayer(wms)) map.removeLayer(wms);
      return;
    }

    if (!map.hasLayer(wms)) {
      wms.addTo(map);
    }

    const targetLayer = getFirmsWmsLayer(activeSensor, activeHours);
    wms.setParams({ layers: targetLayer } as any);
    wms.setOpacity(wmsOpacity);
  }, [activeHours, activeSensor, showWms, wmsOpacity]);

  // Color mapper based on FRP (Zoom Earth / Thermal Camera inspired)
  const getThermalColor = (frp: number) => {
    if (frp >= 100) return '#ffffff'; // white-hot core
    if (frp >= 80) return '#ef4444';  // intense red/magenta
    if (frp >= 40) return '#f97316';  // bright orange
    if (frp >= 15) return '#eab308';  // yellow/amber
    return '#22d3ee';                 // cyan/blue
  };

  // Render Radiance Glow & Vector Markers
  useEffect(() => {
    const glowLayer = radianceGlowLayerRef.current;
    const vectorLayer = vectorEventsLayerRef.current;
    const map = mapInstanceRef.current;
    if (!glowLayer || !vectorLayer || !map) return;

    glowLayer.clearLayers();
    vectorLayer.clearLayers();

    const zoom = map.getZoom();
    const isClustered = zoom < 7 && events.length > 25;

    if (isClustered) {
      // Cluster nearby observations for smooth performance
      const gridSize = zoom <= 4 ? 2.5 : 0.8;
      const clusters: Record<string, { lat: number; lon: number; count: number; maxFrp: number; events: ThermalEvent[] }> = {};

      for (const ev of events) {
        const gx = Math.floor(ev.longitude / gridSize);
        const gy = Math.floor(ev.latitude / gridSize);
        const key = `${gx}_${gy}`;
        if (!clusters[key]) {
          clusters[key] = { lat: 0, lon: 0, count: 0, maxFrp: 0, events: [] };
        }
        clusters[key].events.push(ev);
        clusters[key].count++;
        if (ev.frp > clusters[key].maxFrp) clusters[key].maxFrp = ev.frp;
      }

      Object.values(clusters).forEach((c) => {
        const avgLat = c.events.reduce((s, e) => s + e.latitude, 0) / c.count;
        const avgLon = c.events.reduce((s, e) => s + e.longitude, 0) / c.count;
        const icon = createThermalClusterIcon(c.count, c.maxFrp);
        const marker = L.marker([avgLat, avgLon], { icon });

        marker.on('click', () => {
          map.setView([avgLat, avgLon], zoom + 2);
        });

        marker.bindTooltip(`Thermal Cluster: ${c.count} detections (Peak FRP: ${c.maxFrp.toFixed(1)} MW)`, {
          direction: 'top',
          className: 'agni-map-tooltip',
        });

        vectorLayer.addLayer(marker);
      });
    } else {
      // Individual Crisp Thermal Glyph Markers & Glow
      for (const ev of events) {
        if (!ev.latitude || !ev.longitude) continue;

        const frp = ev.frp || 0;
        const color = getThermalColor(frp);
        const riskLevel = ev.risk_analysis?.risk_level || 'LOW';
        const isCritical = riskLevel === 'CRITICAL' || frp >= 80;
        const isHigh = riskLevel === 'HIGH' || frp >= 35;
        const isSelected = selectedEvent?.id === ev.id;

        // Radiance Glow Field (Zoom Earth inspired smooth heat radiance)
        if (showRadianceGlow) {
          const glowRadius = Math.min(28, Math.max(12, 10 + Math.sqrt(frp) * 1.5));
          const glow = L.circleMarker([ev.latitude, ev.longitude], {
            radius: glowRadius,
            stroke: false,
            fillColor: color,
            fillOpacity: isCritical ? 0.22 : 0.12,
          });
          glowLayer.addLayer(glow);
        }

        // Radar ring for critical events
        if (isCritical) {
          const ping = L.circleMarker([ev.latitude, ev.longitude], {
            radius: 16,
            color: '#ef4444',
            weight: 1.5,
            opacity: 0.8,
            fillColor: '#ef4444',
            fillOpacity: 0.2,
            className: 'radar-ping',
          });
          vectorLayer.addLayer(ping);
        } else if (isHigh) {
          const ring = L.circleMarker([ev.latitude, ev.longitude], {
            radius: 11,
            color: '#f97316',
            weight: 1.2,
            opacity: 0.7,
            fillColor: '#f97316',
            fillOpacity: 0.1,
          });
          vectorLayer.addLayer(ring);
        }

        // Crisp Vector Observation Marker
        const marker = L.circleMarker([ev.latitude, ev.longitude], {
          radius: isSelected ? 8 : 5,
          color: '#050b14',
          weight: 1.2,
          opacity: 0.95,
          fillColor: color,
          fillOpacity: 0.95,
        });

        marker.on('click', () => {
          onSelectEvent(ev);
        });

        marker.bindTooltip(
          `NASA FIRMS · ${ev.satellite} · FRP ${frp.toFixed(1)} MW · ${ev.acq_date} ${ev.acq_time} UTC`,
          { direction: 'top', className: 'agni-map-tooltip' }
        );

        vectorLayer.addLayer(marker);
      }
    }
  }, [events, selectedEvent, showRadianceGlow, mapZoom]);

  // Update Selected Event Reticle Crosshair
  useEffect(() => {
    const map = mapInstanceRef.current;
    if (!map) return;

    if (selectedMarkerRef.current) {
      map.removeLayer(selectedMarkerRef.current);
      selectedMarkerRef.current = null;
    }

    if (!selectedEvent) return;

    const { latitude, longitude, frp } = selectedEvent;
    if (!latitude || !longitude) return;

    const icon = createSelectedReticleIcon(latitude, longitude, frp);
    const marker = L.marker([latitude, longitude], { icon, zIndexOffset: 1000 }).addTo(map);
    selectedMarkerRef.current = marker;
  }, [selectedEvent]);

  // Render Persistent Sources Layer
  useEffect(() => {
    const layer = persistentLayerRef.current;
    if (!layer) return;

    layer.clearLayers();
    if (!showPersistent || persistentSources.length === 0) return;

    for (const p of persistentSources) {
      if (!p.latitude || !p.longitude) continue;
      const icon = createPersistentSourceIcon(p.detection_count, p.avg_frp);
      const marker = L.marker([p.latitude, p.longitude], { icon });

      marker.bindTooltip(
        `Persistent Source: ${p.detection_count} detections · First: ${p.first_seen?.slice(0,10)} · Last: ${p.last_seen?.slice(0,10)} · Avg FRP: ${p.avg_frp.toFixed(1)} MW`,
        { direction: 'top', className: 'agni-map-tooltip' }
      );

      layer.addLayer(marker);
    }
  }, [persistentSources, showPersistent]);

  // Render Historical Archive Points Layer
  useEffect(() => {
    const layer = historicalArchiveLayerRef.current;
    if (!layer) return;

    layer.clearLayers();
    if (!showArchive || historicalPoints.length === 0) return;

    for (const pt of historicalPoints) {
      const lat = pt.latitude ?? pt.lat;
      const lon = pt.longitude ?? pt.lon;
      if (!lat || !lon) continue;
      const frp = Number(pt.frp || 0);
      const color = frp >= 50 ? '#f43f5e' : frp >= 20 ? '#fb923c' : '#38bdf8';

      const dot = L.circleMarker([lat, lon], {
        radius: 2.8,
        color: '#030712',
        weight: 0.5,
        fillColor: color,
        fillOpacity: 0.65,
      });

      dot.bindTooltip(`ARCHIVE OBSERVATION: ${pt.acq_date || pt.date || 'Historical'} · FRP ${frp.toFixed(1)} MW`, {
        direction: 'top',
        className: 'agni-map-tooltip',
      });

      layer.addLayer(dot);
    }
  }, [historicalPoints, showArchive]);

  // Handle User Change of Sensor or Time from floating control
  const handleQueryChange = (hours: number, sensor: 'ALL' | 'NOAA20' | 'NOAA21' | 'SNPP' | 'MODIS') => {
    setActiveHours(hours);
    setActiveSensor(sensor);
    onTimeSensorChange?.(hours, sensor);
  };

  return (
    <div className="relative w-full h-full min-h-0 flex flex-col bg-[#030712] select-none overflow-hidden font-mono agni-thermal-map">
      {/* Top Banner: Real FIRMS Status & Interactive Sensor/Time Selector */}
      <div className="z-10 bg-[#050b14]/95 border-b border-cyan-950/80 px-3 py-2 flex flex-wrap items-center justify-between gap-2 text-xs">
        {/* Left Status: Flagship Thermal Engine */}
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-1.5 font-hud font-bold text-orange-400">
            <Flame className="w-4 h-4 text-orange-400 animate-pulse" />
            <span className="tracking-wider">NASA FIRMS THERMAL INTELLIGENCE</span>
          </div>

          <span className="text-slate-600">|</span>

          {/* Dynamic Sensor Selector */}
          <div className="flex items-center gap-1">
            <span className="text-[10px] text-slate-400">SENSOR:</span>
            <div className="flex items-center bg-[#071324] border border-cyan-900/60 rounded p-0.5">
              {(['ALL', 'NOAA20', 'NOAA21', 'SNPP', 'MODIS'] as const).map((s) => (
                <button
                  key={s}
                  onClick={() => handleQueryChange(activeHours, s)}
                  className={`px-2 py-0.5 rounded text-[10px] font-semibold transition-colors ${
                    activeSensor === s
                      ? 'bg-orange-500/20 text-orange-300 border border-orange-500/60'
                      : 'text-slate-400 hover:text-slate-200'
                  }`}
                >
                  {s === 'ALL' ? 'ALL' : s === 'NOAA20' ? 'NOAA-20' : s === 'NOAA21' ? 'NOAA-21' : s === 'SNPP' ? 'S-NPP' : 'MODIS'}
                </button>
              ))}
            </div>
          </div>

          <span className="text-slate-600">|</span>

          {/* Dynamic Time Range Selector: 24H, 48H, 72H, 7D */}
          <div className="flex items-center gap-1">
            <span className="text-[10px] text-slate-400">WINDOW:</span>
            <div className="flex items-center bg-[#071324] border border-cyan-900/60 rounded p-0.5">
              {[
                { label: '24H', hours: 24 },
                { label: '48H', hours: 48 },
                { label: '72H', hours: 72 },
                { label: '7D', hours: 7 },
              ].map(({ label, hours }) => (
                <button
                  key={label}
                  onClick={() => handleQueryChange(hours, activeSensor)}
                  className={`px-2 py-0.5 rounded text-[10px] font-semibold transition-colors ${
                    activeHours === hours
                      ? 'bg-cyan-500/20 text-cyan-300 border border-cyan-500/60'
                      : 'text-slate-400 hover:text-slate-200'
                  }`}
                >
                  {label}
                </button>
              ))}
            </div>
          </div>
        </div>

        {/* Right Controls: WMS Toggle, Radiance Glow, Persistence & Opacity */}
        <div className="flex items-center gap-2">
          {/* FIRMS WMS Toggle */}
          <button
            onClick={() => setShowWms(!showWms)}
            className={`px-2 py-1 rounded text-[10px] flex items-center gap-1 border transition-colors ${
              showWms
                ? 'bg-orange-950/80 border-orange-700 text-orange-300'
                : 'bg-[#081223] border-slate-800 text-slate-500'
            }`}
            title="Toggle real NASA FIRMS WMS thermal layer"
          >
            <Satellite className="w-3 h-3" />
            <span>FIRMS WMS ({showWms ? 'ON' : 'OFF'})</span>
          </button>

          {/* Radiance Glow Field Toggle */}
          <button
            onClick={() => setShowRadianceGlow(!showRadianceGlow)}
            className={`px-2 py-1 rounded text-[10px] flex items-center gap-1 border transition-colors ${
              showRadianceGlow
                ? 'bg-cyan-950/80 border-cyan-700 text-cyan-300'
                : 'bg-[#081223] border-slate-800 text-slate-500'
            }`}
            title="Toggle Zoom Earth style thermal radiance field"
          >
            <Sparkles className="w-3 h-3" />
            <span>THERMAL RADIANCE</span>
          </button>

          {/* Persistent Sources Toggle */}
          <button
            onClick={() => setShowPersistent(!showPersistent)}
            className={`px-2 py-1 rounded text-[10px] flex items-center gap-1 border transition-colors ${
              showPersistent
                ? 'bg-amber-950/80 border-amber-700 text-amber-300'
                : 'bg-[#081223] border-slate-800 text-slate-500'
            }`}
            title="Toggle persistent sources ring"
          >
            <span>PERSISTENCE ({persistentSources.length})</span>
          </button>

          {/* Historical FIRMS Archive */}
          <button
            onClick={() => setShowArchive(!showArchive)}
            className={`px-2 py-1 rounded text-[10px] flex items-center gap-1 border transition-colors ${
              showArchive
                ? 'bg-red-950/80 border-red-700 text-red-300'
                : 'bg-[#081223] border-slate-800 text-slate-500'
            }`}
            title="Toggle user-supplied 2022-2024 historical FIRMS archive"
          >
            <span>ARCHIVE ({historicalPoints.length || 'OFF'})</span>
          </button>
        </div>
      </div>

      {/* Main Map Stage */}
      <div className="relative flex-1 w-full h-full min-h-0">
        <div ref={mapContainerRef} className="w-full h-full z-0" />

        {/* Selected Event Crosshair Lock HUD (Top-Left overlay) */}
        {selectedEvent && (
          <div className="absolute left-3 top-3 z-10 bg-[#040914]/90 border border-cyan-500/70 backdrop-blur-md rounded p-2.5 text-xs shadow-2xl font-mono text-slate-200 animate-in fade-in">
            <div className="flex items-center gap-2 border-b border-cyan-950 pb-1 mb-1.5 font-hud font-bold text-cyan-300">
              <Crosshair className="w-3.5 h-3.5 text-cyan-400 animate-spin" />
              <span>SELECTED TARGET RETICLE LOCK</span>
            </div>
            <div className="grid grid-cols-2 gap-x-4 gap-y-1 text-[11px]">
              <div><span className="text-slate-500">COORDINATES:</span> <strong className="text-white">{selectedEvent.latitude.toFixed(3)}°N, {selectedEvent.longitude.toFixed(3)}°E</strong></div>
              <div><span className="text-slate-500">FRP:</span> <strong className="text-orange-400">{selectedEvent.frp.toFixed(1)} MW</strong></div>
              <div><span className="text-slate-500">SATELLITE:</span> <strong className="text-slate-300">{selectedEvent.satellite} ({selectedEvent.instrument})</strong></div>
              <div><span className="text-slate-500">ACQ TIME:</span> <strong className="text-cyan-300">{selectedEvent.acq_date} {selectedEvent.acq_time} UTC</strong></div>
              {selectedEvent.bright_ti4 && (
                <div><span className="text-slate-500">BRIGHT TEMP:</span> <strong className="text-amber-400">{selectedEvent.bright_ti4.toFixed(1)} K</strong></div>
              )}
              {selectedEvent.osm_context?.verified && (
                <div><span className="text-slate-500">OSM ASSET:</span> <strong className="text-blue-300 truncate">{selectedEvent.osm_context.feature_name}</strong></div>
              )}
            </div>
          </div>
        )}

        {/* Floating Zoom Earth-Inspired Thermal Intensity Legend (Bottom-Right) */}
        <div className="absolute right-3 bottom-3 z-10 bg-[#040914]/90 border border-cyan-900/80 backdrop-blur-md rounded-md p-3 text-xs shadow-2xl font-mono max-w-sm">
          {/* Header */}
          <div className="flex items-center justify-between text-[10px] text-slate-400 border-b border-cyan-950 pb-1 mb-2">
            <span className="font-hud font-bold text-cyan-300 tracking-wider flex items-center gap-1">
              <Flame className="w-3 h-3 text-orange-400" />
              THERMAL INTENSITY SCALE (FRP MW)
            </span>
            <span className="text-[9px] px-1 bg-orange-950 text-orange-300 border border-orange-800 rounded">
              NASA FIRMS WMS
            </span>
          </div>

          {/* Continuous Multi-Stop Thermal Gradient Bar (Zoom Earth visual style) */}
          <div className="space-y-1">
            <div 
              className="w-full h-3 rounded-sm border border-slate-700/60 shadow-inner" 
              style={{
                background: 'linear-gradient(to right, #22d3ee 0%, #eab308 25%, #f97316 55%, #ef4444 80%, #ffffff 100%)'
              }}
            />
            {/* Threshold Labels */}
            <div className="flex items-center justify-between text-[9px] text-slate-400 font-semibold px-0.5">
              <span>&lt;10 MW<br/><span className="text-[8px] text-cyan-400">~310 K</span></span>
              <span className="text-center">10–30 MW<br/><span className="text-[8px] text-yellow-400">~330 K</span></span>
              <span className="text-center">30–80 MW<br/><span className="text-[8px] text-orange-400">~360 K</span></span>
              <span className="text-right">&gt;80 MW<br/><span className="text-[8px] text-red-400">&gt;400 K</span></span>
            </div>
          </div>

          {/* Layer Opacity Slider */}
          <div className="mt-2.5 pt-2 border-t border-cyan-950 flex items-center justify-between gap-2 text-[10px] text-slate-400">
            <span className="flex items-center gap-1">
              <Sliders className="w-3 h-3 text-cyan-400" />
              WMS OPACITY:
            </span>
            <input
              type="range"
              min="0.2"
              max="1.0"
              step="0.05"
              value={wmsOpacity}
              onChange={(e) => setWmsOpacity(parseFloat(e.target.value))}
              className="w-24 accent-orange-500 cursor-pointer h-1.5 bg-slate-800 rounded"
            />
            <span className="text-white font-bold">{Math.round(wmsOpacity * 100)}%</span>
          </div>
        </div>
      </div>
    </div>
  );
};
