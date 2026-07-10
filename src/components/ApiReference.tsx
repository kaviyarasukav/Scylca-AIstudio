import React, { useState } from 'react';
import { ChevronDown, ChevronUp, Play, Code, Database, Clock, Activity, AlertCircle, Terminal } from 'lucide-react';

interface ApiSection {
  id: string;
  title: string;
  method: string;
  endpoint: string;
  description: string;
  icon: React.ReactNode;
  params: { name: string; type: string; placeholder: string; required?: boolean }[];
  defaultParams?: Record<string, any>;
  runFunc: (params: Record<string, any>) => Promise<any>;
}

export default function ApiReference() {
  const [openSection, setOpenSection] = useState<string | null>('products');
  const [loading, setLoading] = useState<string | null>(null);
  const [results, setResults] = useState<Record<string, any>>({});
  const [formState, setFormState] = useState<Record<string, any>>({
    'tickers-symbol': 'BTCUSDT',
    'history-symbol': 'BTCUSDT',
    'history-resolution': '15m',
    'orders-product_id': '27', // typically BTCUSDT
    'orders-size': '10',
    'orders-side': 'buy',
    'orders-order_type': 'market_order'
  });

  const handleInputChange = (sectionId: string, paramName: string, value: string) => {
    setFormState(prev => ({ ...prev, [`${sectionId}-${paramName}`]: value }));
  };

  const executeApi = async (section: ApiSection) => {
    setLoading(section.id);
    setResults(prev => ({ ...prev, [section.id]: null })); // clear old result
    try {
      const params = section.params.reduce((acc, param) => {
        acc[param.name] = formState[`${section.id}-${param.name}`];
        return acc;
      }, {} as Record<string, any>);
      const result = await section.runFunc(params);
      setResults(prev => ({ ...prev, [section.id]: { success: true, data: result } }));
    } catch (err: any) {
      setResults(prev => ({ ...prev, [section.id]: { success: false, error: err.message } }));
    } finally {
      setLoading(null);
    }
  };

  const sections: ApiSection[] = [
    {
      id: 'products',
      title: 'Products API',
      method: 'GET',
      endpoint: '/v2/products',
      description: 'Get a list of all active products on Delta Exchange.',
      icon: <Database className="w-5 h-5 text-indigo-400" />,
      params: [],
      runFunc: async () => {
        const res = await fetch('/api/delta/products');
        return await res.json();
      }
    },
    {
      id: 'tickers',
      title: 'Tickers API',
      method: 'GET',
      endpoint: '/v2/tickers/:symbol',
      description: 'Get real-time 24h ticker data for a specific product symbol.',
      icon: <Activity className="w-5 h-5 text-emerald-400" />,
      params: [
        { name: 'symbol', type: 'text', placeholder: 'e.g. BTCUSDT', required: true }
      ],
      runFunc: async (p) => {
        const res = await fetch(`/api/delta/tickers/${p.symbol}`);
        return await res.json();
      }
    },
    {
      id: 'history',
      title: 'Historical Candles',
      method: 'GET',
      endpoint: '/v2/history/candles',
      description: 'Fetch historical OHLCV data for charting and backtesting.',
      icon: <Clock className="w-5 h-5 text-violet-400" />,
      params: [
        { name: 'symbol', type: 'text', placeholder: 'e.g. BTCUSDT', required: true },
        { name: 'resolution', type: 'text', placeholder: '1m, 5m, 15m, 1h, 1d', required: true },
        { name: 'start', type: 'number', placeholder: 'Start timestamp (seconds)', required: false },
        { name: 'end', type: 'number', placeholder: 'End timestamp (seconds)', required: false }
      ],
      runFunc: async (p) => {
        const q = new URLSearchParams();
        if (p.symbol) q.append('symbol', p.symbol);
        if (p.resolution) q.append('resolution', p.resolution);
        if (p.start) q.append('start', p.start);
        if (p.end) q.append('end', p.end);
        const res = await fetch(`/api/delta/history/candles?${q.toString()}`);
        return await res.json();
      }
    },
    {
      id: 'orders',
      title: 'Place Order (Authenticated)',
      method: 'POST',
      endpoint: '/v2/orders',
      description: 'Place a new market or limit order. Requires configured API keys.',
      icon: <Code className="w-5 h-5 text-rose-400" />,
      params: [
        { name: 'product_id', type: 'number', placeholder: 'Product ID (e.g., 27 for BTCUSDT)', required: true },
        { name: 'size', type: 'number', placeholder: 'Order size (contracts)', required: true },
        { name: 'side', type: 'text', placeholder: 'buy or sell', required: true },
        { name: 'order_type', type: 'text', placeholder: 'market_order or limit_order', required: true }
      ],
      runFunc: async (p) => {
        const res = await fetch('/api/delta/orders', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(p)
        });
        return await res.json();
      }
    }
  ];

  return (
    <div className="max-w-4xl mx-auto space-y-4 font-sans text-slate-200 py-6">
      <div className="mb-8 p-6 bg-slate-900 border border-slate-800 rounded-xl shadow-lg">
        <h2 className="text-3xl font-bold text-white flex items-center gap-3">
          <Terminal className="w-8 h-8 text-indigo-500" /> 
          Delta API Playground
        </h2>
        <p className="text-slate-400 mt-2">
          Test and explore the Delta India API endpoints directly from your browser. 
          Responses are proxied through the backend to handle CORS and authentication seamlessly.
        </p>
      </div>

      <div className="space-y-4">
        {sections.map(section => (
          <div key={section.id} className="bg-slate-900 border border-slate-800 rounded-xl overflow-hidden shadow-lg transition-all">
            <button 
              onClick={() => setOpenSection(openSection === section.id ? null : section.id)}
              className="w-full flex items-center justify-between p-5 bg-slate-900 hover:bg-slate-800/80 transition-colors"
            >
              <div className="flex items-center gap-4">
                <div className="p-2 bg-slate-800 rounded-lg">
                  {section.icon}
                </div>
                <div className="text-left">
                  <h3 className="font-bold text-slate-100">{section.title}</h3>
                  <div className="flex items-center gap-2 mt-1">
                    <span className={`text-[10px] font-bold px-2 py-0.5 rounded ${section.method === 'GET' ? 'bg-indigo-500/20 text-indigo-400' : 'bg-rose-500/20 text-rose-400'}`}>
                      {section.method}
                    </span>
                    <span className="text-xs text-slate-400 font-mono">{section.endpoint}</span>
                  </div>
                </div>
              </div>
              {openSection === section.id ? <ChevronUp className="w-5 h-5 text-slate-500" /> : <ChevronDown className="w-5 h-5 text-slate-500" />}
            </button>
            
            {openSection === section.id && (
              <div className="p-5 border-t border-slate-800 bg-slate-950/50">
                <p className="text-sm text-slate-400 mb-6">{section.description}</p>
                
                <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                  {/* Left: Form */}
                  <div>
                    <h4 className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-4">Request Parameters</h4>
                    {section.params.length === 0 ? (
                      <p className="text-sm text-slate-500 italic mb-4">No parameters required.</p>
                    ) : (
                      <div className="space-y-3 mb-6">
                        {section.params.map(param => (
                          <div key={param.name}>
                            <label className="block text-xs text-slate-400 mb-1 font-mono">
                              {param.name} {param.required && <span className="text-rose-500">*</span>}
                            </label>
                            <input 
                              type={param.type}
                              value={formState[`${section.id}-${param.name}`] || ''}
                              onChange={(e) => handleInputChange(section.id, param.name, e.target.value)}
                              placeholder={param.placeholder}
                              className="w-full bg-slate-900 border border-slate-700 rounded-lg px-3 py-2 text-sm text-slate-200 focus:outline-none focus:border-indigo-500 transition-colors font-mono"
                            />
                          </div>
                        ))}
                      </div>
                    )}
                    
                    <button 
                      onClick={() => executeApi(section)}
                      disabled={loading === section.id}
                      className="flex items-center gap-2 bg-indigo-600 hover:bg-indigo-500 text-white px-5 py-2.5 rounded-lg text-sm font-semibold transition-all disabled:opacity-50"
                    >
                      {loading === section.id ? (
                        <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                      ) : (
                        <Play className="w-4 h-4" />
                      )}
                      Run Request
                    </button>
                  </div>
                  
                  {/* Right: Response */}
                  <div className="flex flex-col h-full">
                    <h4 className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-4 flex items-center justify-between">
                      Response
                      {results[section.id]?.success === false && (
                        <span className="text-rose-400 flex items-center gap-1 normal-case font-normal"><AlertCircle className="w-3 h-3"/> Error</span>
                      )}
                    </h4>
                    <div className="bg-slate-900 border border-slate-800 rounded-lg p-4 font-mono text-xs overflow-auto flex-grow max-h-[300px]">
                      {results[section.id] ? (
                        <pre className={results[section.id].success ? 'text-emerald-400' : 'text-rose-400'}>
                          {JSON.stringify(results[section.id].success ? results[section.id].data : results[section.id].error, null, 2)}
                        </pre>
                      ) : (
                        <span className="text-slate-600">Hit "Run Request" to see the output here...</span>
                      )}
                    </div>
                  </div>
                </div>
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
