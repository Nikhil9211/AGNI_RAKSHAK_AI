import React, { useState } from 'react';
import { 
  ShieldAlert, 
  CheckCircle2, 
  Clock, 
  Crosshair, 
  FileDown, 
  Send, 
  AlertTriangle, 
  Activity, 
  UserCheck, 
  Flame,
  MessageSquare
} from 'lucide-react';
import { Alert, ThermalEvent, Region, HistoricalFirmsSummary } from '../types.ts';
import { formatISTDateTime } from '../utils/time.ts';
import { getHistoricalFallbackKey } from '../utils/historicalKey.ts';
import { api } from '../services/api.ts';

interface AlertsProps {
  alerts: Alert[];
  onRefreshAlerts: () => void;
  onSelectEventById: (eventId: string) => void;
  onNavigateToThermalOps: () => void;
  region: Region;
}

export const Alerts: React.FC<AlertsProps> = ({
  alerts,
  onRefreshAlerts,
  onSelectEventById,
  onNavigateToThermalOps,
  region,
}) => {
  const [statusFilter, setStatusFilter] = useState<'ALL' | Alert['status']>('ALL');
  const [selectedAlertId, setSelectedAlertId] = useState<string | null>(null);
  const [noteInput, setNoteInput] = useState<string>('');
  const [isUpdating, setIsUpdating] = useState<boolean>(false);
  const [historicalSummary, setHistoricalSummary] = useState<HistoricalFirmsSummary | null>(null);
  const [historicalPreview, setHistoricalPreview] = useState<any[]>([]);

  React.useEffect(() => {
    let cancelled = false;
    Promise.all([
      api.getHistoricalFirmsSummary(region).catch(() => null),
      api.getHistoricalFirmsPoints(region, 12).catch(() => ({ points: [] })),
    ]).then(([summary, points]) => {
      if (cancelled) return;
      setHistoricalSummary(summary as HistoricalFirmsSummary | null);
      setHistoricalPreview(Array.isArray((points as any)?.points) ? (points as any).points : []);
    });
    return () => { cancelled = true; };
  }, [region]);

  const filteredAlerts = alerts.filter((a) => {
    if (statusFilter === 'ALL') return true;
    return a.status === statusFilter;
  });

  const handleUpdateStatus = async (alertId: string, nextStatus: Alert['status']) => {
    setIsUpdating(true);
    try {
      await api.updateAlertStatus(alertId, nextStatus, 'Operations Officer');
      onRefreshAlerts();
    } catch (err: any) {
      alert(`Failed to update status: ${err.message}`);
    } finally {
      setIsUpdating(false);
    }
  };

  const handleAddNote = async (alertId: string) => {
    if (!noteInput.trim()) return;
    try {
      await api.addAlertNote(alertId, noteInput.trim());
      setNoteInput('');
      onRefreshAlerts();
    } catch (err: any) {
      alert(`Failed to add note: ${err.message}`);
    }
  };

  const handleExportAlert = (alert: Alert) => {
    const text = `
================================================================================
AGNI RAKSHAK AI — SIH 26162 INCIDENT ALERT DISPATCH
================================================================================
Alert ID: ${alert.id}
Event Ref: ${alert.event_id}
Status: ${alert.status}
Severity: ${alert.severity}
Title: ${alert.title}
Coordinates: ${alert.latitude}°N, ${alert.longitude}°E
Radiative Power: ${alert.frp} MW
Classification: ${alert.classification}
Context: ${alert.context}
Trigger Reasons:
${alert.trigger_reasons.map((r) => ` - ${r}`).join('\n')}
Operational Notes:
${(alert.notes || []).map((n) => ` - ${n}`).join('\n')}
Created At: ${alert.created_at}
Acknowledged At: ${alert.acknowledged_at || 'Pending'}
Resolved At: ${alert.resolved_at || 'Pending'}
================================================================================
`;
    const blob = new Blob([text], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `incident_dispatch_${alert.id}.txt`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const selectedAlert = alerts.find((a) => a.id === selectedAlertId) || filteredAlerts[0] || null;

  return (
    <div className="flex-1 overflow-y-auto p-4 space-y-4 bg-[#050B14] font-mono text-xs select-none">
      {/* Top Banner */}
      <div className="p-3 bg-[#081223] border border-cyan-900/60 rounded flex flex-col sm:flex-row items-start sm:items-center justify-between gap-2">
        <div>
          <div className="flex items-center gap-2">
            <ShieldAlert className="w-4 h-4 text-red-400" />
            <h2 className="text-base font-hud font-bold text-white tracking-wider">
              INCIDENT ALERT DISPATCH & LIFECYCLE MANAGEMENT
            </h2>
          </div>
          <p className="text-[11px] text-slate-400 mt-0.5">
            Real incident status progression: NEW &rarr; INVESTIGATING &rarr; ACKNOWLEDGED &rarr; RESOLVED with permanent audit trail.
          </p>
        </div>

        {/* Status Lifecycle Filter Pills */}
        <div className="flex items-center bg-[#060D19] border border-cyan-900/80 rounded p-0.5">
          {(['ALL', 'NEW', 'INVESTIGATING', 'ACKNOWLEDGED', 'RESOLVED'] as const).map((st) => (
            <button
              key={st}
              onClick={() => setStatusFilter(st)}
              className={`px-2.5 py-1 text-[11px] font-mono font-semibold rounded transition-colors ${
                statusFilter === st
                  ? 'bg-red-500/20 text-red-300 border border-red-500/50'
                  : 'text-slate-400 hover:text-white'
              }`}
            >
              {st}
            </button>
          ))}
        </div>
      </div>

      {/* Main Grid: Alert List (Left) + Detail & Lifecycle Panel (Right) */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        {/* Left 2 Cols: Alerts List */}
        <div className="lg:col-span-2 bg-[#081223] border border-cyan-900/60 rounded p-3 flex flex-col space-y-2">
          <div className="flex justify-between items-center pb-2 border-b border-cyan-950">
            <span className="font-hud font-bold text-slate-300 text-xs uppercase">
              REGISTERED INCIDENTS ({filteredAlerts.length})
            </span>
          </div>

          <div className="space-y-2 overflow-y-auto max-h-[600px] pr-1">
            {filteredAlerts.length === 0 ? (
              <div className="text-center py-12 text-slate-500">
                No alerts found matching status filter "{statusFilter}".
              </div>
            ) : (
              filteredAlerts.map((alt) => {
                const isSelected = selectedAlert?.id === alt.id;
                const statusColor = 
                  alt.status === 'NEW' ? 'bg-red-950 text-red-300 border-red-800' :
                  alt.status === 'INVESTIGATING' ? 'bg-amber-950 text-amber-300 border-amber-800' :
                  alt.status === 'ACKNOWLEDGED' ? 'bg-blue-950 text-blue-300 border-blue-800' :
                  'bg-emerald-950 text-emerald-300 border-emerald-800';

                return (
                  <div
                    key={alt.id}
                    onClick={() => setSelectedAlertId(alt.id)}
                    className={`p-3 rounded border cursor-pointer transition-all ${
                      isSelected ? 'bg-[#0f213f] border-cyan-400' : 'bg-[#060D19] border-cyan-950 hover:border-cyan-800'
                    }`}
                  >
                    <div className="flex items-center justify-between mb-1.5">
                      <div className="flex items-center gap-2">
                        <span className={`px-2 py-0.5 rounded text-[10px] font-bold border ${statusColor}`}>
                          {alt.status}
                        </span>
                        <span className="text-white font-bold text-xs truncate max-w-md">
                          {alt.title}
                        </span>
                      </div>
                      <span className="text-orange-400 font-bold text-xs">
                        {alt.frp.toFixed(1)} MW
                      </span>
                    </div>

                    <p className="text-[11px] text-slate-300 line-clamp-2 mb-2">
                      {alt.context}
                    </p>

                    <div className="flex items-center justify-between text-[10px] text-slate-500 pt-1 border-t border-cyan-950">
                      <span>Ref: {alt.event_id}</span>
                      <span>Coordinates: {alt.latitude.toFixed(3)}°N, {alt.longitude.toFixed(3)}°E</span>
                      <span>{formatISTDateTime(alt.created_at)}</span>
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </div>

        {/* Right 1 Col: Selected Alert Incident Card & Lifecycle Controls */}
        <div className="bg-[#081223] border border-cyan-900/60 rounded p-3 flex flex-col space-y-3">
          {selectedAlert ? (
            <>
              <div className="flex justify-between items-center pb-2 border-b border-cyan-950">
                <span className="font-hud font-bold text-cyan-400 text-xs uppercase">
                  INCIDENT RESPONSE DESK
                </span>
                <button
                  onClick={() => handleExportAlert(selectedAlert)}
                  className="px-2 py-1 bg-slate-800 hover:bg-slate-700 text-cyan-300 rounded text-[10px] flex items-center gap-1"
                >
                  <FileDown className="w-3 h-3" />
                  Export
                </button>
              </div>

              {/* Title & Classification */}
              <div>
                <div className="text-slate-500 text-[10px]">INCIDENT TITLE</div>
                <div className="text-white font-bold text-xs">{selectedAlert.title}</div>
                <div className="text-cyan-300 text-[11px] mt-0.5">{selectedAlert.classification}</div>
              </div>

              {/* Lifecycle Progression Buttons */}
              <div className="p-2.5 bg-[#060D19] border border-cyan-950 rounded space-y-2">
                <div className="text-[10px] font-bold text-slate-400 uppercase">
                  DISPATCH LIFECYCLE ACTION:
                </div>
                <div className="grid grid-cols-2 gap-1.5">
                  <button
                    disabled={isUpdating || selectedAlert.status === 'INVESTIGATING'}
                    onClick={() => handleUpdateStatus(selectedAlert.id, 'INVESTIGATING')}
                    className="px-2 py-1.5 bg-amber-700 hover:bg-amber-600 disabled:opacity-40 text-white rounded text-[10px] font-hud font-bold"
                  >
                    INVESTIGATE
                  </button>

                  <button
                    disabled={isUpdating || selectedAlert.status === 'ACKNOWLEDGED'}
                    onClick={() => handleUpdateStatus(selectedAlert.id, 'ACKNOWLEDGED')}
                    className="px-2 py-1.5 bg-blue-700 hover:bg-blue-600 disabled:opacity-40 text-white rounded text-[10px] font-hud font-bold"
                  >
                    ACKNOWLEDGE
                  </button>

                  <button
                    disabled={isUpdating || selectedAlert.status === 'RESOLVED'}
                    onClick={() => handleUpdateStatus(selectedAlert.id, 'RESOLVED')}
                    className="col-span-2 px-2 py-1.5 bg-emerald-700 hover:bg-emerald-600 disabled:opacity-40 text-white rounded text-[10px] font-hud font-bold"
                  >
                    MARK AS RESOLVED
                  </button>
                </div>
              </div>

              {/* Navigate to Thermal Ops button */}
              <button
                onClick={() => {
                  onSelectEventById(selectedAlert.event_id);
                  onNavigateToThermalOps();
                }}
                className="w-full py-2 bg-cyan-600 hover:bg-cyan-500 text-white rounded font-hud font-bold text-xs flex items-center justify-center gap-1.5 shadow"
              >
                <Crosshair className="w-3.5 h-3.5" />
                LOCATE HOTSPOT IN THERMAL OPS
              </button>

              {/* Trigger Reasons */}
              <div>
                <div className="text-slate-500 text-[10px] mb-1">AUTOMATED TRIGGER REASONS</div>
                <ul className="space-y-1 text-[11px] text-slate-300">
                  {selectedAlert.trigger_reasons.map((r, i) => (
                    <li key={i} className="flex items-start gap-1">
                      <span className="text-red-400 font-bold">•</span>
                      <span>{r}</span>
                    </li>
                  ))}
                </ul>
              </div>

              {/* Incident Notes Log */}
              <div className="pt-2 border-t border-cyan-950 space-y-2 flex-1">
                <div className="text-[10px] font-bold text-slate-400 uppercase">
                  INCIDENT LOG / NOTES ({selectedAlert.notes?.length || 0})
                </div>

                <div className="space-y-1 max-h-32 overflow-y-auto">
                  {(selectedAlert.notes || []).map((n, i) => (
                    <div key={i} className="p-1.5 bg-[#060D19] border border-cyan-950 rounded text-[10px] text-slate-300">
                      {n}
                    </div>
                  ))}
                </div>

                <div className="flex gap-1">
                  <input
                    type="text"
                    value={noteInput}
                    onChange={(e) => setNoteInput(e.target.value)}
                    placeholder="Log operational update..."
                    className="flex-1 bg-[#060D19] border border-cyan-900 px-2 py-1 rounded text-white text-[11px] focus:outline-none focus:border-cyan-400"
                  />
                  <button
                    onClick={() => handleAddNote(selectedAlert.id)}
                    className="px-2.5 py-1 bg-cyan-600 text-white rounded text-xs"
                  >
                    <Send className="w-3 h-3" />
                  </button>
                </div>
              </div>
            </>
          ) : (
            <div className="p-8 text-center text-slate-500">
              Select an alert from the list to view telemetry and lifecycle actions.
            </div>
          )}
        </div>
      </div>

      {/* Historical evidence is shown separately from operational alerts. */}
      <section className="bg-[#071421] border border-orange-900/60 rounded p-3">
        <div className="flex items-center justify-between border-b border-orange-950 pb-2 mb-2">
          <div>
            <div className="font-hud font-bold text-orange-300 text-xs uppercase tracking-wider">NASA FIRMS HISTORICAL EVIDENCE</div>
            <div className="text-[9px] text-slate-500 mt-0.5">Historical observations are evidence only and are not treated as current alerts.</div>
          </div>
          {historicalSummary?.available && <div className="text-right text-[9px] text-slate-400"><b className="text-orange-300">{historicalSummary.total_records.toLocaleString()}</b> observations · {region}</div>}
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-2">
          <div className="p-2 bg-[#060D19] border border-orange-950 rounded"><div className="text-[9px] text-slate-500">PEAK FRP</div><div className="text-lg font-bold text-orange-300">{historicalSummary?.available ? (historicalSummary.frp_max_mw ?? 0).toFixed(1) + ' MW' : '—'}</div></div>
          <div className="p-2 bg-[#060D19] border border-cyan-950 rounded"><div className="text-[9px] text-slate-500">HIGH CONFIDENCE</div><div className="text-lg font-bold text-cyan-300">{historicalSummary?.available ? (historicalSummary.high_confidence_70plus_normalized ?? 0).toLocaleString() : '—'}</div></div>
          <div className="p-2 bg-[#060D19] border border-amber-950 rounded"><div className="text-[9px] text-slate-500">REPEAT CELLS</div><div className="text-lg font-bold text-amber-300">{historicalSummary?.available ? (historicalSummary.persistence_cells_ge3_obs_2dates ?? 0).toLocaleString() : '—'}</div></div>
          <div className="p-2 bg-[#060D19] border border-cyan-950 rounded"><div className="text-[9px] text-slate-500">SAMPLE POINTS</div><div className="text-lg font-bold text-white">{historicalPreview.length}</div></div>
        </div>
        {historicalPreview.length > 0 && (
          <div className="mt-2 grid grid-cols-1 md:grid-cols-3 xl:grid-cols-6 gap-2">
            {historicalPreview.slice(0, 6).map((p: any) => {
              const key = p.id ?? getHistoricalFallbackKey('alt-hist', p);
              const lat = p.lat ?? p.latitude;
              const lon = p.lon ?? p.longitude;
              return (
                <div key={key} className="p-2 bg-[#060D19] border border-cyan-950 rounded">
                  <div className="text-[9px] text-cyan-300">{p.source || 'NASA FIRMS'}</div>
                  <div className="text-[9px] text-white mt-0.5">{lat != null ? Number(lat).toFixed(3) : '—'}, {lon != null ? Number(lon).toFixed(3) : '—'}</div>
                  <div className="text-[8px] text-orange-300 mt-0.5">{p.frp == null ? '—' : Number(p.frp).toFixed(1) + ' MW'}</div>
                  <div className="text-[8px] text-slate-500 mt-0.5">{p.date ?? p.acq_date}</div>
                </div>
              );
            })}
          </div>
        )}
      </section>
    </div>
  );
};
