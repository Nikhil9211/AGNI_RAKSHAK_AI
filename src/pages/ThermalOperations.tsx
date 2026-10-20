import React from 'react';
import { RefreshCw, Satellite, AlertTriangle } from 'lucide-react';
import { ThermalOperationsMap } from '../components/map/ThermalOperationsMap.tsx';
import { EventFeed } from '../components/event/EventFeed.tsx';
import { IntelligenceHud } from '../components/hud/IntelligenceHud.tsx';
import { TelemetryBottom } from '../components/hud/TelemetryBottom.tsx';
import { ThermalEvent, PersistentSource, Region, FirmsStatus, HistoricalFirmsSummary } from '../types.ts';

interface ThermalOperationsProps {
  events: ThermalEvent[];
  selectedEvent: ThermalEvent | null;
  onSelectEvent: (event: ThermalEvent) => void;
  persistentSources: PersistentSource[];
  region: Region;
  firmsStatus: FirmsStatus | null;
  isLoading: boolean;
  onRefresh: () => void;
  onAlertCreated: () => void;
  onRefreshEvent: (eventId: string) => void;
  queryDays: number;
  querySensor: 'ALL' | 'NOAA20' | 'NOAA21' | 'SNPP' | 'MODIS';
  onQueryChange: (days: number, sensor: 'ALL' | 'NOAA20' | 'NOAA21' | 'SNPP' | 'MODIS') => void;
  dataError: string | null;
  historicalSummary: HistoricalFirmsSummary | null;
}

export const ThermalOperations: React.FC<ThermalOperationsProps> = ({
  events,
  selectedEvent,
  onSelectEvent,
  persistentSources,
  region,
  firmsStatus,
  isLoading,
  onRefresh,
  onAlertCreated,
  onRefreshEvent,
  queryDays,
  querySensor,
  onQueryChange,
  dataError,
  historicalSummary,
}) => {
  const wmsHoursValue = queryDays === 7 ? 7 : queryDays === 3 ? 72 : queryDays === 2 ? 48 : 24;

  return (
    <div className="flex-1 min-h-0 flex flex-col overflow-hidden bg-[#050B14]">
      {/* Compact FIRMS query bar: controls affect the real backend query on the next sync. */}
      <div className="shrink-0 border-b border-cyan-950/80 bg-[#060D19] px-3 py-2 flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2 text-[10px] font-mono">
          <Satellite className="w-3.5 h-3.5 text-orange-400" />
          <span className="text-slate-300 font-bold tracking-wider">NASA FIRMS WMS INTEL</span>
          <span className="text-slate-600">|</span>
          <span className="text-cyan-300 font-bold">{queryDays === 7 ? '7D' : `${queryDays * 24}H`}</span>
          <span className="text-slate-400">
            {querySensor === 'ALL' ? 'NOAA-20 + NOAA-21 + S-NPP + MODIS' : 
             querySensor === 'NOAA20' ? 'NOAA-20 VIIRS' : 
             querySensor === 'NOAA21' ? 'NOAA-21 VIIRS' : 
             querySensor === 'SNPP' ? 'Suomi-NPP VIIRS' : 'Terra/Aqua MODIS'}
          </span>
        </div>
        <div className="flex items-center gap-1.5">
          <select 
            value={queryDays} 
            onChange={(e) => onQueryChange(Number(e.target.value), querySensor)} 
            className="bg-[#091426] border border-cyan-900/60 text-slate-300 text-[10px] rounded px-2 py-1 outline-none"
          >
            <option value={1}>24H (1 Day)</option>
            <option value={2}>48H (2 Days)</option>
            <option value={3}>72H (3 Days)</option>
            <option value={7}>7D (1 Week)</option>
          </select>
          <select 
            value={querySensor} 
            onChange={(e) => onQueryChange(queryDays, e.target.value as any)} 
            className="bg-[#091426] border border-cyan-900/60 text-slate-300 text-[10px] rounded px-2 py-1 outline-none"
          >
            <option value="ALL">ALL SENSORS</option>
            <option value="NOAA20">NOAA-20 VIIRS</option>
            <option value="NOAA21">NOAA-21 VIIRS</option>
            <option value="SNPP">Suomi-NPP VIIRS</option>
            <option value="MODIS">MODIS C6.1</option>
          </select>
          <button onClick={onRefresh} className="px-2.5 py-1 bg-[#091426] border border-cyan-900/60 text-cyan-300 hover:border-cyan-500 rounded text-[10px] flex items-center gap-1 font-mono">
            <RefreshCw className="w-3 h-3" /> SYNC
          </button>
          {dataError && <span title={dataError}><AlertTriangle className="w-3.5 h-3.5 text-red-400" /></span>}
        </div>
      </div>

      {/* 3-Column Tactical Layout */}
      <div className="flex-1 min-h-0 flex overflow-hidden">
        {/* LEFT: Compact Intelligence / Event Feed */}
        <EventFeed
          events={events}
          selectedEvent={selectedEvent}
          onSelectEvent={onSelectEvent}
          isLoading={isLoading}
          onRefresh={onRefresh}
          historicalSummary={historicalSummary}
        />

        {/* CENTER: Flagship Thermal Intelligence Map (Zoom Earth inspired visual style, real NASA FIRMS WMS data) */}
        <div className="flex-1 relative h-full">
          <ThermalOperationsMap
            events={events}
            selectedEvent={selectedEvent}
            onSelectEvent={onSelectEvent}
            persistentSources={persistentSources}
            region={region}
            wmsHours={wmsHoursValue}
            wmsSensor={querySensor}
            onTimeSensorChange={(hours, sensor) => {
              const days = hours === 7 ? 7 : hours === 72 ? 3 : hours === 48 ? 2 : 1;
              onQueryChange(days, sensor);
            }}
          />
        </div>

        {/* RIGHT: Event Intelligence HUD */}
        <IntelligenceHud
          selectedEvent={selectedEvent}
          onAlertCreated={onAlertCreated}
          onRefreshEvent={onRefreshEvent}
          historicalSummary={historicalSummary}
        />
      </div>

      {/* BOTTOM: Compact Analytics + System Telemetry */}
      <TelemetryBottom
        events={events}
        persistentSources={persistentSources}
        firmsStatus={firmsStatus}
      />
    </div>
  );
};
