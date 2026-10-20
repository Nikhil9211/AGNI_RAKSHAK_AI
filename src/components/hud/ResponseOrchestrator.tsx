import React, { useEffect, useMemo, useState } from 'react';
import {
  AlertTriangle, Ambulance, BellRing, CheckCircle2, ClipboardList, Flame,
  MapPinned, Radio, Shield, ShieldAlert, Target, TrafficCone, Zap,
} from 'lucide-react';
import { ThermalEvent, HistoricalFirmsSummary, ResponseIncident, ResponseResource, ResponseResourceType, ResponseState } from '../../types.ts';
import { api } from '../../services/api.ts';

interface ResponseOrchestratorProps {
  event: ThermalEvent | null;
  demo?: boolean;
  onAlertCreated?: () => void;
  historicalSummary?: HistoricalFirmsSummary | null;
  onOpenThermalOps?: () => void;
  onRefresh?: () => void;
  onEventUpdated?: (event: ThermalEvent) => void;
  /** Renders a smaller variant for embedding in the selected-event HUD sidebar. */
  compact?: boolean;
}

type Action = { id: string; label: string; detail: string; icon: React.ReactNode };

function buildActions(event: ThermalEvent): Action[] {
  const risk = event.risk_analysis?.risk_level || 'LOW';
  const industrial = Boolean(event.osm_context?.verified);
  const persistent = Boolean(event.is_persistent);

  const actions: Action[] = [
    { id: 'verify', label: 'VERIFY EVENT', detail: 'Confirm satellite observation against mapped context and event geometry.', icon: <Target className="w-3.5 h-3.5" /> },
  ];
  if (industrial) {
    actions.push({ id: 'industrial', label: 'CHECK INDUSTRIAL ASSET', detail: `Review nearby ${event.osm_context?.feature_type || 'industrial'} context and distance.`, icon: <MapPinned className="w-3.5 h-3.5" /> });
  } else {
    actions.push({ id: 'context', label: 'REQUEST CONTEXT CHECK', detail: 'No verified industrial context attached; keep classification provisional.', icon: <MapPinned className="w-3.5 h-3.5" /> });
  }
  if (persistent) {
    actions.push({ id: 'monitor', label: 'MONITOR PERSISTENCE', detail: 'Track repeat detections and compare the next available observation.', icon: <Radio className="w-3.5 h-3.5" /> });
  } else {
    actions.push({ id: 'monitor', label: 'WATCH NEXT PASS', detail: 'Use the next FIRMS observation to confirm whether activity repeats.', icon: <Radio className="w-3.5 h-3.5" /> });
  }
  if (risk === 'CRITICAL' || risk === 'HIGH') {
    actions.push({ id: 'escalate', label: 'ESCALATE RESPONSE', detail: 'Prepare an incident brief and alert package for duty review.', icon: <BellRing className="w-3.5 h-3.5" /> });
  } else {
    actions.push({ id: 'brief', label: 'PREPARE BRIEF', detail: 'Create a concise evidence package for analyst review.', icon: <ClipboardList className="w-3.5 h-3.5" /> });
  }
  return actions.slice(0, 4);
}

const RESOURCE_ICONS: Record<ResponseResourceType, React.ReactNode> = {
  FIRE: <Flame className="w-3.5 h-3.5" />,
  MEDICAL: <Ambulance className="w-3.5 h-3.5" />,
  EVACUATION: <ShieldAlert className="w-3.5 h-3.5" />,
  ROAD: <TrafficCone className="w-3.5 h-3.5" />,
};

const STAGE_LABEL: Record<ResponseResourceType, string> = {
  FIRE: 'DISPATCH / STAGE',
  MEDICAL: 'DISPATCH / STAGE',
  EVACUATION: 'STAGE',
  ROAD: 'RESTRICT',
};

const STAGE_ACTION: Record<ResponseResourceType, string> = {
  FIRE: 'DISPATCH',
  MEDICAL: 'DISPATCH',
  EVACUATION: 'STAGE',
  ROAD: 'RESTRICT',
};

function stateClass(status: ResponseState): string {
  return `state-${status.toLowerCase()}`;
}

/**
 * Client-side mirror of the server recommendation logic, used ONLY in
 * ?demo=1 mode so the demo never writes to the real database. Kept
 * intentionally simple -- it never invents ETAs, units, or population data,
 * matching the real service's guarantees.
 */
