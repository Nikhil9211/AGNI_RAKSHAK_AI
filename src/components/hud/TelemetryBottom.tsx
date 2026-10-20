import React from 'react';
import { 
  Flame, 
  Satellite, 
  Activity, 
  ShieldCheck, 
  Sun, 
  Moon, 
  Radio, 
  Layers
} from 'lucide-react';
import { ThermalEvent, PersistentSource, FirmsStatus } from '../../types.ts';

interface TelemetryBottomProps {
  events: ThermalEvent[];
  persistentSources: PersistentSource[];
  firmsStatus: FirmsStatus | null;
}

export const TelemetryBottom: React.FC<TelemetryBottomProps> = ({
  events,
  persistentSources,
  firmsStatus,
}) => {
  const totalFRP = events.reduce((sum, e) => sum + (e.frp || 0), 0);
  const avgFRP = events.length > 0 ? totalFRP / events.length : 0;
  const maxFRP = events.length > 0 ? Math.max(...events.map((e) => e.frp || 0)) : 0;

  const dayCount = events.filter((e) => e.daynight === 'D').length;
  const nightCount = events.filter((e) => e.daynight === 'N').length;

  const satCounts: Record<string, number> = {};
  events.forEach((e) => {
    const s = e.satellite || 'VIIRS';
    satCounts[s] = (satCounts[s] || 0) + 1;
  });

  const avgConfidence =
    events.length > 0
      ? Math.round(events.reduce((sum, e) => sum + (e.confidence || 0), 0) / events.length)
      : 0;

  return (
    <div className="h-10 bg-[#060D19] border-t border-cyan-950/80 px-4 flex items-center justify-between text-xs font-mono text-slate-300 z-20 shrink-0 select-none overflow-x-auto">
      {/* Group 1: Radiative Energy */}
      <div className="flex items-center gap-4 shrink-0">
        <div className="flex items-center gap-1.5 text-orange-400">
          <Flame className="w-3.5 h-3.5 text-orange-400" />
          <span className="text-[10px] text-slate-500">AVG FRP:</span>
          <strong className="text-white">{avgFRP.toFixed(1)} MW</strong>
        </div>

        <div className="flex items-center gap-1.5">
          <span className="text-[10px] text-slate-500">MAX FRP:</span>
          <strong className="text-orange-400">{maxFRP.toFixed(1)} MW</strong>
        </div>

        <div className="flex items-center gap-1.5">
          <span className="text-[10px] text-slate-500">TOTAL ENERGY:</span>
          <strong className="text-amber-300">{totalFRP.toFixed(0)} MW</strong>
        </div>
      </div>

      <div className="h-4 w-px bg-cyan-950/80 mx-2 hidden sm:block" />

      {/* Group 2: Satellite Constellation */}
      <div className="flex items-center gap-3 shrink-0 hidden md:flex">
        <div className="flex items-center gap-1 text-slate-400">
          <Satellite className="w-3.5 h-3.5 text-cyan-400" />
          <span className="text-[10px] text-slate-500">SENSORS:</span>
          <span className="text-slate-200">
            {Object.entries(satCounts)
              .map(([sat, count]) => `${sat} (${count})`)
              .join(' · ') || 'NOAA-20 NRT'}
          </span>
        </div>

        <div className="flex items-center gap-2 text-[10px]">
          <span className="flex items-center gap-0.5 text-amber-300">
            <Sun className="w-3 h-3 text-amber-400" /> {dayCount}
          </span>
          <span className="flex items-center gap-0.5 text-indigo-300">
            <Moon className="w-3 h-3 text-indigo-400" /> {nightCount}
          </span>
        </div>
      </div>

      <div className="h-4 w-px bg-cyan-950/80 mx-2 hidden lg:block" />

      {/* Group 3: Confidence & Persistence */}
      <div className="flex items-center gap-4 shrink-0">
        <div className="flex items-center gap-1.5">
          <ShieldCheck className="w-3.5 h-3.5 text-emerald-400" />
          <span className="text-[10px] text-slate-500">MEAN SENSOR CONF:</span>
          <strong className="text-emerald-300">{avgConfidence}%</strong>
        </div>

        <div className="flex items-center gap-1.5">
          <Layers className="w-3.5 h-3.5 text-amber-400" />
          <span className="text-[10px] text-slate-500">PERSISTENT CLUSTERS:</span>
          <strong className="text-amber-400">{persistentSources.length}</strong>
        </div>

        <div className="flex items-center gap-1.5 text-[10px]">
          <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
          <span className="text-slate-400">STATUS:</span>
          <span className="text-emerald-400 font-semibold">
            {firmsStatus?.available ? 'STREAM ACTIVE' : 'OPEN NRT SYNC'}
          </span>
        </div>
      </div>
    </div>
  );
};
