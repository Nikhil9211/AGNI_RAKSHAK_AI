import React, { useState, useEffect } from 'react';
import { 
  Flame, 
  Satellite, 
  Layers, 
  ShieldAlert, 
  Settings, 
  RefreshCw, 
  Activity, 
  MapPin, 
  Radio
} from 'lucide-react';
import { Region, FirmsStatus } from '../../types.ts';
import { formatISTDateTime } from '../../utils/time.ts';

interface HeaderProps {
  currentScreen: 'COMMAND_CENTER' | 'THERMAL_OPERATIONS' | 'INTELLIGENCE' | 'ALERTS';
  setScreen: (screen: 'COMMAND_CENTER' | 'THERMAL_OPERATIONS' | 'INTELLIGENCE' | 'ALERTS') => void;
  currentRegion: Region;
  setRegion: (region: Region) => void;
  firmsStatus: FirmsStatus | null;
  activeAlertsCount: number;
  onRefresh: () => void;
  isRefreshing: boolean;
  onOpenSystemModal: (tab?: 'sources' | 'health' | 'settings') => void;
}

export const Header: React.FC<HeaderProps> = ({
  currentScreen,
  setScreen,
  currentRegion,
  setRegion,
  firmsStatus,
  activeAlertsCount,
  onRefresh,
  isRefreshing,
  onOpenSystemModal,
}) => {
  const [istTime, setIstTime] = useState<string>('');

  useEffect(() => {
    const updateTime = () => {
      setIstTime(formatISTDateTime(new Date()));
    };
    updateTime();
    const interval = setInterval(updateTime, 1000);
    return () => clearInterval(interval);
  }, []);

  return (
    <header className="h-14 bg-[#070E1A] border-b border-cyan-950/80 px-3 flex items-center justify-between z-30 shrink-0 select-none">
      {/* Left: Brand & Telemetry */}
      <div className="flex items-center gap-3">
        <div className="flex items-center gap-2">
          <div className="w-8 h-8 rounded bg-gradient-to-br from-amber-500/20 via-orange-600/30 to-red-700/40 border border-orange-500/50 flex items-center justify-center relative">
            <Flame className="w-5 h-5 text-orange-400" />
            <span className="absolute -top-0.5 -right-0.5 w-2 h-2 rounded-full bg-cyan-400 animate-ping" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h1 className="font-hud text-base tracking-wider font-bold text-white flex items-center gap-1.5">
                AGNI RAKSHAK <span className="text-cyan-400 font-normal">AI</span>
              </h1>
              <span className="text-[10px] font-mono px-1.5 py-0.2 bg-cyan-950/70 border border-cyan-800/60 text-cyan-300 rounded">
                SIH 26162
              </span>
            </div>
            <div className="text-[10px] font-mono text-slate-400 leading-none">
              Thermal Source & Industrial Fire Intelligence
            </div>
          </div>
        </div>

        {/* Vertical Divider */}
        <div className="h-7 w-px bg-cyan-950/70 mx-1" />

        {/* Region Selector */}
        <div className="flex items-center bg-[#091426] border border-cyan-900/60 rounded p-0.5">
          {(['JHANSI', 'INDIA', 'GLOBAL'] as Region[]).map((r) => {
            const isActive = currentRegion === r;
            return (
              <button
                key={r}
                id={`region-select-${r.toLowerCase()}`}
                onClick={() => setRegion(r)}
                className={`px-2.5 py-1 text-xs font-mono font-semibold transition-colors rounded ${
                  isActive
                    ? 'bg-cyan-500/20 text-cyan-300 border border-cyan-500/40 shadow-sm'
                    : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/40'
                }`}
              >
                <div className="flex items-center gap-1">
                  <MapPin className={`w-3 h-3 ${isActive ? 'text-cyan-400' : 'text-slate-500'}`} />
                  <span>{r}</span>
                </div>
              </button>
            );
          })}
        </div>
      </div>

      {/* Center: Navigation Tabs */}
      <nav className="flex items-center gap-1 bg-[#091426] border border-cyan-900/60 rounded p-0.5">
        <button
          id="nav-command-center"
          onClick={() => setScreen('COMMAND_CENTER')}
          className={`px-3 py-1.5 text-xs font-hud tracking-wider transition-all rounded flex items-center gap-1.5 ${
            currentScreen === 'COMMAND_CENTER'
              ? 'bg-cyan-500/20 text-cyan-300 border border-cyan-500/50 shadow-sm'
              : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/40'
          }`}
        >
          <Activity className="w-3.5 h-3.5" />
          <span>COMMAND CENTER</span>
        </button>

        <button
          id="nav-thermal-operations"
          onClick={() => setScreen('THERMAL_OPERATIONS')}
          className={`px-3 py-1.5 text-xs font-hud tracking-wider transition-all rounded flex items-center gap-1.5 ${
            currentScreen === 'THERMAL_OPERATIONS'
              ? 'bg-orange-500/20 text-orange-300 border border-orange-500/50 shadow-sm'
              : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/40'
          }`}
        >
          <Flame className="w-3.5 h-3.5 text-orange-400" />
          <span>THERMAL OPERATIONS</span>
        </button>

        <button
          id="nav-intelligence"
          onClick={() => setScreen('INTELLIGENCE')}
          className={`px-3 py-1.5 text-xs font-hud tracking-wider transition-all rounded flex items-center gap-1.5 ${
            currentScreen === 'INTELLIGENCE'
              ? 'bg-cyan-500/20 text-cyan-300 border border-cyan-500/50 shadow-sm'
              : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/40'
          }`}
        >
          <Layers className="w-3.5 h-3.5" />
          <span>INTELLIGENCE</span>
        </button>

        <button
          id="nav-alerts"
          onClick={() => setScreen('ALERTS')}
          className={`px-3 py-1.5 text-xs font-hud tracking-wider transition-all rounded flex items-center gap-1.5 relative ${
            currentScreen === 'ALERTS'
              ? 'bg-red-500/20 text-red-300 border border-red-500/50 shadow-sm'
              : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/40'
          }`}
        >
          <ShieldAlert className="w-3.5 h-3.5 text-red-400" />
          <span>ALERTS</span>
          {activeAlertsCount > 0 && (
            <span className="px-1.5 py-0.2 text-[10px] font-mono font-bold bg-red-600 text-white rounded-full">
              {activeAlertsCount}
            </span>
          )}
        </button>
      </nav>

      {/* Right: Telemetry & Actions */}
      <div className="flex items-center gap-3 font-mono text-xs">
        {/* IST Clock */}
        <div className="text-right hidden md:block">
          <div className="text-[11px] text-cyan-400 font-mono tracking-wide flex items-center gap-1">
            <Radio className="w-3 h-3 text-cyan-400 animate-pulse" />
            {istTime || 'SYNCING IST...'}
          </div>
          <div className="text-[9px] text-slate-400 flex items-center justify-end gap-1.5">
            <span className="flex items-center gap-1">
              <Satellite className="w-2.5 h-2.5 text-emerald-400" />
              NOAA-20 / NOAA-21 / S-NPP
            </span>
            <span className="w-1 h-1 rounded-full bg-slate-600" />
            <span className="text-emerald-400 font-semibold">IST</span>
          </div>
        </div>

        {/* Refresh Button */}
        <button
          id="btn-firms-refresh"
          title="Query NASA FIRMS NRT Feed"
          onClick={onRefresh}
          disabled={isRefreshing}
          className="p-1.5 bg-[#091426] border border-cyan-900/60 hover:border-cyan-500 text-cyan-400 rounded transition-all disabled:opacity-50 flex items-center gap-1"
        >
          <RefreshCw className={`w-3.5 h-3.5 ${isRefreshing ? 'animate-spin text-cyan-300' : ''}`} />
          <span className="text-[10px] hidden sm:inline">{isRefreshing ? 'FETCHING...' : 'SYNC'}</span>
        </button>

        {/* System Settings & Health Menu */}
        <div className="flex items-center bg-[#091426] border border-cyan-900/60 rounded p-0.5">
          <button
            id="btn-system-sources"
            title="Data Sources"
            onClick={() => onOpenSystemModal('sources')}
            className="px-2 py-1 text-[11px] text-slate-400 hover:text-cyan-300 hover:bg-slate-800/40 rounded flex items-center gap-1"
          >
            <Satellite className="w-3 h-3" />
            <span className="hidden lg:inline">Sources</span>
          </button>
          <button
            id="btn-system-health"
            title="System Health"
            onClick={() => onOpenSystemModal('health')}
            className="px-2 py-1 text-[11px] text-slate-400 hover:text-cyan-300 hover:bg-slate-800/40 rounded flex items-center gap-1"
          >
            <Activity className="w-3 h-3 text-emerald-400" />
            <span className="hidden lg:inline">Health</span>
          </button>
          <button
            id="btn-system-settings"
            title="Settings & API Key"
            onClick={() => onOpenSystemModal('settings')}
            className="px-2 py-1 text-[11px] text-slate-400 hover:text-cyan-300 hover:bg-slate-800/40 rounded flex items-center gap-1"
          >
            <Settings className="w-3 h-3" />
          </button>
        </div>
      </div>
    </header>
  );
};
