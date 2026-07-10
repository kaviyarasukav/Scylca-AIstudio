const fs = require('fs');

let content = fs.readFileSync('server.ts', 'utf8');

// Add tradeDirection to TradingSlot
content = content.replace(
  "strategy: 'always_in' | 'standard';",
  "strategy: 'always_in' | 'standard';\n  tradeDirection?: 'both' | 'long' | 'short';"
);

// Add tradeDirection to formConfig
content = content.replace(
  "strategy: 'always_in'",
  "strategy: 'always_in',\n  tradeDirection: 'both'"
);

// Add tradeDirection to ALLOWED_FORM_CONFIG_KEYS
content = content.replace(
  "'takeProfitPct', 'stopLossPct', 'strategy',",
  "'takeProfitPct', 'stopLossPct', 'strategy', 'tradeDirection',"
);

// Extract tradeDirection from req.body when adding slot
content = content.replace(
  "allocationType, orderType, takeProfitPct, stopLossPct, strategy,",
  "allocationType, orderType, takeProfitPct, stopLossPct, strategy, tradeDirection,"
);

// Include tradeDirection in newSlot creation
content = content.replace(
  "strategy:              strategy        || 'always_in',",
  "strategy:              strategy        || 'always_in',\n    tradeDirection:        tradeDirection  || 'both',"
);

// Also add to loopBot cycle
let crossReplace = `  const isCrossUp   = prevFast <= prevSlow && currFast > currSlow;
  const isCrossDown = prevFast >= prevSlow && currFast < currSlow;
  
  let finalBuy  = isCrossUp && (slot.tradeDirection === 'both' || slot.tradeDirection === 'long');
  let finalSell = isCrossDown && (slot.tradeDirection === 'both' || slot.tradeDirection === 'short');`;

content = content.replace(
  /let finalBuy\s*=\s*isCrossUp;\s*let finalSell\s*=\s*isCrossDown;/,
  crossReplace
);

fs.writeFileSync('server.ts', content);
