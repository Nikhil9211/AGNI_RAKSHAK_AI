import React, { useState, useEffect } from 'react';
import { 
  ShieldAlert, 
  Flame, 
  Satellite, 
  Factory, 
  CheckCircle2, 
  Plus, 
  FileDown, 
  Clock, 
  HelpCircle, 
  MapPin, 
  Layers, 
  Check, 
  Send,
  AlertCircle
} from 'lucide-react';
import { ThermalEvent, EventNote, HistoricalFirmsSummary } from '../../types.ts';
import { formatISTDateTime, formatISTTime } from '../../utils/time.ts';
import { api } from '../../services/api.ts';
import { ResponseOrchestrator } from './ResponseOrchestrator.tsx';

interface IntelligenceHudProps {
  selectedEvent: ThermalEvent | null;
  onAlertCreated: () => void;
  onRefreshEvent: (eventId: string) => void;
  historicalSummary?: HistoricalFirmsSummary | null;
}

export const IntelligenceHud: React.FC<IntelligenceHudProps> = ({
  selectedEvent,
  onAlertCreated,
  onRefreshEvent,
  historicalSummary,
}) => {
  const [notes, setNotes] = useState<EventNote[]>([]);
  const [newNote, setNewNote] = useState<string>('');
  const [isSubmittingNote, setIsSubmittingNote] = useState<boolean>(false);
  const [isCreatingAlert, setIsCreatingAlert] = useState<boolean>(false);
  const [alertSuccessMsg, setAlertSuccessMsg] = useState<string>('');
  const [isAcknowledging, setIsAcknowledging] = useState<boolean>(false);

  // Load notes for selected event
  useEffect(() => {
    if (selectedEvent) {
      api.getEventNotes(selectedEvent.id).then(setNotes).catch(console.warn);
      setAlertSuccessMsg('');
    } else {
      setNotes([]);
    }
  }, [selectedEvent?.id]);

  if (!selectedEvent) {
    return (
      <div className="w-full md:w-80 lg:w-92 xl:w-104 bg-[#070e1b] border-l border-cyan-950/80 flex flex-col h-full shrink-0 select-none z-20 overflow-y-auto font-mono text-xs">
        <div className="p-3 bg-[#060D19] border-b border-cyan-950/80">
          <div className="flex items-center justify-between">
            <span className="text-[10px] font-hud font-bold text-cyan-400 tracking-wider flex items-center gap-1"><Satellite className="w-3.5 h-3.5" /> TARGET INTELLIGENCE HUD</span>
            <span className="text-[9px] px-1.5 py-0.5 border border-slate-700 rounded text-slate-500">WAITING</span>
          </div>
        </div>
        <div className="p-3 space-y-3">
          <div className="p-3 bg-[#091426] border border-cyan-900/60 rounded">
            <div className="text-[10px] text-slate-300 font-bold">NO CURRENT FIRMS EVENT SELECTED</div>
            <div className="text-[10px] text-slate-500 mt-1.5 leading-relaxed">Select a current FIRMS detection from the feed or map to unlock full NASA observation, OSM context, AI risk analysis and response actions.</div>
          </div>
          {historicalSummary?.available && (
            <div className="p-3 bg-[#071421] border border-orange-900/60 rounded">
              <div className="text-[10px] text-orange-300 font-bold uppercase tracking-wider">HISTORICAL EVIDENCE AVAILABLE</div>
              <div className="grid grid-cols-2 gap-2 mt-2">
                <div><span className="text-slate-600 block text-[8px]">OBSERVATIONS</span><b className="text-white text-sm">{historicalSummary.total_records.toLocaleString()}</b></div>
                <div><span className="text-slate-600 block text-[8px]">HIGH CONF.</span><b className="text-cyan-300 text-sm">{(historicalSummary.high_confidence_70plus_normalized ?? 0).toLocaleString()}</b></div>
                <div><span className="text-slate-600 block text-[8px]">PEAK FRP</span><b className="text-orange-300 text-sm">{(historicalSummary.frp_max_mw ?? 0).toFixed(1)} MW</b></div>
                <div><span className="text-slate-600 block text-[8px]">REPEAT CELLS</span><b className="text-amber-300 text-sm">{historicalSummary.persistence_cells_ge3_obs_2dates ?? '—'}</b></div>
              </div>
              <div className="text-[8px] text-slate-600 mt-2">NASA FIRMS archive · {historicalSummary.region === 'JHANSI' ? 'Jhansi' : 'India'} · historical, not NRT</div>
            </div>
          )}
          <div className="p-3 bg-[#07111e] border border-cyan-900/60 rounded">
            <div className="text-[10px] text-cyan-300 font-bold uppercase tracking-wider mb-2">RESPONSE WORKFLOW</div>
            <div className="space-y-1.5 text-[9px]">
              <div className="flex items-center justify-between"><span className="text-slate-500">01</span><span className="text-slate-300">Verify current satellite observation</span><span className="text-slate-700">LOCKED</span></div>
              <div className="flex items-center justify-between"><span className="text-slate-500">02</span><span className="text-slate-300">Check industrial context</span><span className="text-slate-700">LOCKED</span></div>
              <div className="flex items-center justify-between"><span className="text-slate-500">03</span><span className="text-slate-300">Assess persistence / history</span><span className="text-cyan-700">READY</span></div>
              <div className="flex items-center justify-between"><span className="text-slate-500">04</span><span className="text-slate-300">Prepare response package</span><span className="text-slate-700">LOCKED</span></div>
            </div>
          </div>
        </div>
      </div>
    );
  }

  const risk = selectedEvent.risk_analysis;
  const eventIst = (() => {
    const raw = `${selectedEvent.acq_date}T${String(selectedEvent.acq_time || '0000').padStart(4, '0').slice(0,2)}:${String(selectedEvent.acq_time || '0000').padStart(4, '0').slice(2,4)}:00Z`;
    return formatISTTime(raw);
  })();
  const score = risk?.risk_score || 0;
  const osm = selectedEvent.osm_context;

  const handleCreateAlert = async () => {
    setIsCreatingAlert(true);
    try {
      await api.createAlert({
        event_id: selectedEvent.id,
        severity: risk?.risk_level || 'HIGH',
        title: `CRITICAL ALERT: ${risk?.classification || 'Thermal Detection'} at ${selectedEvent.latitude.toFixed(3)}°N, ${selectedEvent.longitude.toFixed(3)}°E`,
        context: `FRP: ${selectedEvent.frp.toFixed(1)} MW. Satellite: ${selectedEvent.satellite}. OSM context: ${osm?.verified ? osm.feature_name : 'None'}`,
        trigger_reasons: risk?.explainability || ['Operator Dispatched Incident'],
        notes: `Created via Intelligence HUD at ${formatISTDateTime(new Date())}`,
      });
      setAlertSuccessMsg('Incident Alert successfully registered in database!');
      onAlertCreated();
      onRefreshEvent(selectedEvent.id);
    } catch (err: any) {
      alert(`Error creating alert: ${err.message}`);
    } finally {
      setIsCreatingAlert(false);
    }
  };

  const handleAddNote = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newNote.trim()) return;
    setIsSubmittingNote(true);
    try {
      const added = await api.addEventNote(selectedEvent.id, 'Duty Officer', newNote.trim());
      setNotes([...notes, added]);
      setNewNote('');
    } catch (err: any) {
      alert(`Error adding note: ${err.message}`);
    } finally {
      setIsSubmittingNote(false);
    }
  };

  const handleExportCsv = () => {
    const csvContent = 
`event_id,latitude,longitude,acq_date,acq_time,satellite,instrument,confidence,frp,bright_ti4,bright_ti5,scan,track,daynight,classification,risk_score,risk_level,osm_feature,distance_m
"${selectedEvent.id}",${selectedEvent.latitude},${selectedEvent.longitude},"${selectedEvent.acq_date}","${selectedEvent.acq_time}","${selectedEvent.satellite}","${selectedEvent.instrument}",${selectedEvent.confidence},${selectedEvent.frp},${selectedEvent.bright_ti4 || 'N/A'},${selectedEvent.bright_ti5 || 'N/A'},${selectedEvent.scan || 'N/A'},${selectedEvent.track || 'N/A'},"${selectedEvent.daynight || 'N/A'}","${risk?.classification || 'N/A'}",${score},"${risk?.risk_level || 'N/A'}","${osm?.feature_name || 'N/A'}",${osm?.distance_meters || 'N/A'}`;

    const blob = new Blob([csvContent], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `incident_${selectedEvent.id}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="w-full md:w-80 lg:w-92 xl:w-104 bg-[#070e1b] border-l border-cyan-950/80 flex flex-col h-full shrink-0 select-none z-20 overflow-y-auto font-mono text-xs">
      {/* Top Banner: Target Header */}
      <div className="p-3 bg-[#060D19] border-b border-cyan-950/80 sticky top-0 z-30 space-y-1">
        <div className="flex items-center justify-between">
          <span className="text-[10px] font-mono text-cyan-400 font-bold tracking-widest uppercase flex items-center gap-1">
            <MapPin className="w-3 h-3 text-cyan-400" />
            TARGET INTELLIGENCE HUD
          </span>
          <span className="text-[10px] text-slate-500">{selectedEvent.source}</span>
        </div>
        <div className="text-white font-bold text-sm tracking-tight flex items-center justify-between">
          <span>
            {typeof selectedEvent.latitude === 'number' && !isNaN(selectedEvent.latitude) ? selectedEvent.latitude.toFixed(4) : '—'}°N,{' '}
            {typeof selectedEvent.longitude === 'number' && !isNaN(selectedEvent.longitude) ? selectedEvent.longitude.toFixed(4) : '—'}°E
          </span>
          <span className={`px-2 py-0.5 rounded text-[10px] font-bold border ${
            score >= 81 ? 'bg-red-950 text-red-300 border-red-800' :
            score >= 61 ? 'bg-orange-950 text-orange-300 border-orange-800' :
            score >= 31 ? 'bg-yellow-950 text-yellow-300 border-yellow-800' :
            'bg-cyan-950 text-cyan-300 border-cyan-800'
          }`}>
            {risk?.risk_level || 'LOW'} ({score}%)
          </span>
        </div>
      </div>

      <div className="p-3 space-y-4">
        {/* SECTION 1: NASA FIRMS OBSERVATION */}
        <div className="space-y-1.5 bg-[#091426] p-3 rounded border border-cyan-900/60">
          <div className="flex items-center justify-between pb-1 border-b border-cyan-950">
            <span className="text-[10px] font-hud font-bold text-amber-400 uppercase tracking-wider flex items-center gap-1">
              <Satellite className="w-3.5 h-3.5" />
              NASA FIRMS OBSERVATION
            </span>
            <span className="text-[9px] px-1 bg-amber-950/80 text-amber-300 rounded border border-amber-800">
              REAL SATELLITE SENSOR
            </span>
          </div>

          <div className="grid grid-cols-2 gap-x-3 gap-y-1 text-[11px] text-slate-300 pt-1">
            <div>
              <span className="text-slate-500">Event ID:</span>
              <div className="text-white text-[10px] truncate">{selectedEvent.id}</div>
            </div>
            <div>
              <span className="text-slate-500">Acquisition:</span>
              <div className="text-white">{selectedEvent.acq_date} {selectedEvent.acq_time} UTC</div><div className="text-cyan-300 text-[10px]">{eventIst}</div>
            </div>
            <div>
              <span className="text-slate-500">Satellite / Inst:</span>
              <div className="text-white">{selectedEvent.satellite} ({selectedEvent.instrument})</div>
            </div>
            <div>
              <span className="text-slate-500">Confidence:</span>
              <div className="text-white font-semibold">{selectedEvent.confidence}%</div>
            </div>
            <div>
              <span className="text-slate-500">Fire Radiative Power:</span>
              <div className="text-orange-400 font-bold">{selectedEvent.frp.toFixed(2)} MW</div>
            </div>
            <div>
              <span className="text-slate-500">Brightness Temp (I-4):</span>
              <div className="text-white">{selectedEvent.bright_ti4 ? `${selectedEvent.bright_ti4.toFixed(1)} K` : 'N/A'}</div>
            </div>
            <div>
              <span className="text-slate-500">Scan / Track:</span>
              <div className="text-slate-300">{selectedEvent.scan || 'N/A'} / {selectedEvent.track || 'N/A'}</div>
            </div>
            <div>
              <span className="text-slate-500">Day / Night:</span>
              <div className="text-slate-300">{selectedEvent.daynight === 'N' ? 'Night pass' : 'Day pass'}</div>
            </div>
          </div>
        </div>

        {/* SECTION 2: AGNI RAKSHAK AI ANALYSIS */}
        <div className="space-y-2 bg-[#091426] p-3 rounded border border-cyan-900/60">
          <div className="flex items-center justify-between pb-1 border-b border-cyan-950">
            <span className="text-[10px] font-hud font-bold text-cyan-400 uppercase tracking-wider flex items-center gap-1">
              <Flame className="w-3.5 h-3.5" />
              AGNI RAKSHAK AI ANALYSIS
            </span>
            <span className="text-[9px] px-1 bg-cyan-950/80 text-cyan-300 rounded border border-cyan-800">
              {risk?.engine_label}
            </span>
          </div>

          <div className="space-y-1.5 text-[11px]">
            <div>
              <span className="text-slate-500">Inferred Classification:</span>
              <div className="text-cyan-300 font-bold text-xs">{risk?.classification}</div>
            </div>
            <div>
              <span className="text-slate-500">Primary Inference:</span>
              <div className="text-slate-300 text-[11px] leading-relaxed">{risk?.primary_reason}</div>
            </div>

            {/* Component Score Progress Bars */}
            <div className="pt-2 border-t border-cyan-950/80 space-y-1.5">
              <span className="text-[10px] font-bold text-slate-400 uppercase">Explainable Risk Factors:</span>

              <div>
                <div className="flex justify-between text-[10px] mb-0.5">
                  <span className="text-slate-400">Thermal Radiative Intensity (30% max):</span>
                  <span className="text-orange-400 font-bold">{risk?.component_scores.thermal_intensity} / 30 pts</span>
                </div>
                <div className="w-full bg-slate-900 h-1.5 rounded overflow-hidden">
                  <div className="bg-orange-500 h-full" style={{ width: `${((risk?.component_scores.thermal_intensity || 0) / 30) * 100}%` }} />
                </div>
              </div>

              <div>
                <div className="flex justify-between text-[10px] mb-0.5">
                  <span className="text-slate-400">Thermal Persistence (25% max):</span>
                  <span className="text-amber-400 font-bold">{risk?.component_scores.persistence} / 25 pts</span>
                </div>
                <div className="w-full bg-slate-900 h-1.5 rounded overflow-hidden">
                  <div className="bg-amber-500 h-full" style={{ width: `${((risk?.component_scores.persistence || 0) / 25) * 100}%` }} />
                </div>
              </div>

              <div>
                <div className="flex justify-between text-[10px] mb-0.5">
                  <span className="text-slate-400">OSM Industrial Context (20% max):</span>
                  <span className="text-blue-400 font-bold">{risk?.component_scores.industrial_context} / 20 pts</span>
                </div>
                <div className="w-full bg-slate-900 h-1.5 rounded overflow-hidden">
                  <div className="bg-blue-500 h-full" style={{ width: `${((risk?.component_scores.industrial_context || 0) / 20) * 100}%` }} />
                </div>
              </div>

              <div>
                <div className="flex justify-between text-[10px] mb-0.5">
                  <span className="text-slate-400">Historical Temporal Anomaly (15% max):</span>
                  <span className="text-purple-400 font-bold">{risk?.component_scores.historical_anomaly} / 15 pts</span>
                </div>
                <div className="w-full bg-slate-900 h-1.5 rounded overflow-hidden">
                  <div className="bg-purple-500 h-full" style={{ width: `${((risk?.component_scores.historical_anomaly || 0) / 15) * 100}%` }} />
                </div>
              </div>

              <div>
                <div className="flex justify-between text-[10px] mb-0.5">
                  <span className="text-slate-400">Detection Confidence (10% max):</span>
                  <span className="text-emerald-400 font-bold">{risk?.component_scores.detection_confidence} / 10 pts</span>
                </div>
                <div className="w-full bg-slate-900 h-1.5 rounded overflow-hidden">
                  <div className="bg-emerald-500 h-full" style={{ width: `${((risk?.component_scores.detection_confidence || 0) / 10) * 100}%` }} />
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* SECTION 3: OSM INDUSTRIAL CONTEXT */}
        <div className="space-y-1.5 bg-[#091426] p-3 rounded border border-cyan-900/60">
          <div className="flex items-center justify-between pb-1 border-b border-cyan-950">
            <span className="text-[10px] font-hud font-bold text-blue-400 uppercase tracking-wider flex items-center gap-1">
              <Factory className="w-3.5 h-3.5" />
              OSM INDUSTRIAL CONTEXT
            </span>
            <span className={`text-[9px] px-1 rounded border ${
              osm?.verified ? 'bg-blue-950/80 text-blue-300 border-blue-800' : 'bg-slate-900 text-slate-400 border-slate-700'
            }`}>
              {osm?.verified ? 'OSM MATCH' : 'NO OSM MATCH'}
            </span>
          </div>

          {osm?.verified ? (
            <div className="space-y-1 text-[11px] text-slate-300">
              <div className="flex justify-between">
                <span className="text-slate-500">Feature Name:</span>
                <span className="text-white font-semibold">{osm.feature_name}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-500">Type:</span>
                <span className="text-cyan-400 capitalize">{osm.feature_type}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-500">Distance to Hotspot:</span>
                <span className="text-orange-400 font-bold">{osm.distance_meters} meters</span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-500">Industrial Score:</span>
                <span className="text-emerald-400 font-bold">{osm.industrial_score} / 100</span>
              </div>
            </div>
          ) : (
            <div className="text-[11px] text-slate-400 italic py-1">
              NO VERIFIED INDUSTRIAL CONTEXT within 3,000m radius of observation.
            </div>
          )}
        </div>

        {/* SECTION 4: WHY THIS EVENT IS FLAGGED */}
        <div className="space-y-2 bg-[#091426] p-3 rounded border border-cyan-900/60">
          <div className="text-[10px] font-hud font-bold text-cyan-400 uppercase tracking-wider pb-1 border-b border-cyan-950 flex items-center gap-1">
            <HelpCircle className="w-3.5 h-3.5" />
            WHY THIS EVENT IS FLAGGED
          </div>
          <ul className="space-y-1.5 text-[11px] text-slate-300">
            {risk?.explainability.map((line, idx) => (
              <li key={idx} className="flex items-start gap-1.5">
                <span className="text-cyan-400 font-bold">→</span>
                <span>{line}</span>
              </li>
            ))}
          </ul>
        </div>

        {/* SECTION 4.5: EMERGENCY RESPONSE ORCHESTRATOR (compact) */}
        <ResponseOrchestrator
          event={selectedEvent}
          compact
          onAlertCreated={onAlertCreated}
          onEventUpdated={(ev) => onRefreshEvent(ev.id)}
        />

        {/* SECTION 5: ACTIONS */}
        <div className="space-y-2">
          {alertSuccessMsg && (
            <div className="p-2 bg-emerald-950/80 border border-emerald-800 text-emerald-300 rounded text-[11px] flex items-center gap-1.5">
              <CheckCircle2 className="w-3.5 h-3.5 shrink-0" />
              <span>{alertSuccessMsg}</span>
            </div>
          )}

          <div className="grid grid-cols-2 gap-2">
            <button
              id="hud-btn-create-alert"
              onClick={handleCreateAlert}
              disabled={isCreatingAlert}
              className="px-3 py-2 bg-red-600 hover:bg-red-500 disabled:opacity-50 text-white rounded font-hud font-bold text-xs tracking-wider flex items-center justify-center gap-1.5 transition-colors shadow-md"
            >
              <ShieldAlert className="w-3.5 h-3.5" />
              {isCreatingAlert ? 'CREATING...' : 'CREATE ALERT'}
            </button>

            <button
              id="hud-btn-export-csv"
              onClick={handleExportCsv}
              className="px-3 py-2 bg-slate-800 hover:bg-slate-700 text-cyan-300 rounded font-hud font-bold text-xs tracking-wider flex items-center justify-center gap-1.5 transition-colors border border-cyan-900/60"
            >
              <FileDown className="w-3.5 h-3.5" />
              EXPORT CSV
            </button>
          </div>
        </div>

        {/* SECTION 6: OPERATIONAL NOTES */}
        <div className="space-y-2 bg-[#091426] p-3 rounded border border-cyan-900/60">
          <div className="text-[10px] font-hud font-bold text-slate-300 uppercase tracking-wider pb-1 border-b border-cyan-950">
            OPERATIONAL NOTES & LOG ({notes.length})
          </div>

          <div className="space-y-1.5 max-h-36 overflow-y-auto pr-1">
            {notes.length === 0 ? (
              <div className="text-[10px] text-slate-500 italic">No notes logged for this incident yet.</div>
            ) : (
              notes.map((n) => (
                <div key={n.id} className="p-1.5 bg-[#060D19] border border-cyan-950 rounded text-[10px]">
                  <div className="flex justify-between text-slate-400 text-[9px] mb-0.5">
                    <span className="font-semibold text-cyan-400">{n.author}</span>
                    <span>{formatISTTime(n.created_at)}</span>
                  </div>
                  <div className="text-slate-200">{n.content}</div>
                </div>
              ))
            )}
          </div>

          <form onSubmit={handleAddNote} className="flex gap-1.5 pt-1">
            <input
              type="text"
              value={newNote}
              onChange={(e) => setNewNote(e.target.value)}
              placeholder="Add incident log note..."
              className="flex-1 bg-[#060D19] border border-cyan-900 px-2 py-1 rounded text-white text-[11px] focus:outline-none focus:border-cyan-400"
            />
            <button
              type="submit"
              disabled={isSubmittingNote || !newNote.trim()}
              className="px-2.5 py-1 bg-cyan-600 hover:bg-cyan-500 disabled:opacity-50 text-white rounded text-xs"
            >
              <Send className="w-3 h-3" />
            </button>
          </form>
        </div>
      </div>
    </div>
  );
};
