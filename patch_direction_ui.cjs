const fs = require('fs');
let content = fs.readFileSync('src/App.tsx', 'utf8');

let directionSelect = `
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
`;

content = content.replace(
  "{/* === SIGNAL QUALITY === */}",
  directionSelect + "\n                {/* === SIGNAL QUALITY === */}"
);

// Add tradeDirection to slot render
content = content.replace(
  "{slot.strategy === 'always_in' ? '🔄 S&R' : '📋 Std'}",
  "{slot.strategy === 'always_in' ? '🔄 S&R' : '📋 Std'} | {slot.tradeDirection === 'long' ? '📈 L' : slot.tradeDirection === 'short' ? '📉 S' : '↕️ B'}"
);

fs.writeFileSync('src/App.tsx', content);