function buildDemoResources(event: ThermalEvent): ResponseResource[] {
  const now = new Date().toISOString();
  const risk = event.risk_analysis?.risk_level || 'LOW';
  const frp = event.frp || 0;
  const industrial = Boolean(event.osm_context?.verified);
  const persistent = Boolean(event.is_persistent);

  const mk = (type: ResponseResourceType, status: ResponseState, recommendation: string, supported: boolean): ResponseResource => ({
    type, label: type, status, recommendation, recommendation_supported: supported,
    eta_minutes: null, eta_basis: null, updated_at: now, history: [],
  });

  const labels: Record<ResponseResourceType, string> = {
    FIRE: 'FIRE RESPONSE UNIT',
    MEDICAL: 'AMBULANCE / MEDICAL SUPPORT',
    EVACUATION: 'EVACUATION ZONE',
    ROAD: 'ROAD / TRAFFIC CONTROL',
  };

  return [
    (risk === 'CRITICAL' || (risk === 'HIGH' && frp >= 20))
      ? mk('FIRE', 'RECOMMENDED', `${risk} risk with ${frp.toFixed(1)} MW FRP. Recommend staging a fire response unit.`, true)
      : mk('FIRE', 'STANDBY', 'Evidence does not meet the threshold to recommend staging a fire unit.', false),
    ((risk === 'CRITICAL' || risk === 'HIGH') && industrial)
      ? mk('MEDICAL', 'RECOMMENDED', 'Risk + verified industrial exposure context. Recommend medical support on standby.', true)
      : mk('MEDICAL', 'STANDBY', 'RECOMMENDATION NOT SUPPORTED -- insufficient risk/context evidence.', false),
    (risk === 'CRITICAL' && persistent)
      ? mk('EVACUATION', 'RECOMMENDED', 'CRITICAL persistent activity warrants a manual field assessment.', true)
      : mk('EVACUATION', 'STANDBY', 'RECOMMENDATION NOT SUPPORTED -- no population/exposure data available.', false),
    industrial
      ? mk('ROAD', 'RECOMMENDED', 'Verified industrial proximity. Recommend restricting approach roads pending verification.', true)
      : mk('ROAD', 'STANDBY', 'RECOMMENDATION NOT SUPPORTED -- no verified industrial context.', false),
  ].map((r) => ({ ...r, label: labels[r.type] }));
}

