import React, { useEffect, useState, useMemo } from 'react';
import { 
  Flame, 
  Layers, 
  Factory, 
  ShieldAlert, 
  Search, 
  Filter, 
  Crosshair, 
  ExternalLink, 
  HelpCircle,
  Clock,
  ArrowUpDown,
  CheckCircle2,
  AlertTriangle
} from 'lucide-react';
import { ThermalEvent, PersistentSource, Region, HistoricalFirmsSummary, OSMFeature } from '../types.ts';
import { ResponseOrchestrator } from '../components/hud/ResponseOrchestrator.tsx';
import { formatISTDateTime } from '../utils/time.ts';
import { getHistoricalFallbackKey } from '../utils/historicalKey.ts';
import { api } from '../services/api.ts';

interface IntelligenceProps {
  events: ThermalEvent[];
  persistentSources: PersistentSource[];
  region: Region;
  onSelectEvent: (event: ThermalEvent) => void;
  onNavigateToThermalOps: () => void;
  selectedEvent: ThermalEvent | null;
  historicalSummary: HistoricalFirmsSummary | null;
  onAlertCreated: () => void;
  onRefreshCurrentData: () => void;
}

export const Intelligence: React.FC<IntelligenceProps> = ({
  events,
  persistentSources,
  region,
  onSelectEvent,
  onNavigateToThermalOps,
  selectedEvent,
  historicalSummary,
  onAlertCreated,
  onRefreshCurrentData,
}) => {
  const [activeTab, setActiveTab] = useState<'matrix' | 'clusters' | 'industrial'>('matrix');
  const [searchTerm, setSearchTerm] = useState<string>('');
  const [classFilter, setClassFilter] = useState<string>('ALL');
  const [selectedCluster, setSelectedCluster] = useState<PersistentSource | null>(null);
  const [historicalPreview, setHistoricalPreview] = useState<any[]>([]);
  const [osmFeatures, setOsmFeatures] = useState<OSMFeature[]>([]);

  useEffect(() => {
    let cancelled = false;
    api.getHistoricalFirmsPoints(region, 10)
      .then((data) => { if (!cancelled) setHistoricalPreview(Array.isArray(data.points) ? data.points : []); })
      .catch(() => { if (!cancelled) setHistoricalPreview([]); });
    return () => { cancelled = true; };
  }, [region]);

  useEffect(() => {
    let cancelled = false;
    api.getOsmFeatures(region, region === 'JHANSI' ? 120 : 160)
      .then((data) => { if (!cancelled) setOsmFeatures(Array.isArray(data.features) ? data.features : []); })
      .catch(() => { if (!cancelled) setOsmFeatures([]); });
    return () => { cancelled = true; };
  }, [region]);

  // Classifications present in current dataset
  const classificationOptions = useMemo(() => {
    const set = new Set<string>();
    events.forEach((e) => {
      if (e.risk_analysis?.classification) {
        set.add(e.risk_analysis.classification);
      }
    });
    return Array.from(set);
  }, [events]);

  // Filtered Events
  const filteredEvents = useMemo(() => {
    return events.filter((e) => {
      if (searchTerm.trim()) {
        const term = searchTerm.toLowerCase();
        const m1 = e.id.toLowerCase().includes(term);
        const m2 = e.risk_analysis?.classification.toLowerCase().includes(term);
        const m3 = String(e.osm_context?.feature_name ?? '').toLowerCase().includes(term);
        const m4 = `${e.latitude.toFixed(2)},${e.longitude.toFixed(2)}`.includes(term);
        if (!m1 && !m2 && !m3 && !m4) return false;
      }
      if (classFilter !== 'ALL') {
        if (e.risk_analysis?.classification !== classFilter) return false;
      }
      return true;
    });
  }, [events, searchTerm, classFilter]);

  // Verified Industrial Events
  const industrialEvents = useMemo(() => {
    return events.filter((e) => e.osm_context?.verified);
  }, [events]);

  const handleInspectEvent = (ev: ThermalEvent) => {
    onSelectEvent(ev);
    onNavigateToThermalOps();
  };

  return (
    <div className="flex-1 overflow-y-auto p-4 space-y-4 bg-[#050B14] font-mono text-xs select-none">
      {/* Top Banner */}
      <div className="p-3 bg-[#081223] border border-cyan-900/60 rounded flex flex-col md:flex-row items-start md:items-center justify-between gap-3">
        <div>
          <div className="flex items-center gap-2">
            <Layers className="w-4 h-4 text-cyan-400" />
            <h2 className="text-base font-hud font-bold text-white tracking-wider">
              GEOSPATIAL INTELLIGENCE & CLUSTER ENGINE
            </h2>
            <span className="text-[10px] px-2 py-0.5 bg-cyan-950 text-cyan-300 border border-cyan-800 rounded">
              REGION: {region}
            </span>
          </div>
          <p className="text-[11px] text-slate-400 mt-0.5">
            Rule-assisted explainable thermal source classification combining satellite radiometric signatures, persistence clustering, and OSM industrial landuse.
          </p>
        </div>

        {/* View Switcher Tabs */}
        <div className="flex items-center bg-[#060D19] border border-cyan-900/80 rounded p-0.5">
          <button
            onClick={() => setActiveTab('matrix')}
            className={`px-3 py-1.5 rounded text-xs font-hud tracking-wide transition-colors ${
              activeTab === 'matrix' ? 'bg-cyan-500/20 text-cyan-300 border border-cyan-500/50' : 'text-slate-400 hover:text-white'
            }`}
          >
            INTELLIGENCE MATRIX ({filteredEvents.length})
          </button>
          <button
            onClick={() => setActiveTab('clusters')}
            className={`px-3 py-1.5 rounded text-xs font-hud tracking-wide transition-colors ${
              activeTab === 'clusters' ? 'bg-amber-500/20 text-amber-300 border border-amber-500/50' : 'text-slate-400 hover:text-white'
            }`}
          >
            PERSISTENT CLUSTERS ({persistentSources.length})
          </button>
          <button
            onClick={() => setActiveTab('industrial')}
            className={`px-3 py-1.5 rounded text-xs font-hud tracking-wide transition-colors ${
              activeTab === 'industrial' ? 'bg-blue-500/20 text-blue-300 border border-blue-500/50' : 'text-slate-400 hover:text-white'
            }`}
          >
            OSM INDUSTRIAL CANDIDATES ({industrialEvents.length})
          </button>
        </div>
      </div>

      {historicalSummary?.available && (
        <div className="grid grid-cols-2 md:grid-cols-5 gap-2">
          <div className="p-2.5 bg-[#071421] border border-orange-900/60 rounded">
            <div className="text-[9px] text-slate-500">ARCHIVE OBSERVATIONS</div>
            <div className="text-lg font-bold text-orange-300">{historicalSummary.total_records.toLocaleString()}</div>
            <div className="text-[9px] text-slate-500">{historicalSummary.region === 'JHANSI' ? 'JHANSI' : 'INDIA'} · 2022–2024</div>
          </div>
          <div className="p-2.5 bg-[#071421] border border-cyan-900/60 rounded">
            <div className="text-[9px] text-slate-500">HIGH CONFIDENCE*</div>
            <div className="text-lg font-bold text-cyan-300">{(historicalSummary.high_confidence_70plus_normalized ?? 0).toLocaleString()}</div>
          </div>
          <div className="p-2.5 bg-[#071421] border border-red-900/60 rounded">
            <div className="text-[9px] text-slate-500">PEAK FRP</div>
            <div className="text-lg font-bold text-red-300">{(historicalSummary.frp_max_mw ?? 0).toFixed(1)} MW</div>
          </div>
          <div className="p-2.5 bg-[#071421] border border-amber-900/60 rounded">
            <div className="text-[9px] text-slate-500">REPEAT-CELL CANDIDATES</div>
            <div className="text-lg font-bold text-amber-300">{historicalSummary.region === 'JHANSI' ? (historicalSummary.persistence_cells_ge3_obs_2dates ?? 0).toLocaleString() : '—'}</div>
          </div>
          <div className="p-2.5 bg-[#071421] border border-cyan-900/60 rounded">
            <div className="text-[9px] text-slate-500">DATA PROVENANCE</div>
            <div className="text-[10px] font-bold text-white mt-1">NASA FIRMS ARCHIVE</div>
            <div className="text-[9px] text-slate-500">Historical, not NRT</div>
          </div>
        </div>
      )}

      <ResponseOrchestrator
        event={selectedEvent || filteredEvents[0] || events[0] || null}
        demo={new URLSearchParams(window.location.search).get('demo') === '1'}
        onAlertCreated={onAlertCreated}
        onEventUpdated={onSelectEvent}
      />
      {!selectedEvent && events.length === 0 && historicalPreview.length > 0 && (
        <div className="p-3 bg-[#071421] border border-cyan-900/60 rounded flex items-center justify-between gap-3">
          <div>
            <div className="text-[10px] text-cyan-300 font-bold">RESPONSE WORKFLOW WAITING FOR A CURRENT FIRMS EVENT</div>
            <div className="text-[9px] text-slate-500 mt-1">Historical FIRMS evidence is available, but response actions remain locked until a current observation is selected.</div>
          </div>
          <button onClick={onNavigateToThermalOps} className="px-2.5 py-1.5 bg-cyan-950 border border-cyan-800 text-cyan-300 rounded text-[10px] shrink-0">OPEN THERMAL OPS</button>
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
        <div className="p-3 bg-[#07111e] border border-cyan-900/60 rounded">
          <div className="text-[10px] text-cyan-300 font-hud font-bold tracking-wider mb-2">AGNI RAKSHAK DECISION PIPELINE</div>
          <div className="flex flex-wrap items-center gap-1.5 text-[10px]">
            {['NASA FIRMS DETECTION','OSM CONTEXT','PERSISTENCE','HISTORICAL ANOMALY','AI CLASSIFICATION','RISK','ALERT'].map((step, i) => (
              <React.Fragment key={step}>
                <span className="px-2 py-1 bg-[#060D19] border border-cyan-950 rounded text-slate-200">{step}</span>
                {i < 6 && <span className="text-cyan-700">→</span>}
              </React.Fragment>
            ))}
          </div>
          <div className="text-[9px] text-slate-500 mt-2">Only stages supported by available real data should produce a conclusion; missing evidence remains explicitly marked.</div>
        </div>
        <div className="p-3 bg-[#07111e] border border-orange-900/60 rounded">
          <div className="text-[10px] text-orange-300 font-hud font-bold tracking-wider mb-2">ARCHIVE EVIDENCE STATUS</div>
          {historicalSummary?.available ? (
            <div className="grid grid-cols-2 gap-2 text-[10px]">
              <div><span className="text-slate-500">Observations:</span> <b className="text-white">{historicalSummary.total_records.toLocaleString()}</b></div>
              <div><span className="text-slate-500">Years:</span> <b className="text-white">2022–2024</b></div>
              <div><span className="text-slate-500">Peak FRP:</span> <b className="text-orange-300">{(historicalSummary.frp_max_mw ?? 0).toFixed(1)} MW</b></div>
              <div><span className="text-slate-500">High confidence*:</span> <b className="text-cyan-300">{(historicalSummary.high_confidence_70plus_normalized ?? 0).toLocaleString()}</b></div>
            </div>
          ) : (
            <div className="text-[10px] text-slate-500">Historical FIRMS archive unavailable.</div>
          )}
        </div>
      </div>

      {/* HISTORICAL EVIDENCE QUEUE — real supplied NASA FIRMS archive, not active incidents */}
      <div className="bg-[#071421] border border-orange-900/60 rounded p-3">
        <div className="flex items-center justify-between border-b border-orange-950 pb-2 mb-2">
          <div className="text-[10px] text-orange-300 font-hud font-bold tracking-wider">NASA FIRMS HISTORICAL EVIDENCE QUEUE</div>
          <span className="text-[9px] text-slate-500">Archive 2022–2024 · observation-only</span>
        </div>
        {historicalPreview.length === 0 ? (
          <div className="text-[10px] text-slate-500 py-3">Historical FIRMS evidence unavailable for this region.</div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-2">
            {historicalPreview.slice(0, 6).map((p: any) => {
              const key = p.id ?? getHistoricalFallbackKey('intel-hist-queue', p);
              const lat = p.lat ?? p.latitude;
              const lon = p.lon ?? p.longitude;
              return (
                <div key={key} className="p-2 bg-[#060D19] border border-cyan-950 rounded">
                  <div className="flex items-center justify-between">
                    <span className="text-[9px] text-cyan-300 font-bold">{p.source || p.instrument || 'NASA FIRMS'}</span>
                    <span className="text-[9px] text-orange-300">{p.frp == null ? '—' : Number(p.frp).toFixed(1) + ' MW'}</span>
                  </div>
                  <div className="text-[9px] text-slate-300 mt-1">{lat != null ? Number(lat).toFixed(3) : '—'}°N, {lon != null ? Number(lon).toFixed(3) : '—'}°E</div>
                  <div className="text-[8px] text-slate-500 mt-0.5">{p.date ?? p.acq_date} · {p.time ?? p.acq_time ?? '—'} UTC</div>
                  <div className="text-[8px] text-slate-500 mt-1">Historical evidence — not a current alert.</div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* TAB 1: INTELLIGENCE MATRIX */}
      {activeTab === 'matrix' && (
        <div className="bg-[#081223] border border-cyan-900/60 rounded p-3 space-y-3">
          {/* Filters & Search */}
          <div className="flex flex-wrap items-center justify-between gap-2 pb-3 border-b border-cyan-950">
            <div className="flex items-center gap-2 flex-1 max-w-md">
              <div className="relative w-full">
                <Search className="w-3.5 h-3.5 absolute left-2.5 top-2 text-slate-500" />
                <input
                  type="text"
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  placeholder="Filter by ID, coordinates, classification, industrial site..."
                  className="w-full pl-8 pr-3 py-1.5 bg-[#060D19] border border-cyan-900/80 rounded text-slate-200 text-xs focus:outline-none focus:border-cyan-400 placeholder:text-slate-500"
                />
              </div>
            </div>

            <div className="flex items-center gap-2">
              <Filter className="w-3.5 h-3.5 text-cyan-400" />
              <span className="text-slate-400 text-[11px]">Classification:</span>
              <select
                value={classFilter}
                onChange={(e) => setClassFilter(e.target.value)}
                className="bg-[#060D19] border border-cyan-900/80 text-slate-200 text-xs rounded px-2 py-1 focus:outline-none"
              >
                <option value="ALL">All Classifications ({events.length})</option>
                {classificationOptions.map((c) => (
                  <option key={c} value={c}>
                    {c}
                  </option>
                ))}
              </select>
            </div>
          </div>

          {/* Table */}
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="border-b border-cyan-950 text-slate-400 text-[10px] uppercase font-hud">
                  <th className="py-2 px-2">Target ID</th>
                  <th className="py-2 px-2">Location</th>
                  <th className="py-2 px-2">NASA FRP</th>
                  <th className="py-2 px-2">Classification</th>
                  <th className="py-2 px-2">Risk Level</th>
                  <th className="py-2 px-2">OSM Industrial Context</th>
                  <th className="py-2 px-2">Cluster Status</th>
                  <th className="py-2 px-2 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-cyan-950/60 text-[11px]">
                {filteredEvents.length === 0 ? (
                  <tr>
                    <td colSpan={8} className="py-3 px-3">
                      <div className="p-3 bg-[#071421] border border-orange-900/60 rounded text-left">
                        <div className="flex items-center justify-between gap-3">
                          <div className="text-[10px] text-orange-300 font-bold">NO CURRENT NRT MATRIX ROWS</div>
                          <div className="text-[9px] text-slate-500">Historical evidence stays observation-only.</div>
                        </div>
                        <div className="grid grid-cols-2 md:grid-cols-4 gap-2 mt-2">
                          <div><span className="text-[8px] text-slate-600 block">ARCHIVE OBS</span><b className="text-white">{historicalSummary?.available ? historicalSummary.total_records.toLocaleString() : '—'}</b></div>
                          <div><span className="text-[8px] text-slate-600 block">HIGH CONF</span><b className="text-cyan-300">{historicalSummary?.available ? (historicalSummary.high_confidence_70plus_normalized ?? 0).toLocaleString() : '—'}</b></div>
                          <div><span className="text-[8px] text-slate-600 block">REPEAT CELLS</span><b className="text-amber-300">{historicalSummary?.available ? (historicalSummary.persistence_cells_ge3_obs_2dates ?? 0).toLocaleString() : '—'}</b></div>
                          <div><span className="text-[8px] text-slate-600 block">PEAK FRP</span><b className="text-orange-300">{historicalSummary?.available ? (historicalSummary.frp_max_mw ?? 0).toFixed(1) + ' MW' : '—'}</b></div>
                        </div>
                        {historicalPreview.length > 0 && (
                          <div className="mt-2 grid grid-cols-1 md:grid-cols-3 gap-2">
                            {historicalPreview.slice(0, 3).map((p: any) => {
                              const key = p.id ?? getHistoricalFallbackKey('intel-hist-matrix', p);
                              const lat = p.lat ?? p.latitude;
                              const lon = p.lon ?? p.longitude;
                              return (
                                <div key={key} className="p-2 bg-[#060D19] border border-cyan-950 rounded">
                                  <div className="flex justify-between text-[9px]"><span className="text-cyan-300">{p.source || p.instrument || 'NASA FIRMS'}</span><span className="text-orange-300">{p.frp == null ? '—' : Number(p.frp).toFixed(1) + ' MW'}</span></div>
                                  <div className="text-[9px] text-white mt-1">{lat != null ? Number(lat).toFixed(3) : '—'}, {lon != null ? Number(lon).toFixed(3) : '—'}</div>
                                  <div className="text-[8px] text-slate-500 mt-0.5">{p.date ?? p.acq_date} · historical observation</div>
                                </div>
                              );
                            })}
                          </div>
                        )}
                      </div>
                    </td>
                  </tr>
                ) : (
                  filteredEvents.map((ev) => {
                    const risk = ev.risk_analysis;
                    const score = risk?.risk_score || 0;
                    const osm = ev.osm_context;

                    const riskColor = 
                      score >= 81 ? 'text-red-400 font-bold' :
                      score >= 61 ? 'text-orange-400 font-bold' :
                      score >= 31 ? 'text-yellow-400' : 'text-cyan-400';

                    return (
                      <tr key={ev.id} className="hover:bg-[#0c1930] transition-colors">
                        <td className="py-2.5 px-2 text-white font-mono text-[10px]">{ev.id}</td>
                        <td className="py-2.5 px-2 text-slate-300">
                          {ev.latitude.toFixed(3)}°N, {ev.longitude.toFixed(3)}°E
                        </td>
                        <td className="py-2.5 px-2 text-orange-400 font-bold">
                          {ev.frp.toFixed(1)} MW
                        </td>
                        <td className="py-2.5 px-2 text-cyan-300">
                          {risk?.classification || 'Thermal Hotspot'}
                        </td>
                        <td className="py-2.5 px-2">
                          <span className={riskColor}>
                            {risk?.risk_level} ({score}%)
                          </span>
                        </td>
                        <td className="py-2.5 px-2">
                          {osm?.verified ? (
                            <span className="text-blue-300 flex items-center gap-1">
                              <Factory className="w-3 h-3 text-blue-400 shrink-0" />
                              {osm.feature_name} ({osm.distance_meters}m)
                            </span>
                          ) : (
                            <span className="text-slate-500 italic">No industrial match</span>
                          )}
                        </td>
                        <td className="py-2.5 px-2">
                          {ev.is_persistent ? (
                            <span className="px-1.5 py-0.5 bg-amber-950 text-amber-300 border border-amber-800 rounded text-[9px] font-bold">
                              PERSISTENT
                            </span>
                          ) : (
                            <span className="text-slate-500 text-[10px]">Single Pass</span>
                          )}
                        </td>
                        <td className="py-2.5 px-2 text-right">
                          <button
                            onClick={() => handleInspectEvent(ev)}
                            className="px-2 py-1 bg-cyan-950/80 border border-cyan-800 hover:border-cyan-400 text-cyan-300 rounded text-[10px] flex items-center gap-1 ml-auto"
                          >
                            <Crosshair className="w-3 h-3" />
                            Inspect HUD
                          </button>
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* TAB 2: PERSISTENT CLUSTERS */}
      {activeTab === 'clusters' && (
        <div className="space-y-3">
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
            {persistentSources.length === 0 ? (
              <div className="col-span-full p-4 bg-[#081223] border border-amber-900/60 rounded space-y-3">
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <div className="text-[10px] text-amber-300 font-bold">NO CURRENT PERSISTENT CLUSTERS</div>
                    <div className="text-[9px] text-slate-500 mt-0.5">Persistence requires repeated observations across time. The supplied archive can still provide evidence for review.</div>
                  </div>
                  <div className="text-right">
                    <div className="text-[8px] text-slate-600">ARCHIVE REPEAT CELLS</div>
                    <div className="text-sm text-amber-300 font-bold">{historicalSummary?.available ? (historicalSummary.persistence_cells_ge3_obs_2dates ?? 0).toLocaleString() : '—'}</div>
                  </div>
                </div>
                {historicalPreview.length > 0 && (
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-2">
                    {historicalPreview.slice(0, 3).map((p: any) => {
                      const key = p.id ?? getHistoricalFallbackKey('intel-hist-cluster', p);
                      const lat = p.lat ?? p.latitude;
                      const lon = p.lon ?? p.longitude;
                      return (
                        <div key={key} className="p-2 bg-[#060D19] border border-cyan-950 rounded">
                          <div className="flex justify-between text-[9px]"><span className="text-cyan-300">{p.source || p.instrument || 'NASA FIRMS'}</span><span className="text-orange-300">{p.frp == null ? '—' : Number(p.frp).toFixed(1) + ' MW'}</span></div>
                          <div className="text-[9px] text-white mt-1">{lat != null ? Number(lat).toFixed(3) : '—'}, {lon != null ? Number(lon).toFixed(3) : '—'}</div>
                          <div className="text-[8px] text-slate-500 mt-0.5">{p.date ?? p.acq_date} · archive observation</div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            ) : (
              persistentSources.map((cluster) => (
                <div
                  key={cluster.id}
                  className="p-3 bg-[#081223] border border-amber-900/60 rounded space-y-2 hover:border-amber-500/80 transition-colors"
                >
                  <div className="flex justify-between items-center pb-1 border-b border-cyan-950">
                    <span className="font-hud font-bold text-amber-400 text-xs flex items-center gap-1.5">
                      <Flame className="w-4 h-4 text-amber-500" />
                      {cluster.cluster_id}
                    </span>
                    <span className="px-2 py-0.5 bg-amber-950 text-amber-300 border border-amber-800 rounded text-[10px] font-bold">
                      {cluster.detection_count} OBSERVATIONS
                    </span>
                  </div>

                  <div className="space-y-1 text-[11px] text-slate-300">
                    <div className="flex justify-between">
                      <span className="text-slate-500">Centroid Coordinates:</span>
                      <span className="text-white font-mono">
                        {cluster.latitude.toFixed(3)}°N, {cluster.longitude.toFixed(3)}°E
                      </span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-slate-500">First Detected:</span>
                      <span className="text-slate-300">{formatISTDateTime(cluster.first_seen)}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-slate-500">Last Pass Seen:</span>
                      <span className="text-slate-300">{formatISTDateTime(cluster.last_seen)}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-slate-500">Cluster Duration:</span>
                      <span className="text-cyan-400 font-bold">{cluster.duration_hours.toFixed(1)} hours</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-slate-500">Average / Peak FRP:</span>
                      <span className="text-orange-400 font-bold">
                        {cluster.avg_frp.toFixed(1)} / {cluster.max_frp.toFixed(1)} MW
                      </span>
                    </div>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      )}

      {/* TAB 3: OSM INDUSTRIAL CANDIDATES */}
      {activeTab === 'industrial' && (
        <div className="bg-[#081223] border border-cyan-900/60 rounded p-3 space-y-3">
          <div className="text-slate-400 text-xs pb-2 border-b border-cyan-950">
            Current thermal events correlated with verified OpenStreetMap industrial infrastructure within 3,000m radius. Historical archive points remain observation-only until contextualized.
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            {industrialEvents.length === 0 ? (
              <div className="md:col-span-2 p-4 bg-[#071421] border border-blue-900/60 rounded">
                <div className="flex items-center justify-between">
                  <div>
                    <div className="text-[10px] text-blue-300 font-bold">NO CURRENT EVENTS WITH VERIFIED OSM PROXIMITY</div>
                    <div className="text-[9px] text-slate-500 mt-1">This is not an empty intelligence state. Review the verified OSM industrial inventory below; a candidate is created only when a current thermal observation is correlated with it.</div>
                  </div>
                  <span className="text-[9px] text-slate-600">OSM INVENTORY · {osmFeatures.length}</span>
                </div>
                {osmFeatures.length > 0 ? (
                  <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-2 mt-3">
                    {osmFeatures.slice(0, 8).map((f, idx) => (
                      <div key={f.id || `osm-${f.latitude}-${f.longitude}-${idx}`} className="p-2 bg-[#060D19] border border-cyan-950 rounded">
                        <div className="flex items-center justify-between"><span className="text-[9px] text-cyan-300 font-bold">{String(f.type).toUpperCase()}</span><span className="text-[8px] text-slate-600">OSM</span></div>
                        <div className="text-[9px] text-white mt-1 truncate">{f.name}</div>
                        <div className="text-[8px] text-slate-500 mt-0.5">{Number(f.latitude).toFixed(3)}, {Number(f.longitude).toFixed(3)}</div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="text-[9px] text-slate-600 mt-3">OSM industrial inventory unavailable for this region.</div>
                )}
              </div>
            ) : industrialEvents.map((ev) => {
              const osm = ev.osm_context!;
              const risk = ev.risk_analysis;
              return (
                <div key={ev.id} className="p-3 bg-[#060D19] border border-blue-900/60 rounded space-y-2">
                  <div className="flex justify-between items-center">
                    <span className="font-bold text-white text-xs flex items-center gap-1.5">
                      <Factory className="w-4 h-4 text-blue-400" />
                      {osm.feature_name}
                    </span>
                    <span className="text-[10px] text-orange-400 font-bold">
                      {ev.frp.toFixed(1)} MW
                    </span>
                  </div>

                  <div className="space-y-1 text-[11px] text-slate-300">
                    <div className="flex justify-between">
                      <span className="text-slate-500">Facility Type:</span>
                      <span className="text-cyan-300 capitalize">{osm.feature_type}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-slate-500">Distance to Hotspot:</span>
                      <span className="text-orange-300 font-bold">{osm.distance_meters} meters</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-slate-500">Inferred Classification:</span>
                      <span className="text-white font-semibold">{risk?.classification}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-slate-500">Satellite / Time:</span>
                      <span className="text-slate-400">{ev.satellite} ({ev.acq_date} {ev.acq_time} UTC)</span>
                    </div>
                  </div>

                  <div className="pt-2 border-t border-cyan-950 flex justify-end">
                    <button
                      onClick={() => handleInspectEvent(ev)}
                      className="px-2.5 py-1 bg-blue-950 border border-blue-700 hover:border-blue-400 text-blue-200 rounded text-[10px] flex items-center gap-1"
                    >
                      <Crosshair className="w-3 h-3" />
                      View in Thermal Ops
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
};
