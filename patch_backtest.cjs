const fs = require('fs');

let content = fs.readFileSync('server.ts', 'utf8');

// 1. Update simulateBacktest signature
content = content.replace(
  "function simulateBacktest(config: any, data: any) {",
  "function simulateBacktest(config: any, data: any, contractValue: number = 1) {"
);

// 2. Add tradeDirection parsing
content = content.replace(
  "const sizeVal        = Number(config.size) || 10;",
  "const sizeVal        = Number(config.size) || 10;\n  const tradeDirection = config.tradeDirection || 'both';"
);

// 3. Update Pyramiding marginToAdd
let pyraReplace = `             if (allocationType === 'fixed') marginToAdd = (sizeVal * contractValue * fillPrice) / leverage;
             else if (allocationType === 'percent') marginToAdd = balance * (Math.min(sizeVal, 100) / 100);
             else marginToAdd = sizeVal;`;
content = content.replace(
  /if \(allocationType === 'fixed'\) marginToAdd = sizeVal;\s*else if \(allocationType === 'percent'\) marginToAdd = balance \* \(sizeVal \/ 100\);\s*else marginToAdd = sizeVal;/,
  pyraReplace
);

// 4. Update Initial margin calculation
let initReplace = `      if (allocationType === 'fixed') {
        positionMargin = (sizeVal * contractValue * entryPrice) / leverage;
      } else if (allocationType === 'percent') {
        positionMargin = balance * (Math.min(sizeVal, 100) / 100);
      } else {
        positionMargin = sizeVal;
      }`;
content = content.replace(
  /if \(allocationType === 'fixed'\) \{\s*positionMargin = sizeVal;\s*\} else \{\s*positionMargin = balance \* \(sizeVal \/ 100\);\s*\}/,
  initReplace
);

// 5. Apply trade direction logic to signals
let signalReplace = `      if (fast > slow && (tradeDirection === 'both' || tradeDirection === 'long')) {
        signal = 'BUY';
      } else if (fast < slow && (tradeDirection === 'both' || tradeDirection === 'short')) {
        signal = 'SELL';
      }`;
content = content.replace(
  /if \(fast > slow\) \{\s*signal = 'BUY';\s*\} else if \(fast < slow\) \{\s*signal = 'SELL';\s*\}/,
  signalReplace
);

// 6. Provide contractValue to simulateBacktest calls
// We need a helper to get contractValue
const helper = `
function getContractValue(symbol: string): number {
  if (productsCache.length === 0) return 1;
  const prod = productsCache.find((p: any) => p.symbol === symbol || p.symbol === symbol.replace('/', ''));
  return prod ? parseFloat(prod.contract_value) : 1;
}
`;
content = content.replace("app.post('/api/backtest'", helper + "\napp.post('/api/backtest'");

content = content.replace(
  "const results = simulateBacktest(config, mappedData);",
  "const cv = getContractValue(config.symbol);\n    const results = simulateBacktest(config, mappedData, cv);"
);

content = content.replace(
  "const res = simulateBacktest(runConfig, mappedData);",
  "const cv = getContractValue(runConfig.symbol);\n    const res = simulateBacktest(runConfig, mappedData, cv);"
);

content = content.replace(
  "const resObj = simulateBacktest(runConfig, tfData);",
  "const cv = getContractValue(runConfig.symbol);\n          const resObj = simulateBacktest(runConfig, tfData, cv);"
);

fs.writeFileSync('server.ts', content);
