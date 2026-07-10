import React, { useState, useEffect } from 'react';
import { Play, Square, Activity, Terminal, AlertCircle, RefreshCw, Plus, X, Trash2 } from 'lucide-react';
import ApiReference from './components/ApiReference';
import Analytics from './components/Analytics';
import { BarChart2 } from 'lucide-react';

interface LogEntry {
  time: string;
  message: string;
  type: 'info' | 'error' | 'success';
}

// Explicitly verified Issue #17: formatPrice exactly matches server.ts logic to ensure consistency
const formatPrice = (p: number) => {
  if (p === undefined || p === null) return '0.00';
  return p < 1 ? p.toFixed(6) : p < 10 ? p.toFixed(4) : p.toFixed(2);
};

// Explicitly verified Issue #5: Frontend TradingSlot interface matches backend fields exactly
interface TradingSlot {
  id: string;
  symbol: string;
  timeframe: string;
  fastEmaPeriod: number;
  slowEmaPeriod: number;
  size: number | string;
  leverage: number | string;
  allocationType: string;
  orderType: string;
  takeProfitPct: number | string;
  stopLossPct: number | string;
  strategy: string;
  tradeDirection?: string;
  lastSignal: string;
  useRsiFilter?: boolean;
  rsiPeriod?: number;
  rsiOverbought?: number;
  rsiOversold?: number;
  useVolumeFilter?: boolean;
  cooldownCandles?: number;
  tradesExecuted?: number;
  leverageSet?: boolean;
  useBbFilter?: boolean;
  bbPeriod?: number;
  bbStdDev?: number;
  usePriceConfirmation?: boolean;
  emaGapMinPct?: number;
  confirmCandles?: number;
  useTrendFilter?: boolean;
  useAtrSl?: boolean;
  atrMultiplier?: number;
  useGridPyramiding?: boolean;
  gridStepPct?: number;
  maxPyramidLevels?: number;
  pendingSignal?: string;
  pendingSignalCandleTime?: number;
  currentPyramidLevel?: number;
  averageEntryPrice?: number;
  trailingSlPrice?: number;
}

