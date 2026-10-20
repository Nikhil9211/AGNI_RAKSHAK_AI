import React, { useState, useEffect, useCallback } from 'react';
import { Header } from './components/layout/Header.tsx';
import { SystemModal } from './components/layout/SystemModal.tsx';
import { CommandCenter } from './pages/CommandCenter.tsx';
import { ThermalOperations } from './pages/ThermalOperations.tsx';
import { Intelligence } from './pages/Intelligence.tsx';
import { Alerts } from './pages/Alerts.tsx';
import { ThermalEvent, PersistentSource, Alert, Region, FirmsStatus, HistoricalFirmsSummary } from './types.ts';
import { api } from './services/api.ts';
import { createPresentationDemoSnapshot } from './demoSnapshot.ts';

export default function App() {
  const [currentScreen, setCurrentScreen] = useState<'COMMAND_CENTER' | 'THERMAL_OPERATIONS' | 'INTELLIGENCE' | 'ALERTS'>('COMMAND_CENTER');
  const [currentRegion, setCurrentRegion] = useState<Region>('JHANSI');
  
  const [events, setEvents] = useState<ThermalEvent[]>([]);
  const [selectedEvent, setSelectedEvent] = useState<ThermalEvent | null>(null);
  const [persistentSources, setPersistentSources] = useState<PersistentSource[]>([]);
  const [alerts, setAlerts] = useState<Alert[]>([]);
  const [firmsStatus, setFirmsStatus] = useState<FirmsStatus | null>(null);
  const [historicalSummary, setHistoricalSummary] = useState<HistoricalFirmsSummary | null>(null);
  const [queryDays, setQueryDays] = useState<number>(1);
  const [querySensor, setQuerySensor] = useState<'ALL' | 'NOAA20' | 'NOAA21' | 'SNPP' | 'MODIS'>('ALL');
  const [dataError, setDataError] = useState<string | null>(null);
  const [demoSnapshot] = useState(() => new URLSearchParams(window.location.search).get('demo') === '1' ? createPresentationDemoSnapshot() : null);
  const isPresentationDemo = Boolean(demoSnapshot);
  
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [isRefreshing, setIsRefreshing] = useState<boolean>(false);
  const [systemModalOpen, setSystemModalOpen] = useState<boolean>(false);
  const [systemModalTab, setSystemModalTab] = useState<'sources' | 'health' | 'settings'>('sources');

  // Load data for selected region
  const loadData = useCallback(async (refresh: boolean = false) => {
    if (isPresentationDemo && demoSnapshot) {
      setEvents(demoSnapshot.events);
      setPersistentSources(demoSnapshot.persistentSources as any);
      setAlerts(demoSnapshot.alerts);
      setFirmsStatus({ available: true, has_api_key: true, last_successful_fetch: new Date().toISOString(), last_error: null, active_source: 'PRESENTATION DEMO', total_events_in_db: demoSnapshot.events.length, total_persistent_sources: demoSnapshot.persistentSources.length, total_active_alerts: demoSnapshot.alerts.length, cache_age_seconds: 0, latency_ms: 12 });
      setHistoricalSummary(null);
      setDataError(null);
      setSelectedEvent(demoSnapshot.events[0] || null);
      setIsLoading(false);
      setIsRefreshing(false);
      return;
    }
    if (refresh) setIsRefreshing(true);
    else setIsLoading(true);

    // Keep each data source independent: historical evidence should remain visible
    // even when the current FIRMS NRT service is temporarily unavailable.
    const [eventsResult, persistenceResult, alertsResult, statusResult, historyResult] = await Promise.allSettled([
      api.getEvents(currentRegion, refresh, queryDays, querySensor),
      api.getPersistentSources(currentRegion),
      api.getAlerts(currentRegion),
      api.getFirmsStatus(),
      api.getHistoricalFirmsSummary(currentRegion),
    ]);

    if (eventsResult.status === 'fulfilled') {
      const eventsRes = eventsResult.value;
      setDataError(eventsRes.error || null);
      setEvents(eventsRes.events || []);
      if (eventsRes.events && eventsRes.events.length > 0) {
        setSelectedEvent((prev) => {
          if (prev && eventsRes.events.some((e) => e.id === prev.id)) return prev;
          return [...eventsRes.events].sort(
            (a, b) => (b.risk_analysis?.risk_score || 0) - (a.risk_analysis?.risk_score || 0)
          )[0];
        });
      } else {
        setSelectedEvent(null);
      }
    } else {
      const reason = eventsResult.reason instanceof Error ? eventsResult.reason.message : 'NASA FIRMS data unavailable';
      setDataError(reason);
      setEvents([]);
      setSelectedEvent(null);
    }

    if (persistenceResult.status === 'fulfilled') {
      setPersistentSources(persistenceResult.value.sources || []);
    } else {
      console.warn('Persistence sync failed:', persistenceResult.reason);
      setPersistentSources([]);
    }

    if (alertsResult.status === 'fulfilled') {
      setAlerts(alertsResult.value.alerts || []);
    } else {
      console.warn('Alert sync failed:', alertsResult.reason);
      setAlerts([]);
    }

    if (statusResult.status === 'fulfilled') {
      setFirmsStatus(statusResult.value);
    } else {
      console.warn('FIRMS status sync failed:', statusResult.reason);
    }

    if (historyResult.status === 'fulfilled') {
      setHistoricalSummary(historyResult.value as HistoricalFirmsSummary);
    } else {
      console.warn('Historical FIRMS summary unavailable:', historyResult.reason);
      setHistoricalSummary(null);
    }

    setIsLoading(false);
    setIsRefreshing(false);
  }, [currentRegion, queryDays, querySensor, isPresentationDemo, demoSnapshot]);

  useEffect(() => {
    loadData(false);
    const timer = window.setInterval(() => {
      loadData(true);
    }, 15 * 60 * 1000);
    return () => window.clearInterval(timer);
  }, [loadData]);

  // Handle manual single event refresh / note update
  const handleRefreshEvent = async (eventId: string) => {
    try {
      const { event } = await api.getEventById(eventId);
      setSelectedEvent(event);
      setEvents((prev) => prev.map((e) => (e.id === event.id ? event : e)));
    } catch (e) {
      console.warn(e);
    }
  };

  const handleSelectEventById = (eventId: string) => {
    const found = events.find((e) => e.id === eventId);
    if (found) {
      setSelectedEvent(found);
    } else {
      api.getEventById(eventId).then(({ event }) => {
        setSelectedEvent(event);
      }).catch(console.warn);
    }
  };

  const activeAlertsCount = alerts.filter(
    (a) => a.status === 'NEW' || a.status === 'INVESTIGATING'
  ).length;

  return (
    <div className="agni-red-theme flex flex-col h-screen w-screen bg-[#050B14] text-slate-100 overflow-hidden select-none">
      {/* Top Header & Telemetry Navigation */}
      <Header
        currentScreen={currentScreen}
        setScreen={setCurrentScreen}
        currentRegion={currentRegion}
        setRegion={(r) => {
          setCurrentRegion(r);
        }}
        firmsStatus={firmsStatus}
        activeAlertsCount={activeAlertsCount}
        onRefresh={() => loadData(true)}
        isRefreshing={isRefreshing}
        onOpenSystemModal={(tab) => {
          setSystemModalTab(tab || 'sources');
          setSystemModalOpen(true);
        }}
      />

      {isPresentationDemo && <div className="demo-global-banner">PRESENTATION SNAPSHOT · SIMULATED DATA · NOT NASA LIVE DATA</div>}

      {/* Screen Views */}
      <main className="flex-1 flex flex-col overflow-hidden relative">
        {currentScreen === 'COMMAND_CENTER' && (
          <CommandCenter
            events={events}
            alerts={alerts}
            persistentSources={persistentSources}
            region={currentRegion}
            firmsStatus={firmsStatus}
            onSelectEvent={(ev) => setSelectedEvent(ev)}
            onNavigateScreen={setCurrentScreen}
            historicalSummary={historicalSummary}
          />
        )}

        {currentScreen === 'THERMAL_OPERATIONS' && (
          <ThermalOperations
            events={events}
            selectedEvent={selectedEvent}
            onSelectEvent={(ev) => setSelectedEvent(ev)}
            persistentSources={persistentSources}
            region={currentRegion}
            firmsStatus={firmsStatus}
            isLoading={isLoading}
            onRefresh={() => loadData(true)}
            queryDays={queryDays}
            querySensor={querySensor}
            onQueryChange={(days, sensor) => {
              setQueryDays(days);
              setQuerySensor(sensor);
            }}
            dataError={dataError}
            historicalSummary={historicalSummary}
            onAlertCreated={() => {
              api.getAlerts(currentRegion).then((res) => setAlerts(res.alerts));
            }}
            onRefreshEvent={handleRefreshEvent}
          />
        )}

        {currentScreen === 'INTELLIGENCE' && (
          <Intelligence
            events={events}
            persistentSources={persistentSources}
            region={currentRegion}
            onSelectEvent={(ev) => setSelectedEvent(ev)}
            onNavigateToThermalOps={() => setCurrentScreen('THERMAL_OPERATIONS')}
            selectedEvent={selectedEvent}
            historicalSummary={historicalSummary}
            onAlertCreated={() => {
              api.getAlerts(currentRegion).then((res) => setAlerts(res.alerts));
            }}
            onRefreshCurrentData={() => loadData(true)}
          />
        )}

        {currentScreen === 'ALERTS' && (
          <Alerts
            alerts={alerts}
            region={currentRegion}
            onRefreshAlerts={() => {
              api.getAlerts(currentRegion).then((res) => setAlerts(res.alerts));
            }}
            onSelectEventById={handleSelectEventById}
            onNavigateToThermalOps={() => setCurrentScreen('THERMAL_OPERATIONS')}
          />
        )}
      </main>

      {/* Data Sources / Health / Settings Modal */}
      <SystemModal
        isOpen={systemModalOpen}
        onClose={() => setSystemModalOpen(false)}
        defaultTab={systemModalTab}
        firmsStatus={firmsStatus}
        onRefreshFirms={() => loadData(true)}
      />
    </div>
  );
}
