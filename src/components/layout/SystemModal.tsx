import React, { useState, useEffect } from 'react';
import { 
  X, 
  Satellite, 
  Activity, 
  Settings, 
  Key, 
  Database, 
  CheckCircle2, 
  AlertTriangle, 
  Clock, 
  ShieldCheck, 
  Server
} from 'lucide-react';
import { FirmsStatus, FetchLog } from '../../types.ts';
import { formatISTTime } from '../../utils/time.ts';
import { api } from '../../services/api.ts';

interface SystemModalProps {
  isOpen: boolean;
  onClose: () => void;
  defaultTab?: 'sources' | 'health' | 'settings';
  firmsStatus: FirmsStatus | null;
  onRefreshFirms: () => void;
}

export const SystemModal: React.FC<SystemModalProps> = ({
  isOpen,
  onClose,
  defaultTab = 'sources',
  firmsStatus,
  onRefreshFirms,
}) => {
  const [activeTab, setActiveTab] = useState<'sources' | 'health' | 'settings'>(defaultTab);
  const [fetchLogs, setFetchLogs] = useState<FetchLog[]>([]);
  const [stats, setStats] = useState<any>(null);

  useEffect(() => {
    setActiveTab(defaultTab);
  }, [defaultTab]);

  useEffect(() => {
    if (isOpen) {
      loadDetails();
    }
  }, [isOpen]);

  const loadDetails = async () => {
    try {
      const s = await api.getStats();
      setStats(s);
    } catch (e) {
      console.warn(e);
    }
  };


  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-xs p-4 animate-in fade-in duration-150">
      <div className="w-full max-w-3xl bg-[#091120] border border-cyan-900/80 rounded-lg shadow-2xl overflow-hidden flex flex-col max-h-[85vh]">
        {/* Header */}
        <div className="px-4 py-3 bg-[#060D19] border-b border-cyan-950 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Server className="w-4 h-4 text-cyan-400" />
            <span className="font-hud text-sm tracking-wider font-bold text-white uppercase">
              AGNI RAKSHAK System Telemetry & Configuration
            </span>
          </div>
          <button
            onClick={onClose}
            className="p-1 text-slate-400 hover:text-white rounded hover:bg-slate-800"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Tab Navigation */}
        <div className="flex border-b border-cyan-950 bg-[#070e1b] px-4 gap-2">
          <button
            onClick={() => setActiveTab('sources')}
            className={`py-2 px-3 text-xs font-mono font-medium border-b-2 flex items-center gap-1.5 transition-colors ${
              activeTab === 'sources'
                ? 'border-cyan-400 text-cyan-300'
                : 'border-transparent text-slate-400 hover:text-slate-200'
            }`}
          >
            <Satellite className="w-3.5 h-3.5" />
            Data Sources
          </button>
          <button
            onClick={() => setActiveTab('health')}
            className={`py-2 px-3 text-xs font-mono font-medium border-b-2 flex items-center gap-1.5 transition-colors ${
              activeTab === 'health'
                ? 'border-cyan-400 text-cyan-300'
                : 'border-transparent text-slate-400 hover:text-slate-200'
            }`}
          >
            <Activity className="w-3.5 h-3.5 text-emerald-400" />
            System Health
          </button>
          <button
            onClick={() => setActiveTab('settings')}
            className={`py-2 px-3 text-xs font-mono font-medium border-b-2 flex items-center gap-1.5 transition-colors ${
              activeTab === 'settings'
                ? 'border-cyan-400 text-cyan-300'
                : 'border-transparent text-slate-400 hover:text-slate-200'
            }`}
          >
            <Settings className="w-3.5 h-3.5" />
            Settings & API Key
          </button>
        </div>

        {/* Content Body */}
        <div className="p-4 overflow-y-auto font-mono text-xs text-slate-300 space-y-4">
          {/* TAB 1: DATA SOURCES */}
          {activeTab === 'sources' && (
            <div className="space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                {/* NASA FIRMS card */}
                <div className="p-3 bg-[#0c1628] border border-cyan-900/60 rounded">
                  <div className="flex items-center justify-between mb-2">
                    <div className="flex items-center gap-1.5 text-cyan-400 font-bold font-hud tracking-wide">
                      <Satellite className="w-4 h-4" />
                      NASA FIRMS NRT
                    </div>
                    <span className={`px-2 py-0.5 rounded text-[10px] ${
                      firmsStatus?.available ? 'bg-emerald-950 text-emerald-300 border border-emerald-800' : 'bg-amber-950 text-amber-300 border border-amber-800'
                    }`}>
                      {firmsStatus?.available ? 'OPERATIONAL' : 'STATUS PENDING'}
                    </span>
                  </div>
                  <div className="space-y-1.5 text-[11px] text-slate-300">
                    <div className="flex justify-between">
                      <span className="text-slate-400">Primary Sensors:</span>
                      <span className="text-white">VIIRS NOAA-20 & NOAA-21</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-slate-400">Secondary Sensor:</span>
                      <span className="text-white">MODIS (Terra/Aqua)</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-slate-400">API Key Configured:</span>
                      <span className={firmsStatus?.has_api_key ? 'text-emerald-400' : 'text-amber-400'}>
                        {firmsStatus?.has_api_key ? 'Configured' : 'Not configured'}
                      </span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-slate-400">WMS Thermal Layer:</span>
                      <span className="text-cyan-400">NASA FIRMS WMS v2 (EPSG:3857)</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-slate-400">Last Successful Sync:</span>
                      <span className="text-slate-200">{firmsStatus?.last_successful_fetch ? formatISTTime(firmsStatus.last_successful_fetch) : 'Awaiting sync'}</span>
                    </div>
                  </div>
                </div>

                {/* OpenStreetMap card */}
                <div className="p-3 bg-[#0c1628] border border-cyan-900/60 rounded">
                  <div className="flex items-center justify-between mb-2">
                    <div className="flex items-center gap-1.5 text-cyan-400 font-bold font-hud tracking-wide">
                      <Database className="w-4 h-4" />
                      OpenStreetMap Overpass
                    </div>
                    <span className="px-2 py-0.5 rounded text-[10px] bg-emerald-950 text-emerald-300 border border-emerald-800">
                      LIVE QUERIES
                    </span>
                  </div>
                  <div className="space-y-1.5 text-[11px] text-slate-300">
                    <div className="flex justify-between">
                      <span className="text-slate-400">Feature Search Radius:</span>
                      <span className="text-white">3,000 meters</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-slate-400">Target Categories:</span>
                      <span className="text-white">industrial, power, works, kilns</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-slate-400">Cached Features in DB:</span>
                      <span className="text-cyan-400">{stats?.cached_osm_features || 0}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-slate-400">Fallback Strategy:</span>
                      <span className="text-slate-200">Local spatial cache + fallback mirrors</span>
                    </div>
                  </div>
                </div>
              </div>

              {/* Provenance Notice */}
              <div className="p-3 bg-cyan-950/30 border border-cyan-800/40 rounded text-[11px] space-y-1">
                <div className="text-cyan-300 font-semibold flex items-center gap-1">
                  <ShieldCheck className="w-3.5 h-3.5" />
                  DATA PROVENANCE POLICY
                </div>
                <p className="text-slate-400">
                  <strong className="text-slate-200">NASA FIRMS</strong> provides raw satellite thermal radiometric observations (FRP, brightness temperature, confidence).
                  <br />
                  <strong className="text-slate-200">OpenStreetMap</strong> provides verified industrial GIS landuse and structures.
                  <br />
                  <strong className="text-cyan-300">AGNI RAKSHAK AI</strong> combines these sources to generate rule-assisted explainable risk scoring, persistence clusters, and incident alerts.
                </p>
              </div>
            </div>
          )}

          {/* TAB 2: SYSTEM HEALTH */}
          {activeTab === 'health' && (
            <div className="space-y-3">
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                <div className="p-2.5 bg-[#0c1628] border border-cyan-900/60 rounded">
                  <div className="text-[10px] text-slate-400">TOTAL EVENTS IN DB</div>
                  <div className="text-lg font-bold text-white mt-1">{stats?.total_events || 0}</div>
                </div>
                <div className="p-2.5 bg-[#0c1628] border border-cyan-900/60 rounded">
                  <div className="text-[10px] text-slate-400">PERSISTENT SOURCES</div>
                  <div className="text-lg font-bold text-orange-400 mt-1">{stats?.total_persistent_sources || 0}</div>
                </div>
                <div className="p-2.5 bg-[#0c1628] border border-cyan-900/60 rounded">
                  <div className="text-[10px] text-slate-400">ACTIVE INCIDENT ALERTS</div>
                  <div className="text-lg font-bold text-red-400 mt-1">{stats?.active_alerts || 0}</div>
                </div>
                <div className="p-2.5 bg-[#0c1628] border border-cyan-900/60 rounded">
                  <div className="text-[10px] text-slate-400">LAST FETCH LATENCY</div>
                  <div className="text-lg font-bold text-emerald-400 mt-1">{firmsStatus?.latency_ms || 0} ms</div>
                </div>
              </div>

              <div className="p-3 bg-[#0c1628] border border-cyan-900/60 rounded space-y-2">
                <div className="text-cyan-400 font-bold font-hud">DATABASE & PERSISTENCE ARCHITECTURE</div>
                <div className="text-[11px] text-slate-300 space-y-1">
                  <div className="flex justify-between">
                    <span className="text-slate-400">Storage Engine:</span>
                    <span className="text-emerald-400">Persistent Disk Storage + Spatial Haversine Index</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-slate-400">PostGIS Schema:</span>
                    <span className="text-white">Ready for Supabase/PostgreSQL deploy (`server/db/schema.sql`)</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-slate-400">Deduplication Rule:</span>
                    <span className="text-white">500m spatial proximity + 30-minute time window</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-slate-400">Clustering Algorithm:</span>
                    <span className="text-white">Aggregates multi-pass observations (&ge;2 passes &ge;0.5h apart)</span>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* TAB 3: SETTINGS & API KEY */}
                    {/* TAB 3: SETTINGS */}
          {activeTab === 'settings' && (
            <div className="space-y-3">
              <div className="p-3 bg-[#0c1628] border border-cyan-900/60 rounded">
                <div className="flex items-center justify-between gap-3">
                  <span className="text-slate-300">NASA FIRMS API key</span>
                  <span className={firmsStatus?.has_api_key ? 'text-emerald-400 font-semibold' : 'text-amber-400 font-semibold'}>
                    {firmsStatus?.has_api_key ? 'Configured' : 'Not configured'}
                  </span>
                </div>
              </div>
              <div className="p-3 bg-[#0c1628] border border-cyan-900/60 rounded">
                <div className="flex items-center justify-between gap-3">
                  <span className="text-slate-300">Database</span>
                  <span className={!stats?.database ? 'text-slate-400' : stats.database.available ? 'text-emerald-400 font-semibold' : 'text-amber-400 font-semibold'}>
                    {!stats?.database ? 'Checking' : stats.database.available ? 'Connected' : 'Unavailable'}
                  </span>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="px-4 py-2.5 bg-[#060D19] border-t border-cyan-950 flex justify-end">
          <button
            onClick={onClose}
            className="px-4 py-1.5 bg-slate-800 hover:bg-slate-700 text-white rounded font-mono text-xs"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
};
