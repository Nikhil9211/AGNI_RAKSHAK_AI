import React, { useEffect, useMemo, useState } from 'react';
import { Activity, AlertTriangle, ArrowUpRight, Factory, Flame, Layers, MapPinned, Radio, ShieldAlert, Sparkles } from 'lucide-react';
import { ThermalEvent, Alert, Region, FirmsStatus, HistoricalFirmsSummary, OSMFeature } from '../types.ts';
import { formatISTTime } from '../utils/time.ts';
import { getHistoricalFallbackKey } from '../utils/historicalKey.ts';
import { CommandCenterMap } from '../components/map/CommandCenterMap.tsx';
import { api } from '../services/api.ts';
import { getDemoIndustrialAssetsForRegion } from '../demoIndustrialAssets.ts';

interface CommandCenterProps {
  events: ThermalEvent[];
  alerts: Alert[];
  persistentSources: any[];
  region: Region;
  firmsStatus: FirmsStatus | null;
  onSelectEvent: (event: ThermalEvent) => void;
  onNavigateScreen: (screen: 'COMMAND_CENTER' | 'THERMAL_OPERATIONS' | 'INTELLIGENCE' | 'ALERTS') => void;
  historicalSummary: HistoricalFirmsSummary | null;
}

export const CommandCenter: React.FC<CommandCenterProps> = ({
  events, alerts, persistentSources, region, firmsStatus, onSelectEvent, onNavigateScreen, historicalSummary,
}) => {
  const [osmFeatures, setOsmFeatures] = useState<OSMFeature[]>([]);
  const [osmAvailable, setOsmAvailable] = useState(false);
  const [historicalPreview, setHistoricalPreview] = useState<any[]>([]);
  const [historicalPoints, setHistoricalPoints] = useState<any[]>([]);

  const presentationDemo = new URLSearchParams(window.location.search).get('demo') === '1';
  const displayEvents = events;

  useEffect(() => {
    let cancelled = false;
    Promise.all([
      api.getHistoricalFirmsPoints(region, region === 'JHANSI' ? 5000 : 12000),
      api.getHistoricalFirmsPoints(region, 8),
    ])
      .then(([all, preview]) => {
        if (cancelled) return;
        setHistoricalPoints(Array.isArray(all.points) ? all.points : []);
        setHistoricalPreview(Array.isArray(preview.points) ? preview.points : []);
      })
      .catch(() => { if (!cancelled) { setHistoricalPoints([]); setHistoricalPreview([]); } });
    return () => { cancelled = true; };
  }, [region]);

  useEffect(() => {
    // In PRESENTATION SNAPSHOT / DEMO mode, industrial context comes from a
    // deterministic, clearly-labelled demo dataset instead of the live
    // OSM/Overpass API, so the Command Center map is never sparse or empty
    // during a demo. LIVE mode is unaffected and always queries the real API.
    if (presentationDemo) {
      const demoAssets = getDemoIndustrialAssetsForRegion(region as 'JHANSI' | 'INDIA' | 'GLOBAL');
      setOsmFeatures(demoAssets);
      setOsmAvailable(true);
      return;
    }
    let cancelled = false;
    api.getOsmFeatures(region, region === 'JHANSI' ? 250 : 400)
      .then((data) => {
        if (cancelled) return;
        setOsmFeatures(Array.isArray(data.features) ? data.features : []);
        setOsmAvailable(Boolean(data.available));
      })
      .catch(() => {
        if (!cancelled) {
          setOsmFeatures([]);
          setOsmAvailable(false);
        }
      });
    return () => { cancelled = true; };
  }, [region, presentationDemo]);

  const industrialCandidateEvidence = useMemo(() => {
    if (!osmAvailable || osmFeatures.length === 0) return { count: 0, basis: 'unavailable' as const };
    const hav = (lat1:number, lon1:number, lat2:number, lon2:number) => {
      const R=6371000, p1=lat1*Math.PI/180, p2=lat2*Math.PI/180, d1=(lat2-lat1)*Math.PI/180, d2=(lon2-lon1)*Math.PI/180;
      const a=Math.sin(d1/2)**2+Math.cos(p1)*Math.cos(p2)*Math.sin(d2/2)**2;
      return 2*R*Math.atan2(Math.sqrt(a),Math.sqrt(1-a));
    };
    const sourceEvents = displayEvents.length > 0 ? displayEvents : historicalPoints;
    const count = sourceEvents.filter(ev => osmFeatures.some(f => hav(Number(ev.latitude), Number(ev.longitude), Number(f.latitude), Number(f.longitude)) <= 1500)).length;
    return { count, basis: displayEvents.length > 0 ? 'current' as const : 'historical' as const };
  }, [displayEvents, historicalPoints, osmAvailable, osmFeatures]);
  const industrialCandidates = industrialCandidateEvidence.count;

  const highRisk = displayEvents.filter(e => ['HIGH','CRITICAL'].includes(e.risk_analysis?.risk_level || '')).length;
  const highConfidence = displayEvents.filter(e => (e.confidence || 0) >= 70).length;
  const regionLabel = region === 'JHANSI' ? 'JHANSI' : region === 'INDIA' ? 'INDIA' : 'GLOBAL';

  const recent = [...displayEvents].sort((a,b) => {
    const rb = b.risk_analysis?.risk_score || 0;
    const ra = a.risk_analysis?.risk_score || 0;
    return (rb - ra) || ((b.frp || 0) - (a.frp || 0));
  }).slice(0, 6);

  return (
    <div className="command-center-shell">
      <div className="cc-titlebar">
        <div>
          <div className="eyebrow"><Radio className="w-3 h-3" /> COMMAND CENTER · {regionLabel}</div>
          <div className="cc-title">Operational Fire & Thermal Overview</div>
          <div className="cc-subtitle">One-screen view of the current thermal picture, industrial context and response priority.</div>
        </div>
        <div className="cc-actions">
          {presentationDemo && <span className="demo-chip">PRESENTATION SNAPSHOT · NOT LIVE</span>}
          <button onClick={() => onNavigateScreen('THERMAL_OPERATIONS')} className="cc-primary-btn"><Flame className="w-3.5 h-3.5" /> OPEN THERMAL OPERATIONS <ArrowUpRight className="w-3 h-3" /></button>
        </div>
      </div>

      <div className="cc-kpis">
        <div className="cc-kpi"><div className="kpi-label">THERMAL DETECTIONS</div><div className="kpi-value thermal">{displayEvents.length.toLocaleString()}</div><div className="kpi-note">{presentationDemo ? 'Presentation snapshot' : (firmsStatus?.available ? 'Current FIRMS query' : 'NASA FIRMS unavailable')}</div></div>
        <div className="cc-kpi"><div className="kpi-label">INDUSTRIAL CANDIDATES</div><div className="kpi-value cyan">{events.length ? (industrialCandidates || '—') : '—'}</div><div className="kpi-note">{events.length ? 'Current FIRMS near verified OSM assets ≤ 1.5 km' : 'Requires a current FIRMS observation'}</div></div>
        <div className="cc-kpi"><div className="kpi-label">HIGH / CRITICAL</div><div className="kpi-value red">{highRisk}</div><div className="kpi-note">Response priority</div></div>
        <div className="cc-kpi"><div className="kpi-label">PERSISTENT SOURCES</div><div className="kpi-value amber">{persistentSources.length || '—'}</div><div className="kpi-note">Repeated observations</div></div>
        <div className="cc-kpi"><div className="kpi-label">HIGH-CONFIDENCE</div><div className="kpi-value green">{highConfidence || (historicalSummary?.available ? (historicalSummary.high_confidence_70plus_normalized ?? 0).toLocaleString() : '—')}</div><div className="kpi-note">{highConfidence > 0 ? 'Current observations ≥70' : 'Historical FIRMS archive ≥70'}</div></div>
      </div>

      <section className="cc-command-flow" aria-label="AGNI RAKSHAK decision workflow">
        <div className="cc-flow-head">
          <div>
            <div className="eyebrow"><Activity className="w-3 h-3" /> AGNI RAKSHAK DECISION LOOP</div>
            <div className="cc-flow-title">Detect → Predict → Assess Impact → Orchestrate Response</div>
          </div>
          <span className="cc-flow-badge">EVIDENCE-DRIVEN</span>
        </div>
        <div className="cc-flow-grid">
          <button className="cc-flow-card detect" onClick={() => onNavigateScreen('THERMAL_OPERATIONS')}>
            <span className="cc-flow-index">01</span><Flame className="cc-flow-icon" />
            <strong>DETECT</strong><span>NASA FIRMS observations</span>
            <small>{displayEvents.length ? `${displayEvents.length.toLocaleString()} current detections` : 'Current NRT unavailable / zero'}</small>
          </button>
          <div className="cc-flow-connector">→</div>
          <button className="cc-flow-card predict" onClick={() => onNavigateScreen('INTELLIGENCE')}>
            <span className="cc-flow-index">02</span><Activity className="cc-flow-icon" />
            <strong>PREDICT</strong><span>Activity trend & recurrence</span>
            <small>{displayEvents.length ? 'Evidence available for trend review' : 'Needs current/historical trend evidence'}</small>
          </button>
          <div className="cc-flow-connector">→</div>
          <button className="cc-flow-card impact" onClick={() => onNavigateScreen('INTELLIGENCE')}>
            <span className="cc-flow-index">03</span><ShieldAlert className="cc-flow-icon" />
            <strong>ASSESS IMPACT</strong><span>Industrial proximity & risk</span>
            <small>{industrialCandidates ? `${industrialCandidates} candidate relationships` : 'Only verified context is counted'}</small>
          </button>
          <div className="cc-flow-connector">→</div>
          <button className="cc-flow-card response" onClick={() => onNavigateScreen('INTELLIGENCE')}>
            <span className="cc-flow-index">04</span><Sparkles className="cc-flow-icon" />
            <strong>ORCHESTRATE RESPONSE</strong><span>Decision-support workflow</span>
            <small>Open Response Orchestrator</small>
          </button>
        </div>
      </section>

      {displayEvents.length === 0 && historicalSummary?.available && (
        <div className="cc-evidence-strip">
          <span><b>ARCHIVE</b> NASA FIRMS 2022–2024</span>
          <span><b>{historicalSummary.total_records.toLocaleString()}</b> observations</span>
          <span><b>{(historicalSummary.high_confidence_70plus_normalized ?? 0).toLocaleString()}</b> high-confidence*</span>
          <span><b>{(historicalSummary.persistence_cells_ge3_obs_2dates ?? 0).toLocaleString()}</b> historical repeat-cell candidates</span>
          <span><b>{(historicalSummary.frp_max_mw ?? 0).toFixed(1)} MW</b> peak FRP</span>
        </div>
      )}

      <div className="cc-main-grid">
        <section className="cc-map-panel">
          <div className="panel-head">
            <div><span className="panel-kicker"><MapPinned className="w-3.5 h-3.5" /> GEOSPATIAL SITUATION</span><span className="panel-title">{regionLabel} · Industrial Context Map</span></div>
            <div className="map-legend"><span><i className="legend-dot industrial"/> OSM INDUSTRIAL</span><span><i className="legend-dot thermal"/> FIRMS</span></div>
          </div>
          <div className="cc-map-wrap">
            <CommandCenterMap
              events={displayEvents}
              selectedEvent={null}
              onSelectEvent={(ev) => { onSelectEvent(ev); onNavigateScreen('THERMAL_OPERATIONS'); }}
              persistentSources={persistentSources}
              region={region}
              onNavigateToThermalOps={() => onNavigateScreen('THERMAL_OPERATIONS')}
            />
            <div className="map-caption">
              SATELLITE BASEMAP · {presentationDemo ? 'DEMO INDUSTRIAL OVERLAY' : 'OSM INDUSTRIAL OVERLAY'} · {osmAvailable ? `${osmFeatures.length} ${presentationDemo ? 'DEMO ASSETS' : 'OSM FEATURES'}` : 'OSM CONTEXT UNAVAILABLE'}
              {presentationDemo && <span className="demo-caption-tag"> · SIMULATED DATA · NOT NASA LIVE DATA</span>}
            </div>
          </div>
        </section>

        <aside className="cc-side">
          <section className="cc-panel">
            <div className="panel-head compact"><span className="panel-kicker"><ShieldAlert className="w-3.5 h-3.5" /> PRIORITY EVENTS</span><button className="ghost-link" onClick={() => onNavigateScreen('THERMAL_OPERATIONS')}>VIEW ALL →</button></div>
            <div className="priority-list">
              {recent.length === 0 ? (
                <div className="empty-state">
                  <AlertTriangle className="w-4 h-4" />
                  <div>NO CURRENT FIRMS EVENTS</div>
                  {historicalPreview.length > 0 && (
                    <div className="mt-2 pt-2 border-t border-cyan-950 w-full">
                      <div className="text-[9px] text-orange-300 mb-1">HISTORICAL FIRMS EVIDENCE · 2022–2024</div>
                      {historicalPreview.slice(0, 3).map((p: any) => {
                        const key = p.id ?? getHistoricalFallbackKey('cc-hist', p);
                        const lat = p.lat ?? p.latitude;
                        const lon = p.lon ?? p.longitude;
                        return (
                          <div key={key} className="flex justify-between text-[9px] text-slate-400 py-0.5">
                            <span>{lat != null ? Number(lat).toFixed(3) : '—'}, {lon != null ? Number(lon).toFixed(3) : '—'}</span>
                            <span className="text-orange-300">{p.frp == null ? '—' : Number(p.frp).toFixed(1) + ' MW'}</span>
                          </div>
                        );
                      })}
                      <div className="text-[8px] text-slate-600 mt-1">Historical observations are not current alerts.</div>
                    </div>
                  )}
                </div>
              ) : recent.map((ev, idx) => {
                const level = ev.risk_analysis?.risk_level || 'UNASSESSED';
                const key = ev.id || `cc-ev-${ev.latitude}-${ev.longitude}-${idx}`;
                return <button key={key} className="priority-row" onClick={() => { onSelectEvent(ev); onNavigateScreen('THERMAL_OPERATIONS'); }}>
                  <span className={`risk-dot ${level.toLowerCase()}`} />
                  <span className="priority-main"><strong>{ev.risk_analysis?.classification || 'Thermal Detection'}</strong><span>{Number(ev.latitude).toFixed(3)}, {Number(ev.longitude).toFixed(3)} · {ev.satellite}</span></span>
                  <span className="priority-metric">{(ev.frp || 0).toFixed(1)}<small> MW</small></span>
                </button>;
              })}
            </div>
          </section>

          <section className="cc-panel intelligence-strip">
            <div className="panel-head compact"><span className="panel-kicker"><Sparkles className="w-3.5 h-3.5" /> INTELLIGENCE STATUS</span></div>
            <div className="decision-flow"><span>FIRMS</span><b>→</b><span>OSM</span><b>→</b><span>HISTORY</span><b>→</b><span>AI</span><b>→</b><span>RISK</span></div>
            <div className="intel-grid">
              <div><span>FIRMS</span><strong className={firmsStatus?.available ? 'ok' : 'warn'}>{firmsStatus?.available ? 'ONLINE' : 'UNAVAILABLE'}</strong></div>
              <div><span>OSM</span><strong className={osmAvailable ? 'ok' : 'warn'}>{osmAvailable ? 'ONLINE' : 'UNAVAILABLE'}</strong></div>
              <div><span>ALERTS</span><strong>{alerts.length}</strong></div>
              <div><span>HIGH CONF.</span><strong>{highConfidence}</strong></div>
            </div>
          </section>

          <section className="cc-panel response-mini">
            <div className="panel-head compact"><span className="panel-kicker"><Sparkles className="w-3.5 h-3.5" /> RESPONSE ORCHESTRATOR</span><button className="ghost-link" onClick={() => onNavigateScreen('INTELLIGENCE')}>OPEN →</button></div>
            {displayEvents[0] ? (
              <div className="response-mini-body">
                <div><span className="response-mini-label">PRIORITY EVENT</span><strong>{displayEvents[0].id}</strong></div>
                <div><span className="response-mini-label">NEXT ACTION</span><strong>{displayEvents[0].risk_analysis?.risk_level === 'CRITICAL' || displayEvents[0].risk_analysis?.risk_level === 'HIGH' ? 'PREPARE RESPONSE PACKAGE' : 'VERIFY + WATCH NEXT PASS'}</strong></div>
                <div className="response-mini-reason">{displayEvents[0].risk_analysis?.primary_reason || 'Select an event for response guidance.'}</div>
              </div>
            ) : <div className="empty-state small">No event available for response orchestration.</div>}
          </section>

          <section className="cc-panel archive-card">
            <div className="panel-head compact"><span className="panel-kicker"><Activity className="w-3.5 h-3.5" /> HISTORICAL EVIDENCE</span></div>
            {historicalSummary?.available ? <>
              <div className="archive-number">{historicalSummary.total_records.toLocaleString()}</div>
              <div className="archive-label">FIRMS observations · {historicalSummary.years?.join('–')}</div>
              <div className="archive-mini"><span>HIGH CONF <b>{(historicalSummary.high_confidence_70plus_normalized ?? 0).toLocaleString()}</b></span><span>PEAK FRP <b>{(historicalSummary.frp_max_mw ?? 0).toFixed(1)} MW</b></span></div>
            </> : <div className="empty-state small">Historical archive summary unavailable.</div>}
          </section>
        </aside>
      </div>

      <div className="cc-footer-strip">
        <span><span className="status-led"/> FIRMS {firmsStatus?.available ? 'AVAILABLE' : 'UNAVAILABLE'}</span>
        <span><Factory className="w-3 h-3"/> OSM: {osmAvailable ? `${osmFeatures.length} features` : 'unavailable'}</span>
        <span><Layers className="w-3 h-3"/> Historical: {historicalSummary?.available ? historicalSummary.total_records.toLocaleString() : '—'}</span>
        <span><Radio className="w-3 h-3"/> India · Jhansi-focused monitoring</span>
      </div>
    </div>
  );
};