export const ResponseOrchestrator: React.FC<ResponseOrchestratorProps> = ({ event, demo = false, onAlertCreated, historicalSummary, onOpenThermalOps, onRefresh, onEventUpdated, compact = false }) => {
  const [executed, setExecuted] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string>('READY');

  const [incident, setIncident] = useState<ResponseIncident | null>(null);
  const [incidentLoading, setIncidentLoading] = useState(false);
  const [incidentBusyType, setIncidentBusyType] = useState<ResponseResourceType | null>(null);
  const [pendingApproval, setPendingApproval] = useState(false);
  const [packageBusy, setPackageBusy] = useState(false);

  const actions = useMemo(() => event ? buildActions(event) : [], [event]);
  const riskLevel = event?.risk_analysis?.risk_level || 'UNASSESSED';
  const riskScore = event?.risk_analysis?.risk_score ?? null;

  // Load / recompute the incident whenever the selected event changes.
  useEffect(() => {
    setPendingApproval(false);
    if (!event) {
      setIncident(null);
      return;
    }
    if (demo) {
      setIncident({
        id: `DEMO-${event.id}`,
        event_id: event.id,
        severity: riskLevel as any,
        overall_status: 'STANDBY',
        resources: buildDemoResources(event),
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
        approved_at: null,
      });
      return;
    }
    let cancelled = false;
    setIncidentLoading(true);
    api.getResponseIncident(event.id)
      .then((inc) => { if (!cancelled) setIncident(inc); })
      .catch(() => { if (!cancelled) setIncident(null); })
      .finally(() => { if (!cancelled) setIncidentLoading(false); });
    return () => { cancelled = true; };
  }, [event?.id, demo]);

  const executeAction = async (id: string) => {
    if (!event || busy) return;
    setBusy(true);
    try {
      if (demo) {
        setExecuted((prev) => prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]);
        setMessage('DEMO ACTION RECORDED');
        return;
      }
      if (id === 'verify' || id === 'industrial') {
        const result = await api.getEventById(event.id);
        onEventUpdated?.(result.event);
        setExecuted((prev) => prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]);
        setMessage(id === 'verify' ? 'EVENT DATA VERIFIED' : 'INDUSTRIAL CONTEXT REFRESHED');
      } else if (id === 'monitor') {
        await api.addEventNote(event.id, 'Duty Officer', 'Response Orchestrator: monitor next FIRMS pass / persistence.');
        setExecuted((prev) => prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]);
        setMessage('NEXT FIRMS PASS WATCHLIST LOGGED');
      } else if (id === 'escalate') {
        await api.createAlert({
          event_id: event.id,
          severity: (riskLevel === 'UNASSESSED' ? 'HIGH' : riskLevel) as any,
          title: `Response escalation for ${event.id}`,
          context: event.risk_analysis?.primary_reason || 'Response escalation requested from orchestrator.',
          trigger_reasons: event.risk_analysis?.explainability || ['Operator escalation'],
        });
        setExecuted((prev) => [...new Set([...prev, id])]);
        setMessage('RESPONSE ESCALATION REGISTERED');
        onAlertCreated?.();
      } else {
        await api.addEventNote(event.id, 'Duty Officer', 'Response Orchestrator: analyst brief prepared for review.');
        setExecuted((prev) => [...new Set([...prev, id])]);
        setMessage('ANALYST BRIEF LOGGED');
      }
    } catch {
      setMessage('ACTION FAILED — RETRY');
    } finally {
      setBusy(false);
    }
  };

  const applyResourceAction = async (resource: ResponseResource, action: string) => {
    if (!event) return;
    if (demo) {
      // Local-only transition for the demo; never persisted.
      const targetMap: Record<string, ResponseState> = { STAGE: 'STAGED', DISPATCH: 'STAGED', RESTRICT: 'STAGED', ACTIVATE: 'ACTIVATED', COMPLETE: 'COMPLETED', CANCEL: 'CANCELLED', RESET: 'STANDBY' };
      const target = targetMap[action];
      if (!target || !incident) return;
      setIncident({
        ...incident,
        resources: incident.resources.map((r) => r.type === resource.type ? { ...r, status: target, updated_at: new Date().toISOString() } : r),
      });
      return;
    }
    setIncidentBusyType(resource.type);
    try {
      const updated = await api.updateResponseResource(event.id, resource.type, action);
      setIncident(updated);
    } catch (e) {
      setMessage(e instanceof Error ? e.message : 'RESOURCE ACTION FAILED');
    } finally {
      setIncidentBusyType(null);
    }
  };

  const confirmExecuteResponse = async () => {
    if (!event || !incident) return;
    const recommended = incident.resources.filter((r) => r.status === 'RECOMMENDED');
    if (recommended.length === 0) {
      setPendingApproval(false);
      return;
    }
    if (demo) {
      setIncident({
        ...incident,
        resources: incident.resources.map((r) => r.status === 'RECOMMENDED' ? { ...r, status: 'STAGED', updated_at: new Date().toISOString() } : r),
      });
      setPendingApproval(false);
      return;
    }
    setIncidentBusyType('FIRE'); // generic busy indicator during the batch approval
    try {
      let latest = incident;
      for (const r of recommended) {
        latest = await api.updateResponseResource(event.id, r.type, STAGE_ACTION[r.type]);
      }
      setIncident(latest);
    } catch (e) {
      setMessage(e instanceof Error ? e.message : 'STAGING FAILED');
    } finally {
      setIncidentBusyType(null);
      setPendingApproval(false);
    }
  };

  const createResponsePackage = async () => {
    if (!event) return;
    setPackageBusy(true);
    try {
      if (demo) {
        setMessage('DEMO RESPONSE PACKAGE READY');
      } else {
        const { incident: updated, alert } = await api.createResponsePackage(event.id);
        setIncident(updated);
        setMessage(`RESPONSE PACKAGE CREATED (${alert.id})`);
        onAlertCreated?.();
      }
    } catch {
      setMessage('RESPONSE PACKAGE FAILED');
    } finally {
      setPackageBusy(false);
    }
  };

  const recommendedCount = incident?.resources.filter((r) => r.status === 'RECOMMENDED').length ?? 0;

  return (
    <section className="response-orchestrator panel-surface">
      <div className="response-head">
        <div>
          <div className="response-kicker"><Zap className="w-3.5 h-3.5" /> RESPONSE ORCHESTRATOR</div>
          <div className="response-sub">Decision → priority → evidence package → response workflow</div>
        </div>
        <span className={`response-state ${message.includes('FAILED') ? 'bad' : message.includes('READY') || message.includes('CREATED') ? 'good' : ''}`}>
          {message}
        </span>
      </div>

      {!event ? (
        <div className="response-empty response-empty-rich">
          <div className="response-empty-copy">
            <div className="response-empty-title"><Shield className="w-4 h-4" /> HISTORICAL REVIEW MODE</div>
            <span>No current NRT event is selected. Operational response actions stay locked; verified historical evidence can still be reviewed.</span>
          </div>
          {historicalSummary?.available && (
            <div className="response-history-strip">
              <div><span>OBSERVATIONS</span><b>{historicalSummary.total_records.toLocaleString()}</b></div>
              <div><span>HIGH CONF.</span><b>{(historicalSummary.high_confidence_70plus_normalized ?? 0).toLocaleString()}</b></div>
              <div><span>REPEAT CELLS</span><b>{(historicalSummary.persistence_cells_ge3_obs_2dates ?? 0).toLocaleString()}</b></div>
              <div><span>PEAK FRP</span><b>{(historicalSummary.frp_max_mw ?? 0).toFixed(1)} MW</b></div>
            </div>
          )}
          <div className="response-empty-actions">
            {onOpenThermalOps && <button className="response-secondary" onClick={onOpenThermalOps}>OPEN THERMAL OPERATIONS</button>}
            {onRefresh && <button className="response-secondary" onClick={onRefresh}>REFRESH NRT</button>}
          </div>
        </div>
      ) : (
        <>
          <div className="response-summary">
            <div><span>EVENT</span><strong>{event.id}</strong></div>
            <div><span>RISK</span><strong className={`risk-${riskLevel.toLowerCase()}`}>{riskScore !== null ? `${riskScore}/100` : riskLevel}</strong></div>
            <div><span>CLASSIFICATION</span><strong>{event.risk_analysis?.classification || 'Thermal Detection'}</strong></div>
          </div>

          {!compact && (
            <div className="response-actions-grid">
              {actions.map((action, index) => {
                const done = executed.includes(action.id);
                return (
                  <button key={action.id} className={`response-action ${done ? 'done' : ''}`} onClick={() => executeAction(action.id)}>
                    <div className="response-action-top">
                      <span className="response-step">0{index + 1}</span>
                      <span className="response-icon">{action.icon}</span>
                      {done && <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400 ml-auto" />}
                    </div>
                    <strong>{action.label}</strong>
                    <span>{action.detail}</span>
                  </button>
                );
              })}
            </div>
          )}

          {/* --- Emergency Response Orchestrator: resource cards --- */}
          <div className="ero-section">
            <div className="ero-head">
              <div>
                <div className="ero-kicker"><ShieldAlert className="w-3.5 h-3.5" /> EMERGENCY RESPONSE ORCHESTRATOR</div>
                <div className="ero-sub">AI-assisted decision support — never contacts real emergency services</div>
              </div>
              {incident && (
                <span className={`ero-overall ${stateClass(incident.overall_status)}`}>{incident.overall_status}</span>
              )}
            </div>

            {incidentLoading && !incident ? (
              <div className="response-empty" style={{ minHeight: 60 }}>LOADING RESOURCE RECOMMENDATIONS…</div>
            ) : incident ? (
              <>
                <div className="ero-grid">
                  {incident.resources.map((r) => {
                    const cardBusy = incidentBusyType === r.type;
                    return (
                      <div key={r.type} className={`ero-card ${stateClass(r.status)}`}>
                        <div className="ero-card-top">
                          <span className="ero-card-title">{RESOURCE_ICONS[r.type]} {r.label}</span>
                          <span className={`ero-badge ${stateClass(r.status)}`}>{r.status}</span>
                        </div>
                        <div className="ero-eta">
                          ETA: {r.eta_minutes != null ? <><b>{r.eta_minutes} min</b> (est.)</> : <b>DATA NOT AVAILABLE</b>}
                        </div>
                        <div className={`ero-reason ${r.recommendation_supported ? '' : 'unsupported'}`}>{r.recommendation}</div>
                        <div className="ero-actions">
                          {r.status === 'RECOMMENDED' && (
                            <>
                              <button className="ero-btn primary" disabled={cardBusy} onClick={() => applyResourceAction(r, STAGE_ACTION[r.type])}>{STAGE_LABEL[r.type]}</button>
                              <button className="ero-btn secondary" disabled={cardBusy} onClick={() => applyResourceAction(r, 'CANCEL')}>DISMISS</button>
                            </>
                          )}
                          {r.status === 'STAGED' && (
                            <>
                              <button className="ero-btn primary" disabled={cardBusy} onClick={() => applyResourceAction(r, 'ACTIVATE')}>ACTIVATE</button>
                              <button className="ero-btn secondary" disabled={cardBusy} onClick={() => applyResourceAction(r, 'RESET')}>RESET UNIT STAGING</button>
                            </>
                          )}
                          {r.status === 'ACTIVATED' && (
                            <>
                              <button className="ero-btn primary" disabled={cardBusy} onClick={() => applyResourceAction(r, 'COMPLETE')}>MARK COMPLETE</button>
                              <button className="ero-btn secondary" disabled={cardBusy} onClick={() => applyResourceAction(r, 'CANCEL')}>CANCEL</button>
                            </>
                          )}
                          {r.status === 'CANCELLED' && (
                            <button className="ero-btn secondary" disabled={cardBusy} onClick={() => applyResourceAction(r, 'RESET')}>RESET UNIT STAGING</button>
                          )}
                          {r.status === 'STANDBY' && !r.recommendation_supported && (
                            <button className="ero-btn secondary" disabled>NO ACTION — INSUFFICIENT EVIDENCE</button>
                          )}
                          {r.status === 'COMPLETED' && (
                            <span className="ero-eta" style={{ display: 'flex', alignItems: 'center', gap: 4 }}><CheckCircle2 className="w-3 h-3 text-emerald-400" /> RESOLVED</span>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>

                {pendingApproval ? (
                  <div className="ero-approval-bar">
                    <span>Approve staging for {recommendedCount} recommended resource{recommendedCount === 1 ? '' : 's'}? This only updates simulated response state{demo ? ' (demo — not persisted)' : ' and persists to the incident record'}.</span>
                    <div className="ero-approval-actions">
                      <button className="ero-btn secondary" onClick={() => setPendingApproval(false)}>CANCEL</button>
                      <button className="ero-btn primary" onClick={confirmExecuteResponse}>CONFIRM</button>
                    </div>
                  </div>
                ) : (
                  <div className="ero-execute-row">
                    <span className="ero-execute-note"><AlertTriangle className="w-3 h-3" /> Decision-support only — approvals stage simulated resources, never real dispatch.</span>
                    <button
                      className="ero-execute-btn"
                      disabled={recommendedCount === 0 || incidentBusyType !== null}
                      onClick={() => setPendingApproval(true)}
                    >
                      EXECUTE RESPONSE {recommendedCount > 0 ? `(${recommendedCount})` : ''}
                    </button>
                  </div>
                )}

                {demo && <div className="ero-demo-note"><AlertTriangle className="w-3 h-3" /> DEMO MODE — resource states are local only and are never written to the database.</div>}
              </>
            ) : (
              <div className="response-empty" style={{ minHeight: 60 }}>RESPONSE RECOMMENDATIONS UNAVAILABLE</div>
            )}
          </div>

          <div className="response-footer">
            <div className="response-note"><AlertTriangle className="w-3 h-3" /> Recommendations are decision-support, not automatic emergency dispatch.</div>
            <button className="response-primary" disabled={packageBusy} onClick={createResponsePackage}>
              {packageBusy ? 'BUILDING…' : demo ? 'CREATE DEMO RESPONSE PACKAGE' : 'CREATE RESPONSE PACKAGE'}
            </button>
          </div>
        </>
      )}
    </section>
  );
};