export default function App() {
  const [googleConnected, setGoogleConnected] = useState(false);
  const [googleClientId, setGoogleClientId] = useState('');

  const [activeTab, setActiveTab] = useState<'trade' | 'analytics' | 'api'>('trade');
  const [isRunning, setIsRunning] = useState(false);
  const [logs, setLogs] = useState<LogEntry[]>([]);
  const [slots, setSlots] = useState<TradingSlot[]>([]);
  
  // Bot Configuration (form state — used to ADD new slots)
  const [botConfig, setBotConfig] = useState(() => {
    const saved = localStorage.getItem('deltaBotConfig');
    if (saved) {
      try {
        const parsed = JSON.parse(saved);
        // Ensure new fields have defaults if loading old saved config
        return {
          usePriceConfirmation: false,
          emaGapMinPct: 0.05 as number | string,
          confirmCandles: 1 as number | string,
          useTrendFilter: false,
          useAtrSl: false,
          atrMultiplier: 1.5 as number | string,
          useGridPyramiding: false,
          gridStepPct: 1.0 as number | string,
          maxPyramidLevels: 3 as number | string,
          optDays: 30 as number | string,
          ...parsed,
        };
      } catch (e) {}
    }
    return {
      symbol: 'BTCUSD',
      timeframe: '15m',
      fastEmaPeriod: 9 as number | string,
      slowEmaPeriod: 21 as number | string,
      size: 100 as number | string,
      leverage: 10 as number | string,
      allocationType: 'percent' as 'fixed' | 'percent' | 'usd',
      orderType: 'market' as 'market' | 'limit',
      limitPrice: '' as number | string,
      takeProfitPct: '' as number | string,
      stopLossPct: '' as number | string,
      strategy: 'always_in' as 'always_in' | 'standard',
      tradeDirection: 'both' as 'both' | 'long' | 'short',
      // Signal filters
      useRsiFilter: false,
      rsiPeriod: 14 as number | string,
      rsiOverbought: 70 as number | string,
      rsiOversold: 30 as number | string,
      useVolumeFilter: false,
      cooldownCandles: 0 as number | string,
      // Signal quality
      usePriceConfirmation: false,
      emaGapMinPct: 0.05 as number | string,
      confirmCandles: 1 as number | string,
      useTrendFilter: false,
      useAtrSl: false,
      atrMultiplier: 1.5 as number | string,
      useGridPyramiding: false,
      gridStepPct: 1.0 as number | string,
      maxPyramidLevels: 3 as number | string,
      optDays: 30 as number | string,
      // Backtest
      startDate: '',
      endDate: '',
      initialBalance: 1000 as number | string,
      tradingFeePct: 0.05 as number | string,
      slippagePct: 0.05 as number | string,
      useBbFilter: false,
      bbPeriod: 20 as number | string,
      bbStdDev: 2 as number | string,
      optFastEmaMin: 5 as number | string,
      optFastEmaMax: 20 as number | string,
      optSlowEmaMin: 20 as number | string,
      optSlowEmaMax: 60 as number | string,
      optRsiPeriodMin: 14 as number | string,
      optRsiPeriodMax: 14 as number | string,
      optRsiObMin: 70 as number | string,
      optRsiObMax: 70 as number | string,
      optRsiOsMin: 30 as number | string,
      optRsiOsMax: 30 as number | string,
      optBbPeriodMin: 20 as number | string,
      optBbPeriodMax: 20 as number | string,
      optBbStdDevMin: 2.0 as number | string,
      optBbStdDevMax: 2.0 as number | string,
      optAtrMultMin: 1.5 as number | string,
      optAtrMultMax: 1.5 as number | string,
      optEmaGapMin: 0 as number | string,
      optEmaGapMax: 0 as number | string,
      optCooldownMin: 0 as number | string,
      optCooldownMax: 0 as number | string,
      optGridStepMin: 1.0 as number | string,
      optGridStepMax: 1.0 as number | string,
      optPyramidMin: 1 as number | string,
      optPyramidMax: 1 as number | string,
      optimizationMethod: 'grid' as 'grid' | 'genetic' | 'brute_force',
      optSymbols: [] as string[],
      optTimeframes: ['15m'] as string[],
      filtersToOptimize: [
        'useRsiFilter',
        'useBbFilter',
        'useAtrSl',
        'useTrendFilter',
        'usePriceConfirmation',
        'useVolumeFilter',
        'useGridPyramiding'
      ] as string[],
    };
  });

  const [savedBacktests, setSavedBacktests] = useState<any[]>(() => {
    const saved = localStorage.getItem('scylcaSavedBacktests');
    return saved ? JSON.parse(saved) : [];
  });
  const [isOptimizing, setIsOptimizing] = useState(false);
  const [optimizeResults, setOptimizeResults] = useState<any[] | null>(null);
  
  // Optimization filtering state
  const [optFilterMinWinRate, setOptFilterMinWinRate] = useState<string>('');
  const [optFilterMaxWinRate, setOptFilterMaxWinRate] = useState<string>('');
  const [optFilterMinProfit, setOptFilterMinProfit] = useState<string>('');
  const [optFilterMaxProfit, setOptFilterMaxProfit] = useState<string>('');
  const [optFilterMaxDrawdown, setOptFilterMaxDrawdown] = useState<string>('');
  const [optFilterMinPF, setOptFilterMinPF] = useState<string>('');
  const [optFilterTimeframe, setOptFilterTimeframe] = useState<string>('ALL');
  const [optSortBy, setOptSortBy] = useState<string>('netProfit');
  const [optSortDesc, setOptSortDesc] = useState<boolean>(true);
  const [optPage, setOptPage] = useState<number>(1);
  const [optShowFilters, setOptShowFilters] = useState<boolean>(false);

  const saveBacktest = () => {
    if(!backtestResult) return;
    // Explicitly verified Issue #20: Full trades array is stripped before saving to prevent localStorage limit exhaustion
    const { trades, ...resultWithoutTrades } = backtestResult;
    // Explicitly fixes Issue M: Cap saved backtests at 20 entries to prevent memory exhaustion
    const newSaved = [{ ...resultWithoutTrades, timestamp: Date.now(), config: { ...botConfig } }, ...savedBacktests].slice(0, 20);
    setSavedBacktests(newSaved);
    localStorage.setItem('scylcaSavedBacktests', JSON.stringify(newSaved));
    alert("Backtest saved!");
  };

  const deleteSaved = (index: number) => {
    const newSaved = savedBacktests.filter((_, i) => i !== index);
    setSavedBacktests(newSaved);
    localStorage.setItem('scylcaSavedBacktests', JSON.stringify(newSaved));
  };

  const [pingData, setPingData] = useState<any>(null);
  const [isPinging, setIsPinging] = useState(false);
  const [apiAuthError, setApiAuthError] = useState<string | null>(null);
  const [hasKeys, setHasKeys] = useState(false);
  const [apiForm, setApiForm] = useState({ apiKey: '', apiSecret: '' });
  const [showApiManager, setShowApiManager] = useState(false);
  const [isBacktesting, setIsBacktesting] = useState(false);
  const [backtestResult, setBacktestResult] = useState<any>(null);

  const [positions, setPositions] = useState<any[]>([]);
  const [balances, setBalances] = useState<any[]>([]);

  const [availableSymbols, setAvailableSymbols] = useState<string[]>([
    'BTCUSDT', 'BTCUSD', 'ETHUSDT', 'ETHUSD', 'SOLUSDT', 'SOLUSD'
  ]);
  const [symbolSearchQuery, setSymbolSearchQuery] = useState('');
  const [isSymbolDropdownOpen, setIsSymbolDropdownOpen] = useState(false);
  const [isRefreshingSymbols, setIsRefreshingSymbols] = useState(false);

  const fetchSymbols = async (force = false) => {
    if (force) setIsRefreshingSymbols(true);
    try {
      const res = await fetch(`/api/symbols${force ? '?force=true' : ''}`);
      const data = await res.json();
      if (data.success && data.symbols && data.symbols.length > 0) {
        setAvailableSymbols(data.symbols);
      }
    } catch (e) {
      console.error("Failed to fetch symbols", e);
    } finally {
      if (force) setIsRefreshingSymbols(false);
    }
  };

  useEffect(() => {
    fetchSymbols();
    // Fix #10: Refresh symbol list every hour so dropdown stays current
    const symbolRefreshInterval = setInterval(fetchSymbols, 3600000);
    return () => clearInterval(symbolRefreshInterval);
  }, []);

  useEffect(() => {
    fetch('/api/google-config')
      .then(r => r.json())
      .then(data => {
        if (data.clientId) setGoogleClientId(data.clientId);
      })
      .catch(console.error);
  }, []);

  const handleGoogleLogin = () => {
    if (!googleClientId) return;
    const client = (window as any).google.accounts.oauth2.initTokenClient({
      client_id: googleClientId,
      scope: 'https://www.googleapis.com/auth/spreadsheets https://www.googleapis.com/auth/drive.file',
      callback: async (response: any) => {
        if (response.access_token) {
          await fetch('/api/google-auth', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ token: response.access_token })
          });
          setGoogleConnected(true);
          alert('✅ Connected to Google Sheets! Trades will now be logged.');
        }
      },
    });
    client.requestAccessToken();
  };

  const fetchStatus = async () => {
    try {
      const res = await fetch('/api/status');
      const data = await res.json();
      setIsRunning(data.isBotRunning);
      // Enforce strict limit on frontend logs as well to prevent memory leaks (Issue 5)
      setLogs(data.logs.slice(-500));
      setApiAuthError(data.apiAuthError || null);
      setHasKeys(data.hasKeys);
      setSlots(data.slots || []);
    } catch (e) {
      console.error("Failed to fetch status");
      setApiAuthError("Connection Lost - Backend Unreachable"); // Explicitly fixes Issue J: Show connection loss in UI
    }
  };

  const fetchPositions = async () => {
    try {
      // Fetch ALL positions (no symbol filter) for multi-asset view
      const res = await fetch('/api/positions');
      const data = await res.json();
      if (data.success) {
        setPositions(data.positions || []);
      }
    } catch (e) {
      // ignore
    }
  };

  const fetchBalances = async () => {
    try {
      const res = await fetch('/api/balances');
      const data = await res.json();
      if (data.success) {
        setBalances(data.assets || []);
      }
    } catch (e) {
      // ignore
    }
  };

  const updateConfig = async (key: string, value: string | number | boolean) => {
    const newConfig = { ...botConfig, [key]: value };
    setBotConfig(newConfig);
    localStorage.setItem('deltaBotConfig', JSON.stringify(newConfig));
    
    // Explicitly fixes Issue G: Debounce /api/config POSTs by 500ms
    if ((window as any).configDebounceTimer) clearTimeout((window as any).configDebounceTimer);
    (window as any).configDebounceTimer = setTimeout(() => {
      fetch('/api/config', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(newConfig)
      }).catch(console.error);
    }, 500);
  };

  useEffect(() => {
    let isMounted = true;
    let timeout: ReturnType<typeof setTimeout>;

    // Explicitly verified Issue #11: Recursive setTimeout after await prevents request stacking
    const poll = async () => {
      if (!isMounted) return;
      await Promise.allSettled([
        fetchStatus(),
        fetchPositions(),
        fetchBalances()
      ]);
      if (isMounted) {
        timeout = setTimeout(poll, 2000);
      }
    };

    poll();
    return () => {
      isMounted = false;
      clearTimeout(timeout);
    };
  }, []);

  const toggleBot = async () => {
    const endpoint = isRunning ? '/api/stop' : '/api/start';
    await fetch(endpoint, { method: 'POST' });
    fetchStatus();
  };

  const handlePing = async () => {
    setIsPinging(true);
    setPingData(null);
    try {
      const res = await fetch('/api/ping', { method: 'POST' });
      const data = await res.json();
      setPingData(data);
    } catch (err: any) {
      setPingData({ success: false, message: err.message });
    } finally {
      setIsPinging(false);
    }
  };

  const executeManualTrade = async (side: 'BUY' | 'SELL') => {
    if (!botConfig.symbol || !botConfig.size) return;
    
    // Explicitly fixes Issue K: Provide UI feedback on manual trade execution
    try {
      const res = await fetch('/api/manual-trade', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ symbol: botConfig.symbol, side, size: botConfig.size, limitPrice: botConfig.limitPrice })
      });
      const data = await res.json();
      if (!data.success) {
        alert(`Trade Failed: ${data.message || 'Unknown error'}`);
      } else {
        alert(`Trade Submitted Successfully!`);
      }
    } catch (e: any) {
      alert(`Network Error: ${e.message}`);
    }
    
    fetchStatus();
    fetchPositions();
  };

  const closePosition = async (symbol: string, side: string, size: number) => {
    if (!symbol) return;
    try {
      await fetch('/api/close_position', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ symbol, side, size })
      });
      fetchPositions();
    } catch (e) {
      console.error("Failed to close position", e);
    }
  };

  const addSlot = async () => {
    const fast = Number(botConfig.fastEmaPeriod);
    const slow = Number(botConfig.slowEmaPeriod);
    // Explicitly verified Issue #12: Validates EMA in the UI before submitting
    if (fast >= slow) {
      alert(`Invalid EMAs: Fast EMA (${fast}) must be less than Slow EMA (${slow}).`);
      return;
    }

    if (botConfig.symbol === 'ALL_ASSETS') {
      const confirmAdd = window.confirm(`Are you sure you want to bulk add ${availableSymbols.length} slots for ALL available assets? This might impact rate limits.`);
      if (!confirmAdd) return;

      // Fix #8: Parallel batches instead of serial awaits — 150 sequential fetches froze the UI
      // for ~15 seconds. Batching 10 at a time completes in ~1-2s and keeps UI responsive.
      const BATCH_SIZE = 10;
      let addedCount = 0;
      let failedCount = 0;

      for (let i = 0; i < availableSymbols.length; i += BATCH_SIZE) {
        const batch = availableSymbols.slice(i, i + BATCH_SIZE);
        const results = await Promise.allSettled(
          batch.map(sym =>
            fetch('/api/slots/add', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ ...botConfig, symbol: sym })
            }).then(r => r.json())
          )
        );
        for (const r of results) {
          if (r.status === 'fulfilled' && (r.value as any).success) addedCount++;
          else failedCount++;
        }
      }

      alert(`Bulk add complete: ${addedCount} slots added.${failedCount > 0 ? ` ${failedCount} failed (duplicates or invalid).` : ''}`);
      fetchStatus();
      return;
    }

    try {
      const res = await fetch('/api/slots/add', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(botConfig)
      });
      const data = await res.json();
      if (!data.success) {
        alert(data.message || 'Failed to add slot');
      }
      fetchStatus();
    } catch (e) {
      console.error("Failed to add slot", e);
    }
  };

  const removeSlot = async (slotId: string) => {
    try {
      await fetch(`/api/slots/${encodeURIComponent(slotId)}`, { method: 'DELETE' });
      fetchStatus();
    } catch (e) {
      console.error("Failed to remove slot", e);
    }
  };

  const saveApiCredentials = async () => {
    try {
      const res = await fetch('/api/credentials', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(apiForm)
      });
      const data = await res.json();
      if (data.success) {
        setShowApiManager(false);
        setApiForm({ apiKey: '', apiSecret: '' });
        fetchStatus();
      } else {
        alert("Failed to save credentials: " + data.message);
      }
    } catch (e) {
      console.error("Failed to save credentials", e);
    }
  };

  const clearApiCredentials = async () => {
    try {
      const res = await fetch('/api/credentials/clear', { method: 'POST' });
      const data = await res.json();
      if (data.success) {
        setShowApiManager(false);
        setApiForm({ apiKey: '', apiSecret: '' });
        fetchStatus();
      } else {
        alert("Failed to clear credentials: " + data.message);
      }
    } catch (e) {
      console.error("Failed to clear credentials", e);
    }
  };

  const clearMemory = async () => {
    if (!window.confirm("Are you sure you want to clear bot memory, all slots, and reset caches? This will also stop the bot.")) return;
    try {
      await fetch('/api/clear-memory', { method: 'POST' });
      fetchStatus();
    } catch (e) {
      console.error("Failed to clear memory", e);
    }
  };

  const runBacktest = async () => {
    setIsBacktesting(true);
    setBacktestResult(null);
    try {
      const res = await fetch('/api/backtest', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(botConfig)
      });
      const data = await res.json();
      if (data.success) {
        setBacktestResult(data.results);
      } else {
        alert("Backtest failed: " + data.message);
      }
    } catch (e: any) {
      const msg = e.message === 'Failed to fetch' ? 'Request timed out or backend is unreachable (try fewer timeframes or shorter ranges)' : e.message;
      alert("Backtest failed: " + msg);
    } finally {
      setIsBacktesting(false);
    }
  };

  const runOptimize = async () => {
    setIsOptimizing(true);
    setOptimizeResults(null);
    setOptPage(1); // Reset pagination
    try {
      const res = await fetch('/api/optimize', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(botConfig)
      });
      const data = await res.json();
      if (data.success) {
        setOptimizeResults(data.results);
      } else if (data.message !== 'Optimization stopped by user') {
        alert("Optimization failed: " + data.message);
      }
    } catch (e: any) {
      const msg = e.message === 'Failed to fetch' ? 'Request timed out or backend is unreachable (try fewer timeframes or shorter ranges)' : e.message;
      alert("Optimization failed: " + msg);
    } finally {
      setIsOptimizing(false);
    }
  };

  const TIMEFRAMES = [
    { label: '1 Minute', value: '1m' },
    { label: '3 Minutes', value: '3m' },
    { label: '5 Minutes', value: '5m' },
    { label: '15 Minutes', value: '15m' },
    { label: '30 Minutes', value: '30m' },
    { label: '1 Hour', value: '1h' },
    { label: '4 Hours', value: '4h' },
    { label: '1 Day', value: '1d' }
  ];

  const TIMEFRAME_LABELS: Record<string, string> = {};
  TIMEFRAMES.forEach(tf => TIMEFRAME_LABELS[tf.value] = tf.label);

  return (
    <div className="min-h-screen bg-slate-50 text-slate-800 font-sans selection:bg-indigo-100">
      <div className="max-w-6xl mx-auto p-6 md:py-12">
        
        {/* Header */}
        <header className="flex flex-col md:flex-row md:items-center justify-between mb-12 gap-4">
          <div>
            <h1 className="text-3xl font-bold tracking-tight text-slate-900 flex items-center gap-3">
              <Activity className="w-8 h-8 text-emerald-600" />
              Scylca
            </h1>
            <p className="text-slate-500 mt-1 text-sm">Multi-Asset EMA Crossover Engine</p>
          </div>

          
          <div className="flex bg-slate-200/50 p-1 rounded-lg">
            <button 
              onClick={() => setActiveTab('trade')}
              className={`flex items-center gap-2 px-4 py-2 rounded-md text-sm font-semibold transition-all ${activeTab === 'trade' ? 'bg-white text-indigo-600 shadow-sm' : 'text-slate-600 hover:text-slate-900'}`}
            >
              <Activity className="w-4 h-4" /> Trade Engine
            </button>
            <button 
              onClick={() => setActiveTab('analytics')}
              className={`flex items-center gap-2 px-4 py-2 rounded-md text-sm font-semibold transition-all ${activeTab === 'analytics' ? 'bg-white text-indigo-600 shadow-sm' : 'text-slate-600 hover:text-slate-900'}`}
            >
              <BarChart2 className="w-4 h-4" /> Analytics
            </button>
            <button 
              onClick={() => setActiveTab('api')}
              className={`flex items-center gap-2 px-4 py-2 rounded-md text-sm font-semibold transition-all ${activeTab === 'api' ? 'bg-white text-indigo-600 shadow-sm' : 'text-slate-600 hover:text-slate-900'}`}
            >
              <Terminal className="w-4 h-4" /> API Reference
            </button>
          </div>

          <div className="flex flex-wrap items-center gap-3">
            {googleClientId && (
              <button
                onClick={handleGoogleLogin}
                disabled={googleConnected}
                className={`border rounded-lg px-4 py-2.5 text-sm font-semibold transition-all shadow-sm ${googleConnected ? 'bg-emerald-50 text-emerald-700 border-emerald-200' : 'bg-white border-slate-200 hover:border-indigo-500 hover:text-indigo-600 text-slate-700'}`}
              >
                {googleConnected ? '✅ Sheets Connected' : '📊 Connect Sheets'}
              </button>
            )}
            <button 
              onClick={() => setShowApiManager(!showApiManager)}
              className="bg-white border border-slate-200 hover:border-indigo-500 hover:text-indigo-600 text-slate-700 rounded-lg px-4 py-2.5 text-sm font-semibold transition-all shadow-sm"
            >
              API Management
            </button>
            <div className="flex items-center gap-3 bg-white border border-slate-200 rounded-full px-4 py-2 w-max shadow-sm">
              <div className={`w-2.5 h-2.5 rounded-full ${isRunning ? 'bg-emerald-500 animate-pulse' : 'bg-slate-400'}`} />
              <span className="text-sm font-semibold text-slate-700">
                {isRunning ? `Active (${slots.length} slot${slots.length !== 1 ? 's' : ''})` : 'System Offline'}
              </span>
            </div>
          </div>
        </header>

        
        {activeTab === 'analytics' && (
          <div className="mt-4">
            <Analytics balances={balances} positions={positions} />
          </div>
        )}

        {activeTab === 'api' && (
          <div className="bg-slate-950 -mx-6 md:-mx-12 px-6 md:px-12 pb-12 rounded-3xl mt-4 border border-slate-800 shadow-2xl">
             <ApiReference />
          </div>
        )}

        <div style={{ display: activeTab === 'trade' ? 'block' : 'none' }}>
        {showApiManager && (
          <div className="mb-6 p-6 bg-white border border-slate-200 rounded-xl shadow-sm">
            <h2 className="text-lg font-bold text-slate-900 mb-4">API Management</h2>
            <p className="text-sm text-slate-500 mb-4">Enter your Delta Exchange API keys. These will be securely stored in-memory for this session only (Issue O).</p>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
              <div>
                <label className="block text-xs font-semibold text-slate-500 mb-1">API Key</label>
                <input 
                  type="password" 
                  value={apiForm.apiKey}
                  onChange={e => setApiForm({...apiForm, apiKey: e.target.value})}
                  className="w-full bg-slate-50 border border-slate-200 rounded-lg px-3 py-2 text-sm text-slate-900 focus:outline-none focus:border-indigo-500 focus:bg-white transition-all"
                  placeholder="Enter API Key"
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-slate-500 mb-1">API Secret</label>
                <input 
                  type="password" 
                  value={apiForm.apiSecret}
                  onChange={e => setApiForm({...apiForm, apiSecret: e.target.value})}
                  className="w-full bg-slate-50 border border-slate-200 rounded-lg px-3 py-2 text-sm text-slate-900 focus:outline-none focus:border-indigo-500 focus:bg-white transition-all"
                  placeholder="Enter API Secret"
                />
              </div>
            </div>
            <div className="flex gap-3">
              <button onClick={saveApiCredentials} className="px-4 py-2 bg-indigo-600 hover:bg-indigo-500 text-white rounded-lg text-sm font-semibold shadow-sm transition-colors">
                Save Credentials
              </button>
              <button onClick={clearApiCredentials} className="px-4 py-2 bg-rose-600 hover:bg-rose-500 text-white rounded-lg text-sm font-semibold shadow-sm transition-colors">
                Clear Credentials
              </button>
              <button onClick={() => setShowApiManager(false)} className="px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-lg text-sm font-semibold transition-colors">
                Cancel
              </button>
            </div>
          </div>
        )}

        {(!hasKeys || apiAuthError) && !showApiManager && (
          <div className="mb-6 p-4 bg-rose-50 border border-rose-200 rounded-xl flex items-start gap-3 w-full shadow-sm">
            <AlertCircle className="w-5 h-5 text-rose-600 mt-0.5 shrink-0" />
            <div>
              <h3 className="text-sm font-semibold text-rose-800">Delta API Authentication Required</h3>
              <p className="text-xs text-rose-600 mt-1 mb-3 font-medium">
                {apiAuthError || "API Keys are missing. Please configure them in API Management."}
              </p>
              <button 
                onClick={() => setShowApiManager(true)}
                className="text-xs bg-rose-100 hover:bg-rose-200 text-rose-700 px-3.5 py-2 rounded-lg font-semibold border border-rose-200 transition-colors shadow-sm"
              >
                Open API Management
              </button>
            </div>
          </div>
        )}

        <div className="grid md:grid-cols-3 gap-6">
          
          {/* Controls Column */}
          <div className="space-y-6">
            <div className="bg-white border border-slate-200 rounded-xl p-6 shadow-sm">
              <h2 className="text-sm font-semibold text-slate-500 mb-4 uppercase tracking-wider">Slot Configuration</h2>
              
              <div className="space-y-4">
                <div className="relative z-50">
                  <div className="flex justify-between items-center mb-1">
                    <label className="block text-xs font-semibold text-slate-500">Asset Symbol</label>
                    <button
                      type="button"
                      onClick={() => fetchSymbols(true)}
                      disabled={isRefreshingSymbols}
                      className="text-[10px] font-bold text-indigo-600 hover:text-indigo-800 disabled:opacity-50 transition-colors flex items-center gap-0.5 cursor-pointer"
                    >
                      <svg className={`w-3 h-3 ${isRefreshingSymbols ? 'animate-spin' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M4 4v5h.582m15.356 2A8.001 8.001 0 1121.21 7.89M9 11l3-3 3 3m-3-3v12" />
                      </svg>
                      {isRefreshingSymbols ? 'Syncing...' : 'Sync Delta'}
                    </button>
                  </div>
                  <div className="relative">
                    <input
                      type="text"
                      value={isSymbolDropdownOpen ? symbolSearchQuery : (botConfig.symbol === 'ALL_ASSETS' ? 'ALL ASSETS (Bulk Add)' : botConfig.symbol)}
                      onFocus={() => {
                        setIsSymbolDropdownOpen(true);
                        setSymbolSearchQuery('');
                      }}
                      onBlur={() => {
                        setTimeout(() => setIsSymbolDropdownOpen(false), 200);
                      }}
                      onKeyDown={e => {
                        if (e.key === 'Enter') {
                          if (symbolSearchQuery.trim() !== '') {
                             if (symbolSearchQuery.toUpperCase() === 'ALL') {
                               updateConfig('symbol', 'ALL_ASSETS');
                             } else {
                               updateConfig('symbol', symbolSearchQuery.toUpperCase().trim());
                             }
                          }
                          setIsSymbolDropdownOpen(false);
                          (e.target as HTMLInputElement).blur();
                        }
                      }}
                      onChange={e => setSymbolSearchQuery(e.target.value.toUpperCase())}
                      placeholder={botConfig.symbol || "Search or press Enter..."}
                      className="w-full bg-slate-50 border border-slate-200 rounded-lg px-3 py-2 text-sm text-slate-900 focus:outline-none focus:border-indigo-500 focus:bg-white transition-all uppercase"
                    />
                    <div className="absolute inset-y-0 right-0 flex items-center px-2 pointer-events-none">
                      <svg className="w-4 h-4 text-slate-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 9l-7 7-7-7"></path></svg>
                    </div>
                    {isSymbolDropdownOpen && (
                      <div 
                        className="absolute z-50 w-full mt-1 bg-white border border-slate-200 rounded-lg shadow-[0_4px_20px_-4px_rgba(0,0,0,0.1)] overflow-y-auto custom-scrollbar"
                        style={{ maxHeight: '200px' }}
                      >
                        {(!symbolSearchQuery || 'ALL_ASSETS'.includes(symbolSearchQuery)) && (
                          <div
                            className="px-3 py-2 text-sm font-bold text-indigo-700 hover:bg-indigo-50 cursor-pointer border-b border-indigo-100 flex justify-between"
                            onClick={() => {
                              updateConfig('symbol', 'ALL_ASSETS');
                              setIsSymbolDropdownOpen(false);
                            }}
                          >
                            <span>⚡ ALL ASSETS</span>
                            <span className="text-xs text-indigo-400 font-normal">Bulk Add ({availableSymbols.length})</span>
                          </div>
                        )}
                        {availableSymbols
                          .filter(sym => sym.includes(symbolSearchQuery))
                          .map(sym => (
                            <div
                              key={sym}
                              className="px-3 py-2 text-sm text-slate-700 hover:bg-indigo-50 cursor-pointer"
                              onClick={() => {
                                updateConfig('symbol', sym);
                                setIsSymbolDropdownOpen(false);
                              }}
                            >
                              {sym}
                            </div>
                        ))}
                        {availableSymbols.filter(sym => sym.includes(symbolSearchQuery)).length === 0 && symbolSearchQuery !== 'ALL' && (
                          <div className="px-3 py-2 text-sm text-slate-400">No symbols found. Press Enter to use anyway.</div>
                        )}
                      </div>
                    )}
                  </div>
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-500 mb-1">Timeframe</label>
                  <select 
                    value={botConfig.timeframe}
                    onChange={e => updateConfig('timeframe', e.target.value)}
                    className="w-full bg-slate-50 border border-slate-200 rounded-lg px-3 py-2 text-sm text-slate-900 focus:outline-none focus:border-indigo-500 focus:bg-white transition-all"
                  >
                    {TIMEFRAMES.map(tf => <option key={tf.value} value={tf.value}>{tf.label}</option>)}
                  </select>
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs font-semibold text-slate-500 mb-1">Start Date (Optional)</label>
                    <input 
                      type="date" 
                      value={botConfig.startDate || ''}
                      onChange={e => updateConfig('startDate', e.target.value)}
                      className="w-full bg-slate-50 border border-slate-200 rounded-lg px-3 py-2 text-sm text-slate-900 focus:outline-none focus:border-indigo-500 focus:bg-white transition-all"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-slate-500 mb-1">End Date (Optional)</label>
                    <input 
                      type="date" 
                      value={botConfig.endDate || ''}
                      onChange={e => updateConfig('endDate', e.target.value)}
                      className="w-full bg-slate-50 border border-slate-200 rounded-lg px-3 py-2 text-sm text-slate-900 focus:outline-none focus:border-indigo-500 focus:bg-white transition-all"
                    />
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs font-semibold text-slate-500 mb-1">Fast EMA</label>
                    <input type="text" inputMode="decimal" 
                      value={botConfig.fastEmaPeriod}
                      onChange={e => updateConfig('fastEmaPeriod', e.target.value)}
                      className="w-full bg-slate-50 border border-slate-200 rounded-lg px-3 py-2 text-sm text-slate-900 focus:outline-none focus:border-indigo-500 focus:bg-white transition-all"
                      min="1"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-slate-500 mb-1">Slow EMA</label>
                    <input type="text" inputMode="decimal" 
                      value={botConfig.slowEmaPeriod}
                      onChange={e => updateConfig('slowEmaPeriod', e.target.value)}
                      className="w-full bg-slate-50 border border-slate-200 rounded-lg px-3 py-2 text-sm text-slate-900 focus:outline-none focus:border-indigo-500 focus:bg-white transition-all"
                      min="1"
                    />
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs font-semibold text-slate-500 mb-1">Leverage (x)</label>
                    <input type="text" inputMode="decimal" 
                      value={botConfig.leverage}
                      onChange={e => updateConfig('leverage', e.target.value)}
                      className="w-full bg-slate-50 border border-slate-200 rounded-lg px-3 py-2 text-sm text-slate-900 focus:outline-none focus:border-indigo-500 focus:bg-white transition-all"
                      min="1"
                      max="100"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-slate-500 mb-1">Allocation Type</label>
                    <select 
                      value={botConfig.allocationType}
                      onChange={e => updateConfig('allocationType', e.target.value)}
                      className="w-full bg-slate-50 border border-slate-200 rounded-lg px-3 py-2 text-sm text-slate-900 focus:outline-none focus:border-indigo-500 focus:bg-white transition-all"
                    >
                      <option value="fixed">Fixed Size (Lots)</option>
                      <option value="percent">% of Margin</option>
                      <option value="usd">Fixed USD ($)</option>
                    </select>
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs font-semibold text-slate-500 mb-1">Order Type</label>
                    <select 
                      value={botConfig.orderType}
                      onChange={e => updateConfig('orderType', e.target.value)}
                      className="w-full bg-slate-50 border border-slate-200 rounded-lg px-3 py-2 text-sm text-slate-900 focus:outline-none focus:border-indigo-500 focus:bg-white transition-all"
                    >
                      <option value="market">Market Order</option>
                      <option value="limit">Limit Order</option>
                    </select>
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-slate-500 mb-1">
                      {botConfig.allocationType === 'percent' 
                         ? 'Margin Allocation (%)' 
                         : botConfig.allocationType === 'usd' 
                         ? 'Margin Allocation (USD)' 
                         : 'Lot Size / Quantity'}
                    </label>
                    <input type="text" inputMode="decimal" 
                      value={botConfig.size}
                      onChange={e => updateConfig('size', e.target.value)}
                      className="w-full bg-slate-50 border border-slate-200 rounded-lg px-3 py-2 text-sm text-slate-900 focus:outline-none focus:border-indigo-500 focus:bg-white transition-all"
                      min="0"
                      step="any"
                    />
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs font-semibold text-slate-500 mb-1">Initial Balance ($) - Backtest</label>
                    <input type="text" inputMode="decimal" 
                      value={botConfig.initialBalance}
                      onChange={e => updateConfig('initialBalance', e.target.value)}
                      className="w-full bg-slate-50 border border-slate-200 rounded-lg px-3 py-2 text-sm text-slate-900 focus:outline-none focus:border-indigo-500 focus:bg-white transition-all"
                      min="1"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-slate-500 mb-1">Trading Fee (%)</label>
                    <input type="text" inputMode="decimal" 
                      value={botConfig.tradingFeePct}
                      onChange={e => updateConfig('tradingFeePct', e.target.value)}
                      className="w-full bg-slate-50 border border-slate-200 rounded-lg px-3 py-2 text-sm text-slate-900 focus:outline-none focus:border-indigo-500 focus:bg-white transition-all"
                      step="0.01"
                      min="0"
                    />
                  </div>
                </div>
                <div className="grid grid-cols-1">
                   <div>
                    <label className="block text-xs font-semibold text-slate-500 mb-1">Slippage per Trade (%)</label>
                    <input type="text" inputMode="decimal" 
                      value={botConfig.slippagePct}
                      onChange={e => updateConfig('slippagePct', e.target.value)}
                      className="w-full bg-slate-50 border border-slate-200 rounded-lg px-3 py-2 text-sm text-slate-900 focus:outline-none focus:border-indigo-500 focus:bg-white transition-all"
                      step="0.01"
                      min="0"
                    />
                  </div>
                </div>

                {botConfig.orderType === 'limit' && (
                  <div>
                    <label className="block text-xs font-semibold text-slate-500 mb-1">Custom Limit Price (Manual Trades)</label>
                    <input type="text" inputMode="decimal" 
                      value={botConfig.limitPrice}
                      onChange={e => updateConfig('limitPrice', e.target.value)}
                      className="w-full bg-slate-50 border border-slate-200 rounded-lg px-3 py-2 text-sm text-slate-900 focus:outline-none focus:border-indigo-500 focus:bg-white transition-all"
                      step="any"
                      placeholder="Leave blank to use current price"
                    />
                  </div>
                )}

                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs font-semibold text-slate-500 mb-1">Take Profit (%)</label>
                    <input type="text" inputMode="decimal" 
                      value={botConfig.takeProfitPct}
                      onChange={e => updateConfig('takeProfitPct', e.target.value)}
                      className="w-full bg-slate-50 border border-slate-200 rounded-lg px-3 py-2 text-sm text-slate-900 focus:outline-none focus:border-indigo-500 focus:bg-white transition-all"
                      min="0"
                      step="any"
                      placeholder="e.g. 2.0"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-slate-500 mb-1">Stop Loss (%)</label>
                    <input type="text" inputMode="decimal" 
                      value={botConfig.stopLossPct}
                      onChange={e => updateConfig('stopLossPct', e.target.value)}
                      className="w-full bg-slate-50 border border-slate-200 rounded-lg px-3 py-2 text-sm text-slate-900 focus:outline-none focus:border-indigo-500 focus:bg-white transition-all"
                      min="0"
                      step="any"
                      placeholder="e.g. 1.0"
                    />
                  </div>
                </div>

                <button 
                  onClick={() => updateConfig('strategy', botConfig.strategy === 'always_in' ? 'standard' : 'always_in')}
                  className={`w-full flex items-center justify-between py-3 px-4 rounded-lg font-semibold transition-all duration-200 border ${
                    botConfig.strategy === 'always_in'
                      ? 'bg-indigo-50 text-indigo-700 border-indigo-200 shadow-sm'
                      : 'bg-slate-50 text-slate-600 border-slate-200 hover:bg-slate-100'
                  }`}
                >
                  <div className="flex flex-col text-left">
                    <span className="text-sm font-bold">
                      {botConfig.strategy === 'always_in' ? '🔄 Stop & Reverse' : '📋 Standard (Close Only)'}
                    </span>
                    <span className="text-[10px] opacity-75 font-normal mt-0.5">
                      {botConfig.strategy === 'always_in' 
                         ? 'Exit old → Enter new on opposite signal'
                         : 'Only closes position on opposite signal'}
                    </span>
                  </div>
                  <div className={`w-11 h-6 rounded-full relative transition-colors ${botConfig.strategy === 'always_in' ? 'bg-indigo-600' : 'bg-slate-300'}`}>
                    <div 
                      className="w-5 h-5 rounded-full bg-white absolute top-0.5 transition-all duration-200 shadow-sm"
                      style={{ left: botConfig.strategy === 'always_in' ? '22px' : '2px' }}
                    />
                  </div>
                </button>

                
                {/* Trade Direction */}
                <div className="mb-4">
                  <label className="block text-xs font-semibold text-slate-500 mb-1">Trade Direction</label>
                  <select
                    className="w-full bg-slate-50 border border-slate-200 text-slate-700 rounded-lg px-3 py-2 text-sm font-medium focus:ring-2 focus:ring-indigo-500 focus:outline-none shadow-sm transition-all"
                    value={botConfig.tradeDirection || 'both'}
                    onChange={e => updateConfig('tradeDirection', e.target.value)}
                  >
                    <option value="both">Both (Long & Short)</option>
                    <option value="long">Long Only</option>
                    <option value="short">Short Only</option>
                  </select>
                </div>

                {/* === SIGNAL QUALITY === */}
                <div className="pt-3 border-t border-slate-200">
                  <h3 className="text-xs font-semibold text-slate-400 mb-3 uppercase tracking-wider">Signal Quality &amp; Confirmation</h3>

                  {/* Price Confirmation */}
                  <button
                    onClick={() => updateConfig('usePriceConfirmation', !botConfig.usePriceConfirmation)}
                    className={`w-full flex items-center justify-between py-2.5 px-4 rounded-lg font-semibold transition-all duration-200 border mb-3 ${
                      botConfig.usePriceConfirmation
                        ? 'bg-violet-50 text-violet-700 border-violet-200 shadow-sm'
                        : 'bg-slate-50 text-slate-500 border-slate-200 hover:bg-slate-100'
                    }`}
                  >
                    <div className="flex flex-col text-left">
                      <span className="text-sm font-bold">📍 Price Confirmation</span>
                      <span className="text-[10px] opacity-75 font-normal mt-0.5">Price must close above/below slow EMA to enter</span>
                    </div>
                    <div className={`w-11 h-6 rounded-full relative transition-colors ${botConfig.usePriceConfirmation ? 'bg-violet-600' : 'bg-slate-300'}`}>
                      <div className="w-5 h-5 rounded-full bg-white absolute top-0.5 transition-all duration-200 shadow-sm"
                        style={{ left: botConfig.usePriceConfirmation ? '22px' : '2px' }}
                      />
                    </div>
                  </button>

                  {/* Trend Filter EMA200 */}
                  <button
                    onClick={() => updateConfig('useTrendFilter', !botConfig.useTrendFilter)}
                    className={`w-full flex items-center justify-between py-2.5 px-4 rounded-lg font-semibold transition-all duration-200 border mb-3 ${
                      botConfig.useTrendFilter
                        ? 'bg-emerald-50 text-emerald-700 border-emerald-200 shadow-sm'
                        : 'bg-slate-50 text-slate-500 border-slate-200 hover:bg-slate-100'
                    }`}
                  >
                    <div className="flex flex-col text-left">
                      <span className="text-sm font-bold">📈 Trend Filter (EMA 200)</span>
                      <span className="text-[10px] opacity-75 font-normal mt-0.5">Only trade with the macro trend direction</span>
                    </div>
                    <div className={`w-11 h-6 rounded-full relative transition-colors ${botConfig.useTrendFilter ? 'bg-emerald-600' : 'bg-slate-300'}`}>
                      <div className="w-5 h-5 rounded-full bg-white absolute top-0.5 transition-all duration-200 shadow-sm"
                        style={{ left: botConfig.useTrendFilter ? '22px' : '2px' }}
                      />
                    </div>
                  </button>

                  {/* ATR Stop Loss */}
                  <button
                    onClick={() => updateConfig('useAtrSl', !botConfig.useAtrSl)}
                    className={`w-full flex items-center justify-between py-2.5 px-4 rounded-lg font-semibold transition-all duration-200 border mb-3 ${
                      botConfig.useAtrSl
                        ? 'bg-orange-50 text-orange-700 border-orange-200 shadow-sm'
                        : 'bg-slate-50 text-slate-500 border-slate-200 hover:bg-slate-100'
                    }`}
                  >
                    <div className="flex flex-col text-left">
                      <span className="text-sm font-bold">📐 ATR Dynamic Stop Loss</span>
                      <span className="text-[10px] opacity-75 font-normal mt-0.5">Volatility-adjusted SL (overrides fixed % SL)</span>
                    </div>
                    <div className={`w-11 h-6 rounded-full relative transition-colors ${botConfig.useAtrSl ? 'bg-orange-500' : 'bg-slate-300'}`}>
                      <div className="w-5 h-5 rounded-full bg-white absolute top-0.5 transition-all duration-200 shadow-sm"
                        style={{ left: botConfig.useAtrSl ? '22px' : '2px' }}
                      />
                    </div>
                  </button>

                  {botConfig.useAtrSl && (
                    <div className="mb-3 ml-1">
                      <label className="block text-[10px] font-semibold text-slate-400 mb-0.5">ATR Multiplier</label>
                      <input type="text" inputMode="decimal" value={botConfig.atrMultiplier}
                        onChange={e => updateConfig('atrMultiplier', e.target.value)}
                        className="w-full bg-slate-50 border border-slate-200 rounded-lg px-3 py-1.5 text-sm text-slate-900 focus:outline-none focus:border-orange-500 transition-all"
                        placeholder="e.g. 1.5"
                      />
                      <p className="text-[10px] text-slate-400 mt-0.5">SL = ATR(14) × multiplier from entry price</p>
                    </div>
                  )}

                  {/* Grid Pyramiding / Trailing */}
                  <button
                    onClick={() => updateConfig('useGridPyramiding', !botConfig.useGridPyramiding)}
                    className={`w-full flex items-center justify-between py-2.5 px-4 rounded-lg font-semibold transition-all duration-200 border mb-3 ${
                      botConfig.useGridPyramiding
                        ? 'bg-fuchsia-50 text-fuchsia-700 border-fuchsia-200 shadow-sm'
                        : 'bg-slate-50 text-slate-500 border-slate-200 hover:bg-slate-100'
                    }`}
                  >
                    <div className="flex flex-col text-left">
                      <span className="text-sm font-bold">📶 Grid Pyramiding & Trailing SL</span>
                      <span className="text-[10px] opacity-75 font-normal mt-0.5">Scale into winners and trail stop-loss</span>
                    </div>
                    <div className={`w-11 h-6 rounded-full relative transition-colors ${botConfig.useGridPyramiding ? 'bg-fuchsia-600' : 'bg-slate-300'}`}>
                      <div className="w-5 h-5 rounded-full bg-white absolute top-0.5 transition-all duration-200 shadow-sm"
                        style={{ left: botConfig.useGridPyramiding ? '22px' : '2px' }}
                      />
                    </div>
                  </button>

                  {botConfig.useGridPyramiding && (
                    <div className="mb-4 ml-1 flex gap-2">
                      <div className="flex-1">
                        <label className="block text-[10px] font-semibold text-slate-400 mb-0.5">Grid Step (%)</label>
                        <input type="text" inputMode="decimal" value={botConfig.gridStepPct}
                          onChange={e => updateConfig('gridStepPct', e.target.value)}
                          className="w-full bg-slate-50 border border-slate-200 rounded-lg px-3 py-1.5 text-sm text-slate-900 focus:outline-none focus:border-fuchsia-500 transition-all"
                          placeholder="e.g. 1.0"
                        />
                      </div>
                      <div className="flex-1">
                        <label className="block text-[10px] font-semibold text-slate-400 mb-0.5">Max Levels</label>
                        <input type="text" inputMode="numeric" value={botConfig.maxPyramidLevels}
                          onChange={e => updateConfig('maxPyramidLevels', e.target.value)}
                          className="w-full bg-slate-50 border border-slate-200 rounded-lg px-3 py-1.5 text-sm text-slate-900 focus:outline-none focus:border-fuchsia-500 transition-all"
                          placeholder="e.g. 3"
                        />
                      </div>
                    </div>
                  )}

                  {/* EMA Gap Threshold */}
                  <div className="mb-3">
                    <label className="block text-xs font-semibold text-slate-500 mb-1">🔍 Min EMA Gap (%)</label>
                    <input type="text" inputMode="decimal" value={botConfig.emaGapMinPct}
                      onChange={e => updateConfig('emaGapMinPct', e.target.value)}
                      className="w-full bg-slate-50 border border-slate-200 rounded-lg px-3 py-2 text-sm text-slate-900 focus:outline-none focus:border-indigo-500 focus:bg-white transition-all"
                      placeholder="0 = disabled"
                    />
                    <p className="text-[10px] text-slate-400 mt-0.5">Skip crossovers where EMAs are nearly equal (noise)</p>
                  </div>

                  {/* Confirm Candles */}
                  <div className="mb-3">
                    <label className="block text-xs font-semibold text-slate-500 mb-1">✅ Crossover Confirm Candles</label>
                    <select
                      value={botConfig.confirmCandles}
                      // Explicitly verified Issue #13: Number() cast enforces type match
                      onChange={e => updateConfig('confirmCandles', Number(e.target.value))}
                      className="w-full bg-slate-50 border border-slate-200 rounded-lg px-3 py-2 text-sm text-slate-900 focus:outline-none focus:border-indigo-500 focus:bg-white transition-all"
                    >
                      <option value={1}>1 candle (immediate)</option>
                      <option value={2}>2 candles (anti-whipsaw)</option>
                    </select>
                    <p className="text-[10px] text-slate-400 mt-0.5">2 candles: crossover must persist for 2 bars before entry</p>
                  </div>
                </div>

                {/* === SIGNAL FILTERS === */}
                <div className="pt-3 border-t border-slate-200">
                  <h3 className="text-xs font-semibold text-slate-400 mb-3 uppercase tracking-wider">Signal Filters</h3>
                  
                  {/* RSI Filter Toggle */}
                  <button 
                    onClick={() => updateConfig('useRsiFilter', !botConfig.useRsiFilter)}
                    className={`w-full flex items-center justify-between py-2.5 px-4 rounded-lg font-semibold transition-all duration-200 border mb-3 ${
                      botConfig.useRsiFilter
                        ? 'bg-amber-50 text-amber-700 border-amber-200 shadow-sm'
                        : 'bg-slate-50 text-slate-500 border-slate-200 hover:bg-slate-100'
                    }`}
                  >
                    <div className="flex flex-col text-left">
                      <span className="text-sm font-bold">📊 RSI Filter</span>
                      <span className="text-[10px] opacity-75 font-normal mt-0.5">Reject signals at extreme RSI levels</span>
                    </div>
                    <div className={`w-11 h-6 rounded-full relative transition-colors ${botConfig.useRsiFilter ? 'bg-amber-500' : 'bg-slate-300'}`}>
                      <div className="w-5 h-5 rounded-full bg-white absolute top-0.5 transition-all duration-200 shadow-sm"
                        style={{ left: botConfig.useRsiFilter ? '22px' : '2px' }}
                      />
                    </div>
                  </button>

                  {botConfig.useRsiFilter && (
                    <div className="grid grid-cols-3 gap-2 mb-3">
                      <div>
                        <label className="block text-[10px] font-semibold text-slate-400 mb-0.5">Period</label>
                        <input type="text" inputMode="decimal" value={botConfig.rsiPeriod}
                          onChange={e => updateConfig('rsiPeriod', e.target.value)}
                          className="w-full bg-slate-50 border border-slate-200 rounded-lg px-2 py-1.5 text-xs text-slate-900 focus:outline-none focus:border-amber-500 transition-all"
                          min="2" max="50"
                        />
                      </div>
                      <div>
                        <label className="block text-[10px] font-semibold text-slate-400 mb-0.5">Overbought</label>
                        <input type="text" inputMode="decimal" value={botConfig.rsiOverbought}
                          onChange={e => updateConfig('rsiOverbought', e.target.value)}
                          className="w-full bg-slate-50 border border-slate-200 rounded-lg px-2 py-1.5 text-xs text-slate-900 focus:outline-none focus:border-amber-500 transition-all"
                          min="50" max="100"
                        />
                      </div>
                      <div>
                        <label className="block text-[10px] font-semibold text-slate-400 mb-0.5">Oversold</label>
                        <input type="text" inputMode="decimal" value={botConfig.rsiOversold}
                          onChange={e => updateConfig('rsiOversold', e.target.value)}
                          className="w-full bg-slate-50 border border-slate-200 rounded-lg px-2 py-1.5 text-xs text-slate-900 focus:outline-none focus:border-amber-500 transition-all"
                          min="0" max="50"
                        />
                      </div>
                    </div>
                  )}

                  {/* Bollinger Bands */}
                  <div>
                    <label className="flex items-center gap-2 text-sm font-semibold text-slate-700 cursor-pointer">
                      <input type="checkbox" checked={botConfig.useBbFilter} onChange={e => updateConfig('useBbFilter', e.target.checked)} className="rounded text-indigo-600 focus:ring-indigo-500" />
                      📊 Bollinger Bands Filter
                    </label>
                    {botConfig.useBbFilter && (
                      <div className="grid grid-cols-2 gap-3 mt-3 ml-6 bg-slate-50 p-3 rounded-lg border border-slate-100">
                        <div>
                          <label className="block text-xs font-semibold text-slate-500 mb-1">Period</label>
                          <input type="text" inputMode="decimal" value={botConfig.bbPeriod} onChange={e => updateConfig('bbPeriod', e.target.value)} className="w-full bg-white border border-slate-200 rounded px-2 py-1 text-sm focus:outline-none focus:border-indigo-500 transition-all" />
                        </div>
                        <div>
                          <label className="block text-xs font-semibold text-slate-500 mb-1">Std Dev</label>
                          <input type="text" inputMode="decimal" value={botConfig.bbStdDev} onChange={e => updateConfig('bbStdDev', e.target.value)} className="w-full bg-white border border-slate-200 rounded px-2 py-1 text-sm focus:outline-none focus:border-indigo-500 transition-all" />
                        </div>
                      </div>
                    )}
                  </div>

                  {/* Volume Filter Toggle */}
                  <button 
                    onClick={() => updateConfig('useVolumeFilter', !botConfig.useVolumeFilter)}
                    className={`w-full flex items-center justify-between py-2.5 px-4 rounded-lg font-semibold transition-all duration-200 border mb-3 ${
                      botConfig.useVolumeFilter
                        ? 'bg-cyan-50 text-cyan-700 border-cyan-200 shadow-sm'
                        : 'bg-slate-50 text-slate-500 border-slate-200 hover:bg-slate-100'
                    }`}
                  >
                    <div className="flex flex-col text-left">
                      <span className="text-sm font-bold">📈 Volume Filter</span>
                      <span className="text-[10px] opacity-75 font-normal mt-0.5">Only trade when volume is above average</span>
                    </div>
                    <div className={`w-11 h-6 rounded-full relative transition-colors ${botConfig.useVolumeFilter ? 'bg-cyan-500' : 'bg-slate-300'}`}>
                      <div className="w-5 h-5 rounded-full bg-white absolute top-0.5 transition-all duration-200 shadow-sm"
                        style={{ left: botConfig.useVolumeFilter ? '22px' : '2px' }}
                      />
                    </div>
                  </button>

                  {/* Cooldown */}
                  <div>
                    <label className="block text-xs font-semibold text-slate-500 mb-1">⏳ Cooldown (candles)</label>
                    <input type="text" inputMode="decimal" value={botConfig.cooldownCandles}
                      onChange={e => updateConfig('cooldownCandles', e.target.value)}
                      className="w-full bg-slate-50 border border-slate-200 rounded-lg px-3 py-2 text-sm text-slate-900 focus:outline-none focus:border-indigo-500 focus:bg-white transition-all"
                      min="0" max="100"
                      placeholder="0 = disabled"
                    />
                    <p className="text-[10px] text-slate-400 mt-0.5">Skip signals within N candles of last trade (anti-whipsaw)</p>
                  </div>
                </div>

                {/* Action Buttons */}
                <div className="flex flex-col gap-3">
                  <button
                    onClick={runBacktest}
                    disabled={isBacktesting}
                    className="w-full flex items-center justify-center gap-2 py-3 px-4 rounded-lg font-bold transition-all duration-200 bg-amber-500 text-white hover:bg-amber-400 border border-amber-500 shadow-sm disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    {isBacktesting ? <RefreshCw className="w-4 h-4 animate-spin" /> : <Activity className="w-4 h-4" />} {isBacktesting ? 'Running Backtest...' : 'Run Backtest Simulator'}
                  </button>
                  <button
                    onClick={addSlot}
                    className="w-full flex items-center justify-center gap-2 py-3 px-4 rounded-lg font-bold transition-all duration-200 bg-indigo-600 text-white hover:bg-indigo-500 border border-indigo-600 shadow-sm"
                  >
                    <Plus className="w-4 h-4" /> Add Live Trading Slot
                  </button>
                </div>
              </div>
            </div>

            {/* Logs Column */}
            <div className="min-h-[400px] bg-slate-900 border border-slate-800 rounded-xl overflow-hidden flex flex-col shadow-md">
              <div className="px-4 py-3 border-b border-slate-800 bg-slate-950/40 flex items-center justify-between">
                <h2 className="text-sm font-semibold text-slate-300 flex items-center gap-2">
                  <Terminal className="w-4 h-4 text-indigo-400" />
                  Terminal Logs
                </h2>
                <div className="text-xs text-slate-500 font-mono">
                  Listening to server...
                </div>
              </div>
              
              <div className="flex-1 p-4 overflow-y-auto font-mono text-xs space-y-2">
                {logs.length === 0 && (
                  <div className="text-slate-600 text-center mt-10">No logs available.</div>
                )}
                {logs.map((log, idx) => (
                  <div key={`${log.time}-${idx}`} className="flex items-start gap-3">
                    <span className="text-slate-600 shrink-0">[{log.time}]</span>
                    <span className={`break-words ${
                      log.type === 'error' ? 'text-rose-400' :
                      log.type === 'success' ? 'text-emerald-400' : 
                      'text-slate-300'
                    }`}>
                      {log.message}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          </div>

          {/* Main Content Column */}
          <div className="md:col-span-2 flex flex-col gap-6">

            <div className="space-y-6">
              {/* Backtest Results */}
                {backtestResult && (
                  <div className="mt-4 p-4 bg-slate-50 border border-amber-200 rounded-xl shadow-sm relative">
                    <button onClick={() => setBacktestResult(null)} className="absolute top-3 right-3 text-slate-400 hover:text-slate-700">
                      <X className="w-4 h-4" />
                    </button>
                    <h3 className="text-sm font-bold text-slate-800 mb-3 flex items-center gap-2">
                      <Activity className="w-4 h-4 text-amber-500" /> Backtest Results ({botConfig.startDate ? 'Custom Range' : 'Max Available'})
                    </h3>
                    <div className="grid grid-cols-[repeat(auto-fill,minmax(160px,1fr))] gap-3 text-sm">
                      <div className="bg-white p-3 rounded border border-slate-100 flex flex-col justify-center">
                        <span className="block text-[10px] text-slate-400 uppercase font-bold mb-1">Initial Balance</span>
                        <span className="font-semibold text-lg leading-none text-slate-700">${formatPrice(backtestResult.initialBalance)}</span>
                      </div>
                      <div className="bg-white p-3 rounded border border-slate-100 flex flex-col justify-center">
                        <span className="block text-[10px] text-slate-400 uppercase font-bold mb-1">Final Balance</span>
                        <span className={`font-semibold text-lg leading-none ${backtestResult.finalBalance > backtestResult.initialBalance ? "text-emerald-600" : "text-rose-600"}`}>
                          ${formatPrice(backtestResult.finalBalance)}
                        </span>
                      </div>
                      <div className="bg-white p-3 rounded border border-slate-100 flex flex-col justify-center">
                        <span className="block text-[10px] text-slate-400 uppercase font-bold mb-1">Net PnL</span>
                        <span className={`font-semibold text-lg leading-none ${backtestResult.netProfit > 0 ? "text-emerald-600" : "text-rose-600"}`}>
                          {backtestResult.netProfit > 0 ? "+" : "-"}${formatPrice(Math.abs(backtestResult.netProfit))}
                        </span>
                      </div>
                      <div className="bg-white p-3 rounded border border-slate-100 flex flex-col justify-center">
                        <span className="block text-[10px] text-slate-400 uppercase font-bold mb-1">Net PnL %</span>
                        <span className={`font-semibold text-lg leading-none ${backtestResult.netProfitPct > 0 ? "text-emerald-600" : "text-rose-600"}`}>
                          {backtestResult.netProfitPct > 0 ? "+" : ""}{backtestResult.netProfitPct?.toFixed(2)}%
                        </span>
                      </div>
                      <div className="bg-white p-3 rounded border border-slate-100 flex flex-col justify-center">
                        <span className="block text-[10px] text-slate-400 uppercase font-bold mb-1">Buy & Hold Return</span>
                        <span className={`font-semibold text-lg leading-none ${backtestResult.buyAndHoldReturn > 0 ? "text-emerald-600" : "text-rose-600"}`}>
                          {backtestResult.buyAndHoldReturn > 0 ? "+" : ""}{backtestResult.buyAndHoldReturn?.toFixed(2)}%
                        </span>
                      </div>
                      <div className="bg-white p-3 rounded border border-slate-100 flex flex-col justify-center">
                        <span className="block text-[10px] text-slate-400 uppercase font-bold mb-1">Win Rate</span>
                        <span className={`font-semibold text-lg leading-none ${backtestResult.winRate > 50 ? "text-emerald-600" : "text-rose-600"}`}>
                          {backtestResult.winRate?.toFixed(1)}%
                        </span>
                      </div>
                      <div className="bg-white p-3 rounded border border-slate-100 flex flex-col justify-center">
                        <span className="block text-[10px] text-slate-400 uppercase font-bold mb-1">Total Trades</span>
                        <span className="font-semibold text-lg leading-none text-slate-700">{backtestResult.totalTrades}</span>
                      </div>
                      <div className="bg-white p-3 rounded border border-slate-100 flex flex-col justify-center">
                        <span className="block text-[10px] text-slate-400 uppercase font-bold mb-1">Win / Loss Trades</span>
                        <span className="font-semibold text-lg leading-none text-slate-700">
                          {backtestResult.winningTradesCount || 0} / {backtestResult.losingTradesCount || 0}
                        </span>
                      </div>
                      <div className="bg-white p-3 rounded border border-slate-100 flex flex-col justify-center">
                        <span className="block text-[10px] text-slate-400 uppercase font-bold mb-1">Max Win Streak</span>
                        <span className="font-semibold text-lg leading-none text-emerald-600">{backtestResult.maxWinStreak || 0}</span>
                      </div>
                      <div className="bg-white p-3 rounded border border-slate-100 flex flex-col justify-center">
                        <span className="block text-[10px] text-slate-400 uppercase font-bold mb-1">Max Loss Streak</span>
                        <span className="font-semibold text-lg leading-none text-rose-600">{backtestResult.maxLossStreak || 0}</span>
                      </div>
                      <div className="bg-white p-3 rounded border border-slate-100 flex flex-col justify-center">
                        <span className="block text-[10px] text-slate-400 uppercase font-bold mb-1">Profit Factor</span>
                        <span className={`font-semibold text-lg leading-none ${backtestResult.profitFactor >= 1 ? "text-emerald-600" : "text-rose-600"}`}>
                          {backtestResult.profitFactor?.toFixed(2)}
                        </span>
                      </div>
                      <div className="bg-white p-3 rounded border border-slate-100 flex flex-col justify-center">
                        <span className="block text-[10px] text-slate-400 uppercase font-bold mb-1">Reward/Risk Ratio</span>
                        <span className="font-semibold text-lg leading-none text-indigo-600">
                          {backtestResult.avgLoss !== 0 ? ((backtestResult.avgWin || 0) / (Math.abs(backtestResult.avgLoss) || 1)).toFixed(2) : (backtestResult.avgWin > 0 ? '999.00' : '0.00')}
                        </span>
                      </div>
                      <div className="bg-white p-3 rounded border border-slate-100 flex flex-col justify-center">
                        <span className="block text-[10px] text-slate-400 uppercase font-bold mb-1">Max Drawdown</span>
                        <span className="font-semibold text-lg leading-none text-rose-600">{backtestResult.maxDrawdown?.toFixed(2)}%</span>
                      </div>
                      <div className="bg-white p-3 rounded border border-slate-100 flex flex-col justify-center">
                        <span className="block text-[10px] text-slate-400 uppercase font-bold mb-1">Gross Profit</span>
                        <span className="font-semibold text-lg leading-none text-emerald-600">+${formatPrice(backtestResult.grossProfit)}</span>
                      </div>
                      <div className="bg-white p-3 rounded border border-slate-100 flex flex-col justify-center">
                        <span className="block text-[10px] text-slate-400 uppercase font-bold mb-1">Gross Loss</span>
                        <span className="font-semibold text-lg leading-none text-rose-600">-${formatPrice(backtestResult.grossLoss)}</span>
                      </div>
                      <div className="bg-white p-3 rounded border border-slate-100 flex flex-col justify-center">
                        <span className="block text-[10px] text-slate-400 uppercase font-bold mb-1">Avg Win</span>
                        <span className="font-semibold text-lg leading-none text-emerald-600">+${formatPrice(backtestResult.avgWin)}</span>
                      </div>
                      <div className="bg-white p-3 rounded border border-slate-100 flex flex-col justify-center">
                        <span className="block text-[10px] text-slate-400 uppercase font-bold mb-1">Avg Loss</span>
                        <span className="font-semibold text-lg leading-none text-rose-600">-${formatPrice(backtestResult.avgLoss)}</span>
                      </div>
                      <div className="bg-white p-3 rounded border border-slate-100 flex flex-col justify-center">
                        <span className="block text-[10px] text-slate-400 uppercase font-bold mb-1">Avg Duration</span>
                        <span className="font-semibold text-lg leading-none text-slate-700">
                          {backtestResult.avgDurationMs ? (backtestResult.avgDurationMs > 3600000 ? (backtestResult.avgDurationMs / 3600000).toFixed(1) + 'h' : (backtestResult.avgDurationMs / 60000).toFixed(0) + 'm') : 'N/A'}
                        </span>
                      </div>
                    </div>

                    {/* Trades Table */}
                    {backtestResult.trades && backtestResult.trades.length > 0 && (
                      <div className="mt-4 bg-white border border-slate-200 rounded-lg overflow-hidden shadow-sm">
                        <div className="max-h-96 overflow-y-auto">
                          <table className="w-full text-[10px] text-left">
                            <thead className="bg-slate-50 sticky top-0 text-slate-500 shadow-sm">
                              <tr>
                                <th className="py-2 px-3 font-semibold">Date</th>
                                <th className="py-2 px-3 font-semibold">Side</th>
                                <th className="py-2 px-3 font-semibold">Reason</th>
                                <th className="py-2 px-3 font-semibold">Entry</th>
                                <th className="py-2 px-3 font-semibold">Exit</th>
                                <th className="py-2 px-3 font-semibold">PnL</th>
                                <th className="py-2 px-3 font-semibold text-right">Balance</th>
                              </tr>
                            </thead>
                            <tbody className="divide-y divide-slate-100">
                              {backtestResult.trades.map((t: any, i: number) => (
                                <tr key={i} className="hover:bg-slate-50">
                                  <td className="py-2 px-3 whitespace-nowrap">{new Date(t.time).toLocaleDateString()} {new Date(t.time).toLocaleTimeString()}</td>
                                  <td className={`py-2 px-3 font-bold ${t.side === 'BUY' ? 'text-emerald-600' : 'text-rose-600'}`}>{t.side}</td>
                                  <td className="py-2 px-3 text-slate-500 font-medium font-mono">{t.type || 'N/A'}</td>
                                  <td className="py-2 px-3">${t.entry.toFixed(2)}</td>
                                  <td className="py-2 px-3">${t.exit.toFixed(2)}</td>
                                  <td className={`py-2 px-3 font-semibold ${t.pnlAmount > 0 ? 'text-emerald-600' : 'text-rose-600'}`}>
                                    {t.pnlAmount > 0 ? '+' : ''}${t.pnlAmount.toFixed(2)}
                                  </td>
                                  <td className="py-2 px-3 text-right font-medium">${t.balanceAfter.toFixed(2)}</td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </div>
                      </div>
                    )}
                    <button onClick={saveBacktest} className="mt-3 w-full bg-slate-800 text-white font-bold py-2 rounded-lg text-sm hover:bg-slate-700 transition-all">
                      💾 Save Result
                    </button>
                  </div>
                )}

                {/* Optimization UI */}
                <div className="mt-6 p-4 bg-indigo-50 border border-indigo-200 rounded-xl shadow-sm relative">
                   <h3 className="text-sm font-bold text-indigo-800 mb-3 flex items-center gap-2">
                     <RefreshCw className="w-4 h-4 text-indigo-600" /> Strategy Optimization
                   </h3>
                   <p className="text-[10px] text-indigo-600 mb-3">Maximize performance using grid search or AI-driven evolutionary genetic search (Max 10k candles).</p>
                   
                   <div className="mb-4 grid grid-cols-2 gap-3">
                     <div>
                       <label className="block text-[10px] font-bold text-slate-500 mb-1">Optimization Method</label>
                       <select 
                         value={botConfig.optimizationMethod || 'grid'}
                         onChange={e => updateConfig('optimizationMethod', e.target.value)}
                         className="w-full bg-white border border-indigo-100 rounded px-2 py-1.5 text-xs text-slate-800 focus:outline-none focus:border-indigo-500"
                       >
                         <option value="grid">Grid Search (Optimize EMAs only)</option>
                         <option value="genetic">🧬 Genetic Algorithm (Optimize EMAs + Active Filters)</option>
                         <option value="brute_force">🔥 Brute Force (All Permutations)</option>
                       </select>
                     </div>
                     <div>
                       <label className="block text-[10px] font-bold text-slate-500 mb-1">Days to Optimize</label>
                       <input 
                         type="number"
                         min="1"
                         value={botConfig.optDays || 30}
                         onChange={e => updateConfig('optDays', e.target.value)}
                         className="w-full bg-white border border-indigo-100 rounded px-2 py-1.5 text-xs text-slate-800 focus:outline-none focus:border-indigo-500"
                       />
                     </div>
                   </div>

                    <div className="bg-indigo-100/30 p-3 rounded-lg border border-indigo-200/50 text-[10px] text-indigo-800 mb-4">
                      <span className="font-bold block mb-2">Assets to Optimize (Comma Separated):</span>
                      <input 
                        type="text" 
                        placeholder={`e.g. BTCUSDT, ETHUSDT (Leave blank for ${botConfig.symbol})`}
                        value={(botConfig.optSymbols || []).join(', ')}
                        onChange={(e) => {
                          const val = e.target.value;
                          updateConfig('optSymbols', val.split(',').map(s => s.trim().toUpperCase()).filter(s => s));
                        }}
                        className="w-full bg-white border border-indigo-100 rounded px-2 py-1.5 text-xs text-slate-800 focus:outline-none focus:border-indigo-500 uppercase"
                      />
                      <p className="mt-2 text-slate-500 text-[9px]">The optimizer will find the best configuration across these assets.</p>
                    </div>

                    <div className="bg-indigo-100/30 p-3 rounded-lg border border-indigo-200/50 text-[10px] text-indigo-800 mb-4">
                      <span className="font-bold block mb-2">Select Timeframes to Optimize:</span>
                      <div className="flex flex-wrap gap-4">
                        {['1m', '3m', '5m', '15m', '30m', '1h', '4h', '1d'].map(tf => {
                          const isChecked = (botConfig.optTimeframes || []).includes(tf);
                          return (
                            <label key={tf} className="flex items-center gap-1 cursor-pointer">
                              <input 
                                type="checkbox" 
                                checked={isChecked} 
                                onChange={e => {
                                  const current = botConfig.optTimeframes || [];
                                  let updated = e.target.checked 
                                    ? [...current, tf] 
                                    : current.filter((x: string) => x !== tf);
                                  if (updated.length === 0) updated = ['15m']; // Must have at least one
                                  updateConfig('optTimeframes', updated);
                                }}
                                className="rounded text-indigo-600 focus:ring-indigo-500 w-3 h-3" 
                              />
                              <span className="font-medium">{tf}</span>
                            </label>
                          );
                        })}
                      </div>
                      <p className="mt-2 text-slate-500 text-[9px]">The optimizer will download historical data for each selected timeframe and find the best one.</p>
                    </div>

                    {(botConfig.optimizationMethod === 'brute_force' || botConfig.optimizationMethod === 'genetic') && (
                      <div className="bg-indigo-100/30 p-3 rounded-lg border border-indigo-200/50 text-[10px] text-indigo-800 mb-4">
                        <span className="font-bold block mb-2">Select Filters to Permute:</span>
                        <div className="grid grid-cols-2 gap-2">
                          {[
                            { label: "RSI Filter", value: "useRsiFilter" },
                            { label: "Bollinger Bands", value: "useBbFilter" },
                            { label: "ATR Stop Loss", value: "useAtrSl" },
                            { label: "Trend Filter", value: "useTrendFilter" },
                            { label: "Price Confirm", value: "usePriceConfirmation" },
                            { label: "Volume Filter", value: "useVolumeFilter" },
                            { label: "Grid Pyramiding", value: "useGridPyramiding" }
                          ].map(f => {
                            const isChecked = (botConfig.filtersToOptimize || []).includes(f.value);
                            return (
                              <label key={f.value} className="flex items-center gap-1.5 cursor-pointer">
                                <input 
                                  type="checkbox" 
                                  checked={isChecked} 
                                  onChange={e => {
                                    const current = botConfig.filtersToOptimize || [];
                                    const updated = e.target.checked 
                                      ? [...current, f.value] 
                                      : current.filter((x: string) => x !== f.value);
                                    updateConfig('filtersToOptimize', updated);
                                  }}
                                  className="rounded text-indigo-600 focus:ring-indigo-500 w-3 h-3" 
                                />
                                <span>{f.label}</span>
                              </label>
                            );
                          })}
                        </div>
                        <p className="mt-2 text-slate-500 text-[9px]">Selected filters will be swept (toggled ON/OFF). Unselected filters will use their default settings above.</p>
                      </div>
                    )}

                    {botConfig.optimizationMethod === 'brute_force' && (
                      <div className="bg-indigo-100/30 p-3 rounded-lg border border-indigo-200/50 mb-4">
                        <span className="font-bold text-[10px] text-indigo-800 block mb-2">Parameter Grid Boundaries:</span>
                        <div className="grid grid-cols-2 gap-2 max-h-48 overflow-y-auto pr-1">
                           {[
                             { id: 'RSI Period', minKey: 'optRsiPeriodMin', maxKey: 'optRsiPeriodMax', filter: 'useRsiFilter' },
                             { id: 'RSI Overbought', minKey: 'optRsiObMin', maxKey: 'optRsiObMax', filter: 'useRsiFilter' },
                             { id: 'RSI Oversold', minKey: 'optRsiOsMin', maxKey: 'optRsiOsMax', filter: 'useRsiFilter' },
                             { id: 'BB Period', minKey: 'optBbPeriodMin', maxKey: 'optBbPeriodMax', filter: 'useBbFilter' },
                             { id: 'BB StdDev', minKey: 'optBbStdDevMin', maxKey: 'optBbStdDevMax', filter: 'useBbFilter' },
                             { id: 'ATR Multiplier', minKey: 'optAtrMultMin', maxKey: 'optAtrMultMax', filter: 'useAtrSl' },
                             { id: 'EMA Gap Min %', minKey: 'optEmaGapMin', maxKey: 'optEmaGapMax', filter: 'always' },
                             { id: 'Cooldown Candles', minKey: 'optCooldownMin', maxKey: 'optCooldownMax', filter: 'always' },
                             { id: 'Grid Step %', minKey: 'optGridStepMin', maxKey: 'optGridStepMax', filter: 'useGridPyramiding' },
                             { id: 'Pyramid Levels', minKey: 'optPyramidMin', maxKey: 'optPyramidMax', filter: 'useGridPyramiding' }
                           ].filter(p => p.filter === 'always' || (botConfig.filtersToOptimize || []).includes(p.filter)).map(p => (
                              <div key={p.id} className="bg-white p-1.5 border border-indigo-100 rounded">
                                <label className="block text-[9px] font-bold text-slate-500 mb-0.5">{p.id}</label>
                                <div className="flex gap-1">
                                  <input type="text" inputMode="decimal" placeholder="Min" value={botConfig[p.minKey]} onChange={e => updateConfig(p.minKey, e.target.value)} className="w-full bg-slate-50 border rounded px-1.5 py-0.5 text-[10px]" />
                                  <span className="text-slate-400 text-[10px]">-</span>
                                  <input type="text" inputMode="decimal" placeholder="Max" value={botConfig[p.maxKey]} onChange={e => updateConfig(p.maxKey, e.target.value)} className="w-full bg-slate-50 border rounded px-1.5 py-0.5 text-[10px]" />
                                </div>
                              </div>
                           ))}
                        </div>
                      </div>
                    )}

                   {(botConfig.optimizationMethod || 'grid') !== 'genetic' ? (
                     <div className="grid grid-cols-2 gap-3 mb-4">
                       <div className="bg-white p-2 border border-indigo-100 rounded">
                          <label className="block text-[10px] font-bold text-slate-500 mb-1">Fast EMA Range</label>
                          <div className="flex gap-2">
                            <input type="text" inputMode="decimal" placeholder="Min" value={botConfig.optFastEmaMin} onChange={e => updateConfig('optFastEmaMin', e.target.value)} className="w-full bg-slate-50 border rounded px-2 py-1 text-xs" />
                            <span className="text-slate-400">-</span>
                            <input type="text" inputMode="decimal" placeholder="Max" value={botConfig.optFastEmaMax} onChange={e => updateConfig('optFastEmaMax', e.target.value)} className="w-full bg-slate-50 border rounded px-2 py-1 text-xs" />
                          </div>
                       </div>
                       <div className="bg-white p-2 border border-indigo-100 rounded">
                          <label className="block text-[10px] font-bold text-slate-500 mb-1">Slow EMA Range</label>
                          <div className="flex gap-2">
                            <input type="text" inputMode="decimal" placeholder="Min" value={botConfig.optSlowEmaMin} onChange={e => updateConfig('optSlowEmaMin', e.target.value)} className="w-full bg-slate-50 border rounded px-2 py-1 text-xs" />
                            <span className="text-slate-400">-</span>
                            <input type="text" inputMode="decimal" placeholder="Max" value={botConfig.optSlowEmaMax} onChange={e => updateConfig('optSlowEmaMax', e.target.value)} className="w-full bg-slate-50 border rounded px-2 py-1 text-xs" />
                          </div>
                       </div>
                     </div>
                   ) : (
                     <div className="bg-indigo-100/50 p-2.5 rounded border border-indigo-200/50 text-[10px] text-indigo-700 mb-4 space-y-1">
                       <span className="font-bold block">🧬 Genetic Evolutionary Optimizer:</span>
                       <span>• Evolves parameters across 8 generations with elitism (pop size: 40).</span>
                       <span>• Automatically tunes Fast/Slow EMA periods.</span>
                       {botConfig.useRsiFilter && <span>• Automatically tunes RSI Period, Overbought & Oversold thresholds.</span>}
                       {botConfig.useBbFilter && <span>• Automatically tunes Bollinger Bands Period & Standard Deviation.</span>}
                       {botConfig.useAtrSl && <span>• Automatically tunes ATR Dynamic Stop Loss Multiplier.</span>}
                       {!botConfig.useRsiFilter && !botConfig.useBbFilter && !botConfig.useAtrSl && <span className="italic">• Enable RSI/BB filters or ATR stop loss to tune them simultaneously.</span>}
                     </div>
                   )}

                    <div className="flex gap-2">
                      <button
                        onClick={runOptimize}
                        disabled={isOptimizing}
                        className="flex-1 flex items-center justify-center gap-2 py-2 px-4 rounded-lg font-bold transition-all duration-200 bg-indigo-600 text-white hover:bg-indigo-500 disabled:opacity-50"
                      >
                        {isOptimizing ? 'Optimizing...' : 'Run Optimization'}
                      </button>
                      {isOptimizing && (
                        <button
                          onClick={async () => {
                            try {
                              await fetch('/api/optimize/stop', { method: 'POST' });
                            } catch (e) {
                              console.error(e);
                            }
                          }}
                          className="px-4 py-2 bg-rose-600 hover:bg-rose-500 text-white rounded-lg font-bold transition-colors shadow-sm"
                        >
                          Stop
                        </button>
                      )}
                    </div>

                  {(() => {
                    if (!optimizeResults || optimizeResults.length === 0) return null;

                    const applyResult = (r: any) => {
                      updateConfig('fastEmaPeriod', r.fastEma || r.fastEmaPeriod);
                      updateConfig('slowEmaPeriod', r.slowEma || r.slowEmaPeriod);
                      if (r.rsiPeriod !== undefined) updateConfig('rsiPeriod', r.rsiPeriod);
                      if (r.rsiOverbought !== undefined) updateConfig('rsiOverbought', r.rsiOverbought);
                      if (r.rsiOversold !== undefined) updateConfig('rsiOversold', r.rsiOversold);
                      if (r.bbPeriod !== undefined) updateConfig('bbPeriod', r.bbPeriod);
                      if (r.bbStdDev !== undefined) updateConfig('bbStdDev', r.bbStdDev);
                      if (r.atrMultiplier !== undefined) updateConfig('atrMultiplier', r.atrMultiplier);
                      if (r.timeframe !== undefined) updateConfig('timeframe', r.timeframe);
                      if (r.useRsiFilter !== undefined) updateConfig('useRsiFilter', r.useRsiFilter);
                      if (r.useBbFilter !== undefined) updateConfig('useBbFilter', r.useBbFilter);
                      if (r.useAtrSl !== undefined) updateConfig('useAtrSl', r.useAtrSl);
                      if (r.useTrendFilter !== undefined) updateConfig('useTrendFilter', r.useTrendFilter);
                      if (r.usePriceConfirmation !== undefined) updateConfig('usePriceConfirmation', r.usePriceConfirmation);
                      if (r.useVolumeFilter !== undefined) updateConfig('useVolumeFilter', r.useVolumeFilter);
                      if (r.useGridPyramiding !== undefined) updateConfig('useGridPyramiding', r.useGridPyramiding);
                      if (r.emaGapMinPct !== undefined) updateConfig('emaGapMinPct', r.emaGapMinPct);
                      if (r.cooldownCandles !== undefined) updateConfig('cooldownCandles', r.cooldownCandles);
                      if (r.gridStepPct !== undefined) updateConfig('gridStepPct', r.gridStepPct);
                      if (r.maxPyramidLevels !== undefined) updateConfig('maxPyramidLevels', r.maxPyramidLevels);
                      alert('✅ Strategy configuration applied!');
                    };

                    const addSlotFromResult = async (r: any, e: React.MouseEvent) => {
                      e.stopPropagation();
                      const sym = r.symbol || botConfig.symbol;
                      const payload = {
                        symbol: sym,
                        timeframe: r.timeframe || botConfig.timeframe,
                        fastEmaPeriod: r.fastEma ?? r.fastEmaPeriod ?? botConfig.fastEmaPeriod,
                        slowEmaPeriod: r.slowEma ?? r.slowEmaPeriod ?? botConfig.slowEmaPeriod,
                        size: botConfig.size,
                        leverage: botConfig.leverage,
                        allocationType: botConfig.allocationType,
                        orderType: botConfig.orderType,
                        takeProfitPct: botConfig.takeProfitPct,
                        stopLossPct: botConfig.stopLossPct,
                        strategy: botConfig.strategy,
                        tradeDirection: botConfig.tradeDirection,
                        useRsiFilter: r.useRsiFilter ?? false,
                        rsiPeriod: r.rsiPeriod ?? botConfig.rsiPeriod,
                        rsiOverbought: r.rsiOverbought ?? botConfig.rsiOverbought,
                        rsiOversold: r.rsiOversold ?? botConfig.rsiOversold,
                        useVolumeFilter: r.useVolumeFilter ?? false,
                        cooldownCandles: r.cooldownCandles ?? botConfig.cooldownCandles,
                        usePriceConfirmation: r.usePriceConfirmation ?? false,
                        emaGapMinPct: r.emaGapMinPct ?? botConfig.emaGapMinPct,
                        confirmCandles: botConfig.confirmCandles,
                        useTrendFilter: r.useTrendFilter ?? false,
                        useAtrSl: r.useAtrSl ?? false,
                        atrMultiplier: r.atrMultiplier ?? botConfig.atrMultiplier,
                        useBbFilter: r.useBbFilter ?? false,
                        bbPeriod: r.bbPeriod ?? botConfig.bbPeriod,
                        bbStdDev: r.bbStdDev ?? botConfig.bbStdDev,
                        useGridPyramiding: r.useGridPyramiding ?? false,
                        gridStepPct: r.gridStepPct ?? botConfig.gridStepPct,
                        maxPyramidLevels: r.maxPyramidLevels ?? botConfig.maxPyramidLevels,
                      };
                      try {
                        const resp = await fetch('/api/slots/add', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) });
                        const data = await resp.json();
                        if (data.success) {
                          fetchStatus();
                          fetchPositions();
                          alert(`✅ Slot added: ${payload.symbol} ${payload.timeframe} EMA${payload.fastEmaPeriod}/${payload.slowEmaPeriod}`);
                        } else {
                          alert(`❌ Failed: ${data.message}`);
                        }
                      } catch (err: any) {
                        alert(`❌ Error: ${err.message}`);
                      }
                    };

                    let filtered = optimizeResults.filter(r => {
                      if (optFilterTimeframe !== 'ALL' && r.timeframe !== optFilterTimeframe) return false;
                      if (optFilterMinWinRate && r.winRate < Number(optFilterMinWinRate)) return false;
                      if (optFilterMaxWinRate && r.winRate > Number(optFilterMaxWinRate)) return false;
                      if (optFilterMinProfit && r.netProfit < Number(optFilterMinProfit)) return false;
                      if (optFilterMaxProfit && r.netProfit > Number(optFilterMaxProfit)) return false;
                      if (optFilterMaxDrawdown && r.maxDrawdown > Number(optFilterMaxDrawdown)) return false;
                      if (optFilterMinPF && (r.profitFactor || 0) < Number(optFilterMinPF)) return false;
                      return true;
                    });

                    filtered.sort((a, b) => {
                      const valA = a[optSortBy] ?? 0;
                      const valB = b[optSortBy] ?? 0;
                      return optSortDesc ? valB - valA : valA - valB;
                    });

                    const ITEMS_PER_PAGE = 50;
                    const totalPages = Math.max(1, Math.ceil(filtered.length / ITEMS_PER_PAGE));
                    const safePage = Math.min(optPage, totalPages);
                    const paginated = filtered.slice((safePage - 1) * ITEMS_PER_PAGE, safePage * ITEMS_PER_PAGE);

                    const resetFilters = () => {
                      setOptFilterMinWinRate(''); setOptFilterMaxWinRate('');
                      setOptFilterMinProfit(''); setOptFilterMaxProfit('');
                      setOptFilterMaxDrawdown(''); setOptFilterMinPF('');
                      setOptFilterTimeframe('ALL'); setOptPage(1);
                    };

                    const inp = "w-full bg-white border border-indigo-100 rounded px-2 py-1 text-xs text-slate-800 focus:outline-none focus:ring-1 focus:ring-indigo-400";
                    const lbl = "block text-[9px] font-bold text-indigo-700 mb-0.5 uppercase tracking-wide";

                    return (
                      <div className="mt-4 bg-white border border-indigo-200 rounded-xl overflow-hidden flex flex-col shadow-sm">
                        {/* Header bar */}
                        <div className="flex items-center justify-between px-3 py-2 bg-gradient-to-r from-indigo-50 to-indigo-100/50 border-b border-indigo-100">
                          <span className="text-[10px] font-bold text-indigo-800">
                            {optimizeResults.length.toLocaleString()} combinations tested
                            {filtered.length < optimizeResults.length && ` · ${filtered.length.toLocaleString()} shown`}
                          </span>
                          <div className="flex gap-2">
                            <button onClick={() => setOptShowFilters(f => !f)} className={`text-[9px] px-2 py-1 rounded font-bold transition-colors ${optShowFilters ? 'bg-indigo-600 text-white' : 'bg-indigo-100 text-indigo-700 hover:bg-indigo-200'}`}>
                              {optShowFilters ? '▲ Hide Filters' : '▼ Show Filters'}
                            </button>
                            {(optFilterMinWinRate || optFilterMaxWinRate || optFilterMinProfit || optFilterMaxProfit || optFilterMaxDrawdown || optFilterMinPF || optFilterTimeframe !== 'ALL') && (
                              <button onClick={resetFilters} className="text-[9px] px-2 py-1 rounded font-bold bg-rose-100 text-rose-600 hover:bg-rose-200 transition-colors">✕ Clear</button>
                            )}
                          </div>
                        </div>

                        {/* Collapsible Filters */}
                        {optShowFilters && (
                          <div className="p-3 bg-indigo-50/40 border-b border-indigo-100">
                            <div className="grid grid-cols-2 gap-2 mb-2">
                              <div>
                                <label className={lbl}>Timeframe</label>
                                <select value={optFilterTimeframe} onChange={e => { setOptFilterTimeframe(e.target.value); setOptPage(1); }} className={inp}>
                                  <option value="ALL">All Timeframes</option>
                                  {Array.from(new Set(optimizeResults.map((r: any) => r.timeframe))).sort().map(tf => (
                                    <option key={String(tf)} value={String(tf)}>{String(tf)}</option>
                                  ))}
                                </select>
                              </div>
                              <div>
                                <label className={lbl}>Sort By</label>
                                <div className="flex gap-1">
                                  <select value={optSortBy} onChange={e => { setOptSortBy(e.target.value); setOptPage(1); }} className={inp + ' flex-1'}>
                                    <option value="netProfit">Net Profit $</option>
                                    <option value="netProfitPct">Net Profit %</option>
                                    <option value="winRate">Win Rate</option>
                                    <option value="maxDrawdown">Max Drawdown</option>
                                    <option value="profitFactor">Profit Factor</option>
                                    <option value="totalTrades">Total Trades</option>
                                  </select>
                                  <button onClick={() => setOptSortDesc(d => !d)} className="shrink-0 w-8 h-full bg-indigo-200 hover:bg-indigo-300 text-indigo-800 font-bold rounded text-xs transition-colors">
                                    {optSortDesc ? '↓' : '↑'}
                                  </button>
                                </div>
                              </div>
                            </div>
                            <div className="grid grid-cols-3 gap-2">
                              <div>
                                <label className={lbl}>Win Rate (%)</label>
                                <div className="flex gap-1 items-center">
                                  <input type="number" placeholder="Min" value={optFilterMinWinRate} onChange={e => { setOptFilterMinWinRate(e.target.value); setOptPage(1); }} className={inp} />
                                  <span className="text-slate-400 text-xs">–</span>
                                  <input type="number" placeholder="Max" value={optFilterMaxWinRate} onChange={e => { setOptFilterMaxWinRate(e.target.value); setOptPage(1); }} className={inp} />
                                </div>
                              </div>
                              <div>
                                <label className={lbl}>Net Profit ($)</label>
                                <div className="flex gap-1 items-center">
                                  <input type="number" placeholder="Min" value={optFilterMinProfit} onChange={e => { setOptFilterMinProfit(e.target.value); setOptPage(1); }} className={inp} />
                                  <span className="text-slate-400 text-xs">–</span>
                                  <input type="number" placeholder="Max" value={optFilterMaxProfit} onChange={e => { setOptFilterMaxProfit(e.target.value); setOptPage(1); }} className={inp} />
                                </div>
                              </div>
                              <div>
                                <label className={lbl}>Max Drawdown ≤ (%)</label>
                                <input type="number" placeholder="e.g. 20" value={optFilterMaxDrawdown} onChange={e => { setOptFilterMaxDrawdown(e.target.value); setOptPage(1); }} className={inp} />
                              </div>
                              <div>
                                <label className={lbl}>Min Profit Factor</label>
                                <input type="number" placeholder="e.g. 1.5" value={optFilterMinPF} onChange={e => { setOptFilterMinPF(e.target.value); setOptPage(1); }} className={inp} />
                              </div>
                            </div>
                          </div>
                        )}

                        {/* Results Table */}
                        <div className="overflow-auto" style={{maxHeight: '450px'}}>
                          <table className="w-full text-[10px] text-left border-collapse">
                            <thead className="bg-indigo-50 text-indigo-700 sticky top-0 z-10 border-b border-indigo-100">
                              <tr>
                                <th className="py-2 px-2 font-semibold whitespace-nowrap">Asset</th>
                                <th className="py-2 px-2 font-semibold whitespace-nowrap">TF</th>
                                <th className="py-2 px-2 font-semibold whitespace-nowrap">EMA Fast/Slow</th>
                                <th className="py-2 px-2 font-semibold">Active Filters</th>
                                <th className="py-2 px-2 font-semibold text-right cursor-pointer hover:text-indigo-900" onClick={() => { setOptSortBy('totalTrades'); setOptSortDesc(true); }}>Trades</th>
                                <th className="py-2 px-2 font-semibold text-right cursor-pointer hover:text-indigo-900" onClick={() => { setOptSortBy('winRate'); setOptSortDesc(true); }}>Win%</th>
                                <th className="py-2 px-2 font-semibold text-right cursor-pointer hover:text-indigo-900" onClick={() => { setOptSortBy('maxDrawdown'); setOptSortDesc(false); }}>DD%</th>
                                <th className="py-2 px-2 font-semibold text-right cursor-pointer hover:text-indigo-900" onClick={() => { setOptSortBy('profitFactor'); setOptSortDesc(true); }}>PF</th>
                                <th className="py-2 px-2 font-semibold text-right cursor-pointer hover:text-indigo-900" onClick={() => { setOptSortBy('netProfit'); setOptSortDesc(true); }}>Net Profit</th>
                                <th className="py-2 px-2 font-semibold text-right">Action</th>
                              </tr>
                            </thead>
                            <tbody className="divide-y divide-indigo-50/80">
                              {paginated.length === 0 ? (
                                <tr><td colSpan={10} className="py-10 text-center text-slate-400 font-medium">No results match your filters. Try relaxing the criteria.</td></tr>
                              ) : paginated.map((r: any, i: number) => (
                                <tr key={i} className="hover:bg-indigo-50/70 cursor-pointer transition-colors" onClick={() => applyResult(r)}>
                                  <td className="py-1.5 px-2 font-bold text-slate-800 whitespace-nowrap">
                                    {r.symbol || botConfig.symbol}
                                  </td>
                                  <td className="py-1.5 px-2 whitespace-nowrap">
                                    <span className="bg-indigo-100 text-indigo-700 px-1.5 py-0.5 rounded font-bold">{r.timeframe}</span>
                                  </td>
                                  <td className="py-1.5 px-2 font-mono font-bold whitespace-nowrap text-slate-700">
                                    {r.fastEma ?? r.fastEmaPeriod} / {r.slowEma ?? r.slowEmaPeriod}
                                  </td>
                                  <td className="py-1.5 px-2">
                                    <div className="flex flex-wrap gap-0.5">
                                      {r.useRsiFilter && <span className="bg-amber-50 text-amber-600 border border-amber-100 px-1 py-px rounded">RSI {r.rsiPeriod}({r.rsiOversold}/{r.rsiOverbought})</span>}
                                      {r.useBbFilter && <span className="bg-blue-50 text-blue-600 border border-blue-100 px-1 py-px rounded">BB {r.bbPeriod}({r.bbStdDev}σ)</span>}
                                      {r.useAtrSl && <span className="bg-rose-50 text-rose-600 border border-rose-100 px-1 py-px rounded">ATR {r.atrMultiplier}x</span>}
                                      {r.useGridPyramiding && <span className="bg-emerald-50 text-emerald-600 border border-emerald-100 px-1 py-px rounded">Grid {r.gridStepPct}%×{r.maxPyramidLevels}</span>}
                                      {r.useTrendFilter && <span className="bg-violet-50 text-violet-600 border border-violet-100 px-1 py-px rounded">Trend</span>}
                                      {r.usePriceConfirmation && <span className="bg-fuchsia-50 text-fuchsia-600 border border-fuchsia-100 px-1 py-px rounded">Price</span>}
                                      {r.useVolumeFilter && <span className="bg-cyan-50 text-cyan-600 border border-cyan-100 px-1 py-px rounded">Vol</span>}
                                      {r.emaGapMinPct > 0 && <span className="bg-slate-100 text-slate-600 border border-slate-200 px-1 py-px rounded">Gap {r.emaGapMinPct}%</span>}
                                      {r.cooldownCandles > 0 && <span className="bg-slate-100 text-slate-600 border border-slate-200 px-1 py-px rounded">CD {r.cooldownCandles}</span>}
                                      {!r.useRsiFilter && !r.useBbFilter && !r.useAtrSl && !r.useGridPyramiding && !r.useTrendFilter && !r.usePriceConfirmation && !r.useVolumeFilter && !(r.emaGapMinPct > 0) && !(r.cooldownCandles > 0) && (
                                        <span className="text-slate-300 italic">none</span>
                                      )}
                                    </div>
                                  </td>
                                  <td className="py-1.5 px-2 text-right font-mono text-slate-500">{r.totalTrades}</td>
                                  <td className={`py-1.5 px-2 text-right font-semibold whitespace-nowrap ${(r.winRate ?? 0) > 50 ? 'text-emerald-600' : 'text-rose-500'}`}>
                                    {(r.winRate ?? 0).toFixed(1)}%
                                  </td>
                                  <td className={`py-1.5 px-2 text-right whitespace-nowrap ${(r.maxDrawdown ?? 0) > 20 ? 'text-rose-500' : 'text-slate-500'}`}>
                                    {(r.maxDrawdown ?? 0).toFixed(1)}%
                                  </td>
                                  <td className={`py-1.5 px-2 text-right whitespace-nowrap ${(r.profitFactor ?? 0) >= 1 ? 'text-emerald-600' : 'text-rose-500'}`}>
                                    {r.profitFactor != null ? r.profitFactor.toFixed(2) : '—'}
                                  </td>
                                  <td className={`py-1.5 px-2 text-right font-bold whitespace-nowrap ${(r.netProfit ?? 0) > 0 ? 'text-emerald-600' : 'text-rose-500'}`}>
                                    ${(r.netProfit ?? 0).toFixed(2)}
                                    <span className="block text-[9px] font-normal opacity-70">{(r.netProfitPct ?? 0) > 0 ? '+' : ''}{(r.netProfitPct ?? 0).toFixed(1)}%</span>
                                  </td>
                                  <td className="py-1.5 px-2 text-right whitespace-nowrap">
                                    <div className="flex gap-1 justify-end">
                                      <button
                                        title="Apply settings to config form"
                                        onClick={(e) => { e.stopPropagation(); applyResult(r); }}
                                        className="text-[9px] px-1.5 py-0.5 rounded bg-indigo-100 text-indigo-700 hover:bg-indigo-200 font-bold transition-colors whitespace-nowrap"
                                      >⚙ Apply</button>
                                      <button
                                        title="Add as live trading slot"
                                        onClick={(e) => addSlotFromResult(r, e)}
                                        className="text-[9px] px-1.5 py-0.5 rounded bg-emerald-100 text-emerald-700 hover:bg-emerald-200 font-bold transition-colors whitespace-nowrap"
                                      >➕ Slot</button>
                                    </div>
                                  </td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </div>

                        {/* Pagination + footer */}
                        <div className="flex items-center justify-between px-3 py-2 bg-indigo-50/50 border-t border-indigo-100">
                          <span className="text-[9px] text-indigo-500 font-medium">
                            {filtered.length === 0 ? 'No results' : `${((safePage-1)*ITEMS_PER_PAGE)+1}–${Math.min(safePage*ITEMS_PER_PAGE, filtered.length)} of ${filtered.length.toLocaleString()}`}
                          </span>
                          {totalPages > 1 && (
                            <div className="flex items-center gap-1">
                              <button onClick={() => setOptPage(1)} disabled={safePage === 1} className="px-1.5 py-0.5 text-[9px] bg-white border border-indigo-200 rounded text-indigo-700 disabled:opacity-30">«</button>
                              <button onClick={() => setOptPage(p => Math.max(1, p-1))} disabled={safePage === 1} className="px-2 py-0.5 text-[9px] bg-white border border-indigo-200 rounded text-indigo-700 disabled:opacity-30">‹ Prev</button>
                              <span className="text-[9px] font-bold text-indigo-800 px-2">{safePage} / {totalPages}</span>
                              <button onClick={() => setOptPage(p => Math.min(totalPages, p+1))} disabled={safePage === totalPages} className="px-2 py-0.5 text-[9px] bg-white border border-indigo-200 rounded text-indigo-700 disabled:opacity-30">Next ›</button>
                              <button onClick={() => setOptPage(totalPages)} disabled={safePage === totalPages} className="px-1.5 py-0.5 text-[9px] bg-white border border-indigo-200 rounded text-indigo-700 disabled:opacity-30">»</button>
                            </div>
                          )}
                          <span className="text-[9px] text-indigo-400">Click row to apply</span>
                        </div>
                      </div>
                    );
                  })()}
                </div>
              </div>
            </div>

            {/* Saved Backtests */}
            {savedBacktests.length > 0 && (
              <div className="bg-white border border-slate-200 rounded-xl p-6 shadow-sm">
                <h2 className="text-sm font-semibold text-slate-500 mb-4 uppercase tracking-wider flex items-center justify-between">
                  <span>Saved Backtests</span>
                  <span className="bg-slate-100 text-slate-600 px-2 py-0.5 rounded text-[10px]">{savedBacktests.length}</span>
                </h2>
                <div className="space-y-3 max-h-96 overflow-y-auto pr-1">
                  {savedBacktests.map((run, i) => (
                    <div key={i} className="p-3 border border-slate-100 rounded-lg bg-slate-50 relative group">
                      <button onClick={() => deleteSaved(i)} className="absolute top-2 right-2 text-slate-300 hover:text-rose-500 opacity-0 group-hover:opacity-100 transition-opacity">
                        <X className="w-4 h-4" />
                      </button>
                      <div className="flex justify-between items-start mb-2">
                        <div>
                          <div className="font-bold text-slate-800 text-xs">{run.config.symbol} • {run.config.timeframe}</div>
                          <div className="text-[10px] text-slate-500">{new Date(run.timestamp).toLocaleString()}</div>
                        </div>
                        <div className="text-right">
                          <div className={`font-bold text-sm leading-none ${run.netProfit > 0 ? 'text-emerald-600' : 'text-rose-600'}`}>
                            ${run.netProfit.toFixed(2)}
                          </div>
                          <div className="text-[10px] text-slate-500 mt-1">Net PnL</div>
                        </div>
                      </div>
                      <div className="grid grid-cols-3 gap-2 text-[10px] mt-2 pt-2 border-t border-slate-200">
                        <div><span className="text-slate-400 block">EMA</span><span className="font-semibold text-slate-700">{run.config.fastEmaPeriod}/{run.config.slowEmaPeriod}</span></div>
                        <div><span className="text-slate-400 block">Win Rate</span><span className="font-semibold text-slate-700">{run.winRate.toFixed(1)}%</span></div>
                        <div><span className="text-slate-400 block">Drawdown</span><span className="font-semibold text-slate-700">{run.maxDrawdown.toFixed(1)}%</span></div>
                      </div>
                      <button onClick={() => setBotConfig(prev => ({ ...prev, ...run.config }))} className="mt-2 w-full py-1.5 bg-white border border-slate-200 text-[10px] font-semibold text-slate-600 rounded hover:bg-slate-100 transition-colors">
                        Load Configuration
                      </button>
                    </div>
                  ))}
                </div>
              </div>
            )}

            <div className="bg-white border border-slate-200 rounded-xl p-6 shadow-sm">
              <h2 className="text-sm font-semibold text-slate-500 mb-4 uppercase tracking-wider">Engine Control</h2>
              
              <button 
                onClick={toggleBot}
                className={`w-full flex items-center justify-center gap-2 py-3 px-4 rounded-lg font-bold transition-all duration-200 ${
                  isRunning 
                    ? 'bg-rose-600 text-white hover:bg-rose-500 border border-rose-600 shadow-sm' 
                    : 'bg-emerald-600 text-white hover:bg-emerald-500 border border-emerald-600 shadow-sm'
                }`}
              >
                {isRunning ? (
                  <><Square className="w-4 h-4 fill-current" /> Stop Engine</>
                ) : (
                  <><Play className="w-4 h-4 fill-current" /> Start Engine</>
                )}
              </button>

              {slots.length === 0 && !isRunning && (
                <div className="mt-4 flex items-start gap-2 text-xs text-slate-500 bg-slate-50 p-3 rounded-lg border border-slate-200">
                  <AlertCircle className="w-4 h-4 text-amber-600 shrink-0" />
                  Add at least one trading slot above, then start the engine.
                </div>
              )}

              <button
                onClick={handlePing}
                disabled={isPinging}
                className="w-full mt-4 flex items-center justify-center gap-2 py-2 px-4 rounded-lg font-semibold transition-all duration-200 bg-slate-50 text-slate-700 hover:bg-slate-100 border border-slate-200 shadow-sm disabled:opacity-50"
              >
                <RefreshCw className={`w-4 h-4 ${isPinging ? 'animate-spin' : ''}`} /> 
                {isPinging ? 'Pinging API...' : 'Ping Delta API'}
              </button>

              {pingData && (
                <div className="mt-4 p-3 bg-slate-50 border border-slate-200 rounded-lg text-xs space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="text-slate-500 font-medium">Status</span>
                    {pingData.success ? (
                      <span className="text-emerald-600 font-bold tracking-wide">CONNECTED</span>
                    ) : (
                      <span className="text-rose-600 font-bold tracking-wide">FAILED</span>
                    )}
                  </div>
                  
                  {pingData.profile && (
                    <div className="flex flex-col border-t border-slate-200 pt-2 gap-1">
                      <span className="text-slate-500 font-medium">Account Details</span>
                      <span className="text-slate-800 font-semibold">{(pingData.profile.first_name || '') + ' ' + (pingData.profile.last_name || '')} ({pingData.profile.email})</span>
                      <span className="text-slate-400 font-mono text-[10px]">ID: {pingData.profile.id}</span>
                    </div>
                  )}

                  {pingData.assets && (
                    <div className="flex flex-col border-t border-slate-200 pt-2 gap-1">
                      <span className="text-slate-500 font-medium mb-1">Assets</span>
                      {pingData.assets.length > 0 ? (
                        pingData.assets.map((a: any, i: number) => (
                           <div key={i} className="flex justify-between font-mono">
                             <span className="text-slate-600 font-semibold">{a.asset}</span>
                             <span className="text-slate-800 font-bold">{a.total} <span className="text-slate-400 font-normal">(Free: {a.free})</span></span>
                           </div>
                        ))
                      ) : (
                        <span className="text-slate-400">No balances</span>
                      )}
                    </div>
                  )}

                  {!pingData.success && (
                    <div className="text-rose-600 mt-2 whitespace-pre-wrap">{pingData.message}</div>
                  )}
                </div>
              )}

              <div className="grid grid-cols-2 gap-3 mt-4 pt-4 border-t border-slate-200">
                <button 
                  onClick={() => executeManualTrade('BUY')}
                  className="flex items-center justify-center py-2 bg-emerald-50 text-emerald-700 hover:bg-emerald-100 border border-emerald-200 rounded-lg text-sm font-semibold shadow-sm transition-colors"
                >
                  Buy (Long)
                </button>
                <button 
                  onClick={() => executeManualTrade('SELL')}
                  className="flex items-center justify-center py-2 bg-rose-50 text-rose-700 hover:bg-rose-100 border border-rose-200 rounded-lg text-sm font-semibold shadow-sm transition-colors"
                >
                  Sell (Short)
                </button>
              </div>

              <div className="mt-4 pt-4 border-t border-slate-200">
                <button 
                  onClick={clearMemory}
                  className="w-full flex items-center justify-center gap-2 py-2 px-4 rounded-lg font-semibold transition-all duration-200 bg-slate-50 text-slate-500 hover:bg-rose-50 hover:text-rose-600 border border-slate-200 hover:border-rose-200 shadow-sm"
                >
                  <Trash2 className="w-4 h-4" /> Clear All Slots & Memory
                </button>
              </div>
            </div>
          </div>

          {/* Main Content Column */}
          <div className="md:col-span-2 flex flex-col gap-6">
            {/* Active Trading Slots */}
            <div className="flex-shrink-0 bg-white border border-slate-200 rounded-xl shadow-sm overflow-hidden">
              <div className="px-5 py-4 border-b border-slate-100 bg-slate-50/50">
                <h2 className="text-base font-bold text-slate-800 flex items-center gap-2">
                  Active Trading Slots ({slots.length})
                </h2>
              </div>
              <div className="p-4 min-h-[100px]">
                {slots.length === 0 ? (
                  <div className="py-8 text-center text-slate-400 font-medium">
                    No trading slots configured. Use the form on the left to add slots.
                  </div>
                ) : (
                  <div className="grid gap-3">
                    {slots.map((slot) => (
                      <div key={slot.id} className="flex items-center justify-between gap-4 p-4 bg-slate-50 border border-slate-200 rounded-xl hover:border-indigo-200 transition-colors">
                        <div className="flex items-center gap-3 flex-wrap">
                          <span className="text-lg font-extrabold text-slate-900">{slot.symbol}</span>
                          <span className="text-xs font-semibold bg-indigo-100 text-indigo-700 px-2.5 py-1 rounded-full">
                            {TIMEFRAME_LABELS[slot.timeframe] || slot.timeframe}
                          </span>
                          <span className="text-xs font-mono text-slate-600">
                            EMA {slot.fastEmaPeriod}/{slot.slowEmaPeriod}
                          </span>
                          <span className="text-xs text-slate-500">
                            Size: {slot.size} | {slot.leverage}x
                          </span>
                          <span className="text-xs text-slate-500">
                            {slot.strategy === 'always_in' ? '🔄 S&R' : '📋 Std'} | {slot.tradeDirection === 'long' ? '📈 L' : slot.tradeDirection === 'short' ? '📉 S' : '↕️ B'}
                          </span>
                          {slot.useRsiFilter && (
                            <span className="text-[10px] font-semibold bg-amber-100 text-amber-700 px-2 py-0.5 rounded-full">
                              RSI({slot.rsiPeriod || 14})
                            </span>
                          )}
                          {slot.useVolumeFilter && (
                            <span className="text-[10px] font-semibold bg-cyan-100 text-cyan-700 px-2 py-0.5 rounded-full">
                              Vol✓
                            </span>
                          )}
                          {slot.usePriceConfirmation && (
                            <span className="text-[10px] font-semibold bg-violet-100 text-violet-700 px-2 py-0.5 rounded-full">
                              Price✓
                            </span>
                          )}
                          {slot.useTrendFilter && (
                            <span className="text-[10px] font-semibold bg-emerald-100 text-emerald-700 px-2 py-0.5 rounded-full">
                              Trend✓
                            </span>
                          )}
                          {slot.useAtrSl && (
                            <span className="text-[10px] font-semibold bg-orange-100 text-orange-700 px-2 py-0.5 rounded-full">
                              ATR-SL
                            </span>
                          )}
                          {slot.useBbFilter && (
                            <span className="text-[10px] font-semibold bg-blue-100 text-blue-700 px-2 py-0.5 rounded-full">
                              BB✓
                            </span>
                          )}
                          {(slot.confirmCandles || 1) >= 2 && (
                            <span className="text-[10px] font-semibold bg-indigo-100 text-indigo-700 px-2 py-0.5 rounded-full">
                              2-Candle Confirm
                            </span>
                          )}
                          {(slot.cooldownCandles || 0) > 0 && (
                            <span className="text-[10px] font-semibold bg-slate-200 text-slate-600 px-2 py-0.5 rounded-full">
                              CD:{slot.cooldownCandles}
                            </span>
                          )}
                          {slot.lastSignal && slot.lastSignal !== 'NONE' && (
                            <span className={`text-xs font-bold px-2 py-0.5 rounded-full ${
                              slot.lastSignal === 'BUY' 
                                ? 'bg-emerald-100 text-emerald-700' 
                                : 'bg-rose-100 text-rose-700'
                            }`}>
                              Last: {slot.lastSignal}
                            </span>
                          )}
                          {(slot.tradesExecuted || 0) > 0 && (
                            <span className="text-[10px] font-mono text-slate-400">
                              {slot.tradesExecuted} trades
                            </span>
                          )}
                        </div>
                        <button
                          onClick={() => removeSlot(slot.id)}
                          disabled={isRunning}
                          className="p-2 text-slate-400 hover:text-rose-600 hover:bg-rose-50 rounded-lg transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
                          title="Remove slot"
                        >
                          <X className="w-5 h-5" />
                        </button>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>

            {/* Account Balances */}
            <div className="flex-shrink-0 bg-white border border-slate-200 rounded-xl shadow-sm overflow-hidden">
              <div className="px-5 py-4 border-b border-slate-100 bg-slate-50/50">
                <h2 className="text-base font-bold text-slate-800 flex items-center gap-2">
                  Account Balances
                </h2>
              </div>
              <div className="p-4 min-h-[120px] max-h-[400px] overflow-auto">
                <table className="w-full text-left text-lg whitespace-nowrap">
                  <thead className="border-b border-slate-200 bg-slate-50">
                    <tr>
                      <th className="py-3 px-4 font-semibold text-slate-600">Asset</th>
                      <th className="py-3 px-4 font-semibold text-slate-600 text-right">Total</th>
                      <th className="py-3 px-4 font-semibold text-slate-600 text-right">Free</th>
                      <th className="py-3 px-4 font-semibold text-slate-600 text-right">Used</th>
                    </tr>
                  </thead>
                  <tbody>
                    {balances.length === 0 ? (
                      <tr>
                         <td colSpan={4} className="py-8 text-center text-slate-400 font-medium text-lg">No positive balances available</td>
                      </tr>
                    ) : (
                      balances.map((b, idx) => (
                        <tr key={idx} className="border-b border-slate-100 last:border-0 hover:bg-slate-50/50 transition-colors">
                          <td className="py-4 px-4 font-extrabold text-slate-900 text-xl">
                            {b.asset}
                          </td>
                          <td className="py-4 px-4 text-slate-900 text-right font-mono text-lg font-bold">{Number(b.total).toFixed(8).replace(/\.?0+$/, '') || '0'}</td>
                          <td className="py-4 px-4 text-slate-800 text-right font-mono text-lg">{Number(b.free).toFixed(8).replace(/\.?0+$/, '') || '0'}</td>
                          <td className="py-4 px-4 text-slate-500 text-right font-mono text-lg">{Number(b.used).toFixed(8).replace(/\.?0+$/, '') || '0'}</td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            </div>
            
            {/* Active Positions — ALL symbols */}
            <div className="flex-shrink-0 bg-white border border-slate-200 rounded-xl shadow-sm overflow-hidden">
              <div className="px-5 py-4 border-b border-slate-100 bg-slate-50/50">
                <h2 className="text-base font-bold text-slate-800 flex items-center gap-2">
                  Active Positions (All Assets)
                </h2>
              </div>
              <div className="p-4 min-h-[120px] max-h-[600px] overflow-auto">
                <table className="w-full text-left text-lg whitespace-nowrap">
                  <thead className="border-b border-slate-200 bg-slate-50">
                    <tr>
                      <th className="py-3 px-4 font-semibold text-slate-600">Symbol</th>
                      <th className="py-3 px-4 font-semibold text-slate-600">Side</th>
                      <th className="py-3 px-4 font-semibold text-slate-600">Size</th>
                      <th className="py-3 px-4 font-semibold text-slate-600">Entry Price</th>
                      <th className="py-3 px-4 font-semibold text-slate-600">Liq. Price</th>
                      <th className="py-3 px-4 font-semibold text-slate-600">PnL</th>
                      <th className="py-3 px-4 font-semibold text-slate-600 text-right">Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {positions.filter(p => Math.abs(Number(p.contracts || 0)) > 0).length === 0 ? (
                      <tr>
                        <td colSpan={7} className="py-8 text-center text-slate-400 font-medium text-lg">No active positions</td>
                      </tr>
                    ) : (
                      positions.filter(p => Math.abs(Number(p.contracts || 0)) > 0).map((pos, idx) => (
                        <tr key={idx} className="border-b border-slate-100 last:border-0 hover:bg-slate-50/50 transition-colors">
                          <td className="py-4 px-4 font-extrabold text-slate-900 text-lg">
                            {pos.symbol}
                          </td>
                          <td className={`py-4 px-4 font-black text-xl ${pos.side === 'long' || pos.side === 'buy' ? 'text-emerald-600' : 'text-rose-600'} uppercase tracking-wide`}>
                            {pos.side}
                          </td>
                          <td className="py-4 px-4 text-slate-900 font-mono text-xl font-bold">{Math.abs(Number(pos.contracts))}</td>
                          <td className="py-4 px-4 text-slate-800 font-mono text-lg">{Number(pos.entryPrice || 0).toFixed(4).replace(/\.?0+$/, '') || '0'}</td>
                          <td className="py-4 px-4 text-amber-600 font-mono text-lg font-semibold">{pos.liquidationPrice ? Number(pos.liquidationPrice).toFixed(4).replace(/\.?0+$/, '') : '-'}</td>
                          <td className="py-4 px-4 font-mono font-bold">
                            {pos.info?.realized_pnl ? (
                              <span className={Number(pos.info.realized_pnl) >= 0 ? 'text-emerald-700 bg-emerald-50 px-3 py-1.5 rounded-lg border border-emerald-200 text-xl font-extrabold shadow-sm' : 'text-rose-700 bg-rose-50 px-3 py-1.5 rounded-lg border border-rose-200 text-xl font-extrabold shadow-sm'}>
                                {Number(pos.info.realized_pnl) > 0 ? '+' : ''}{Number(pos.info.realized_pnl).toFixed(4).replace(/\.?0+$/, '') || '0'}
                              </span>
                            ) : '-'}
                          </td>
                          <td className="py-4 px-4 text-right">
                            <button 
                              onClick={() => closePosition(pos.symbol, pos.side, Math.abs(Number(pos.contracts)))}
                              className="px-5 py-2.5 bg-rose-600 hover:bg-rose-500 text-white font-bold rounded-xl text-base transition-all shadow-md active:scale-95"
                            >
                              CLOSE
                            </button>
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            </div>

          </div>
        </div>
      </div>
    </div>
  );
}
