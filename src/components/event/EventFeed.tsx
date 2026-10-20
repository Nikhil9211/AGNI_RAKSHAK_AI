import React, { useState, useMemo } from 'react';
import { 
  Flame, 
  Search, 
  Filter, 
  ArrowUpDown, 
  ShieldAlert, 
  Clock, 
  Crosshair,
  Factory,
  Radio,
  ExternalLink
} from 'lucide-react';
import { ThermalEvent, HistoricalFirmsSummary } from '../../types.ts';
import { formatISTTime } from '../../utils/time.ts';

interface EventFeedProps {
  events: ThermalEvent[];
  selectedEvent: ThermalEvent | null;
  onSelectEvent: (event: ThermalEvent) => void;
  isLoading: boolean;
  onRefresh: () => void;
  historicalSummary?: HistoricalFirmsSummary | null;
}

export const EventFeed: React.FC<EventFeedProps> = ({
  events,
  selectedEvent,
  onSelectEvent,
  isLoading,
  onRefresh,
  historicalSummary,
}) => {
  const [searchTerm, setSearchTerm] = useState<string>('');
  const [riskFilter, setRiskFilter] = useState<'ALL' | 'CRITICAL' | 'HIGH' | 'MODERATE' | 'LOW'>('ALL');
  const [sortBy, setSortBy] = useState<'priority' | 'time' | 'frp'>('priority');

  const filteredEvents = useMemo(() => {
    return events
      .filter((ev) => {
        // Search matching
        if (searchTerm.trim()) {
          const term = searchTerm.toLowerCase();
          const matchCoord = `${ev.latitude.toFixed(2)},${ev.longitude.toFixed(2)}`.includes(term);
          const matchId = ev.id.toLowerCase().includes(term);
          const matchClass = ev.risk_analysis?.classification.toLowerCase().includes(term) || false;
          const matchOsm = ev.osm_context?.feature_name.toLowerCase().includes(term) || false;
          if (!matchCoord && !matchId && !matchClass && !matchOsm) return false;
        }

        // Risk filter
        if (riskFilter !== 'ALL') {
          if (ev.risk_analysis?.risk_level !== riskFilter) return false;
        }

        return true;
      })
      .sort((a, b) => {
        if (sortBy === 'priority') {
          const scoreA = a.risk_analysis?.risk_score || 0;
          const scoreB = b.risk_analysis?.risk_score || 0;
          if (scoreB !== scoreA) return scoreB - scoreA;
          return (b.frp || 0) - (a.frp || 0);
        } else if (sortBy === 'frp') {
          return (b.frp || 0) - (a.frp || 0);
        } else {
          return new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime();
        }
      });
  }, [events, searchTerm, riskFilter, sortBy]);

  return (
    <div className="w-full md:w-80 lg:w-84 xl:w-96 bg-[#070e1b] border-r border-cyan-950/80 flex flex-col h-full shrink-0 select-none z-20">
      {/* Header & Stats */}
      <div className="p-3 bg-[#060D19] border-b border-cyan-950/80 space-y-2">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-1.5 font-hud text-xs tracking-wider text-cyan-400 font-bold">
            <Radio className="w-3.5 h-3.5 text-cyan-400 animate-pulse" />
            <span>THERMAL DETECTION FEED</span>
          </div>
          <span className="text-[11px] font-mono px-2 py-0.5 bg-cyan-950/80 border border-cyan-800/60 text-cyan-300 rounded-full font-bold">
            {filteredEvents.length} DETECTIONS
          </span>
        </div>

        {/* Search input */}
        <div className="relative">
          <Search className="w-3.5 h-3.5 absolute left-2.5 top-2 text-slate-500" />
          <input
            type="text"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            placeholder="Search coords, feature, class..."
            className="w-full pl-8 pr-3 py-1 bg-[#091426] border border-cyan-900/60 rounded text-slate-200 text-xs font-mono focus:outline-none focus:border-cyan-500 placeholder:text-slate-500"
          />
          {searchTerm && (
            <button
              onClick={() => setSearchTerm('')}
              className="absolute right-2 top-1.5 text-slate-400 hover:text-white text-xs"
            >
              ×
            </button>
          )}
        </div>

        {/* Filters & Sorting */}
        <div className="flex items-center justify-between gap-1 text-[11px] font-mono">
          {/* Risk Pills */}
          <div className="flex items-center gap-1 overflow-x-auto py-0.5">
            {(['ALL', 'CRITICAL', 'HIGH'] as const).map((lvl) => (
              <button
                key={lvl}
                onClick={() => setRiskFilter(lvl)}
                className={`px-1.5 py-0.5 rounded text-[10px] transition-colors ${
                  riskFilter === lvl
                    ? 'bg-cyan-500/20 text-cyan-300 border border-cyan-500/60 font-bold'
                    : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/40'
                }`}
              >
                {lvl}
              </button>
            ))}
          </div>

          {/* Sort selector */}
          <div className="flex items-center gap-1 text-slate-400 shrink-0">
            <ArrowUpDown className="w-3 h-3 text-cyan-400" />
            <select
              value={sortBy}
              onChange={(e: any) => setSortBy(e.target.value)}
              className="bg-[#091426] border border-cyan-900/60 text-slate-300 text-[10px] rounded px-1 py-0.5 focus:outline-none"
            >
              <option value="priority">Priority</option>
              <option value="frp">Max FRP</option>
              <option value="time">Latest</option>
            </select>
          </div>
        </div>
      </div>

      {/* Feed List */}
      <div className="flex-1 overflow-y-auto divide-y divide-cyan-950/60">
        {isLoading ? (
          <div className="p-8 text-center space-y-2 font-mono text-xs text-slate-400">
            <div className="w-6 h-6 border-2 border-cyan-400 border-t-transparent rounded-full animate-spin mx-auto" />
            <div>FETCHING NASA FIRMS...</div>
          </div>
        ) : filteredEvents.length === 0 ? (
          <div className="p-4 text-center space-y-3 font-mono text-xs text-slate-400">
            <div>
              <ShieldAlert className="w-8 h-8 text-slate-600 mx-auto" />
              <div className="font-bold text-slate-300 mt-1">NO CURRENT FIRMS DETECTIONS</div>
              <p className="text-[11px] text-slate-500 mt-1">
                No active thermal sources are available in the current NRT query window.
              </p>
              <button
                onClick={onRefresh}
                className="px-3 py-1 bg-[#091426] border border-cyan-900 text-cyan-400 rounded text-[11px] hover:border-cyan-500"
              >
                Retry Satellite Query
              </button>
            </div>
            {historicalSummary?.available && (
              <div className="text-left p-2.5 bg-[#071421] border border-orange-900/60 rounded">
                <div className="flex items-center justify-between">
                  <span className="text-[9px] font-bold text-orange-300">NASA FIRMS ARCHIVE</span>
                  <span className="text-[9px] text-slate-600">2022–2024</span>
                </div>
                <div className="grid grid-cols-3 gap-2 mt-2">
                  <div><div className="text-[8px] text-slate-600">OBS</div><div className="text-white font-bold">{historicalSummary.total_records.toLocaleString()}</div></div>
                  <div><div className="text-[8px] text-slate-600">HIGH CONF</div><div className="text-cyan-300 font-bold">{(historicalSummary.high_confidence_70plus_normalized ?? 0).toLocaleString()}</div></div>
                  <div><div className="text-[8px] text-slate-600">PEAK FRP</div><div className="text-orange-300 font-bold">{(historicalSummary.frp_max_mw ?? 0).toFixed(1)}</div></div>
                </div>
                <div className="text-[8px] text-slate-600 mt-1.5">Historical evidence only — not a current alert.</div>
              </div>
            )}
          </div>
        ) : (
          filteredEvents.map((ev) => {
            const isSelected = selectedEvent?.id === ev.id;
            const risk = ev.risk_analysis;
            const score = risk?.risk_score || 0;

            const riskBg = 
              score >= 81 ? 'bg-red-500/10 border-l-2 border-l-red-500' :
              score >= 61 ? 'bg-orange-500/10 border-l-2 border-l-orange-500' :
              score >= 31 ? 'bg-yellow-500/10 border-l-2 border-l-yellow-500' :
              'bg-cyan-500/10 border-l-2 border-l-cyan-500';

            const badgeBg =
              score >= 81 ? 'bg-red-950 text-red-300 border-red-800' :
              score >= 61 ? 'bg-orange-950 text-orange-300 border-orange-800' :
              score >= 31 ? 'bg-yellow-950 text-yellow-300 border-yellow-800' :
              'bg-cyan-950 text-cyan-300 border-cyan-800';

            return (
              <div
                key={ev.id}
                id={`event-item-${ev.id}`}
                onClick={() => onSelectEvent(ev)}
                className={`p-3 cursor-pointer transition-colors ${
                  isSelected ? 'bg-[#0e1e38] ring-1 ring-cyan-500/50' : 'hover:bg-[#09152a]'
                } ${riskBg}`}
              >
                {/* Top Row: Coordinates & Risk Score */}
                <div className="flex items-center justify-between mb-1">
                  <div className="flex items-center gap-1.5">
                    <Crosshair className={`w-3.5 h-3.5 ${isSelected ? 'text-cyan-400 animate-spin' : 'text-slate-500'}`} />
                    <span className="font-mono font-bold text-xs text-white">
                      {ev.latitude.toFixed(3)}°N, {ev.longitude.toFixed(3)}°E
                    </span>
                  </div>

                  <span className={`px-1.5 py-0.5 rounded text-[10px] font-mono font-bold border ${badgeBg}`}>
                    {risk?.risk_level || 'LOW'} ({score}%)
                  </span>
                </div>

                {/* Second Row: Classification */}
                <div className="text-[11px] font-mono text-cyan-300 truncate mb-1.5">
                  {risk?.classification || 'Thermal Detection'}
                </div>

                {/* Third Row: Metrics Grid (FRP, Conf, Sat, Time) */}
                <div className="grid grid-cols-3 gap-1 text-[10px] font-mono text-slate-400 bg-[#050b14]/70 p-1.5 rounded border border-cyan-950">
                  <div>
                    <span className="text-slate-500">FRP: </span>
                    <strong className="text-orange-400 font-semibold">{ev.frp.toFixed(1)} MW</strong>
                  </div>
                  <div>
                    <span className="text-slate-500">CONF: </span>
                    <strong className="text-white">{ev.confidence}%</strong>
                  </div>
                  <div>
                    <span className="text-slate-500">SAT: </span>
                    <strong className="text-slate-300">{ev.satellite}</strong>
                  </div>
                </div>

                {/* Fourth Row: OSM Context badge if verified */}
                {ev.osm_context?.verified && (
                  <div className="mt-1.5 flex items-center gap-1 text-[10px] font-mono text-blue-300 truncate">
                    <Factory className="w-3 h-3 text-blue-400 shrink-0" />
                    <span className="truncate">{ev.osm_context.feature_name} ({ev.osm_context.distance_meters}m)</span>
                  </div>
                )}

                {/* Time & Persistence badge */}
                <div className="mt-1 flex items-center justify-between text-[9px] font-mono text-slate-500">
                  <span className="flex items-center gap-1">
                    <Clock className="w-2.5 h-2.5" />
                    {formatISTTime(ev.timestamp)} · NASA UTC {ev.acq_time}
                  </span>
                  {ev.is_persistent && (
                    <span className="text-amber-400 font-semibold flex items-center gap-0.5">
                      <Flame className="w-2.5 h-2.5 text-amber-500" />
                      PERSISTENT SOURCE
                    </span>
                  )}
                </div>
              </div>
            );
          })
        )}
      </div>
    </div>
  );
};
