const fs = require('fs');

let content = fs.readFileSync('server.ts', 'utf8');

let step3Replace = `    // Standard strategy: only close, do NOT enter opposite
    const isDirectionAllowed = !slot.tradeDirection || slot.tradeDirection === 'both' || (slot.tradeDirection === 'long' && orderSide === 'buy') || (slot.tradeDirection === 'short' && orderSide === 'sell');

    if (slot.strategy !== 'always_in' || !isDirectionAllowed) {
      addLog(\`📋 [\${slot.symbol}] Strategy=standard or Direction restricted: Closed position. Will NOT enter new \${orderSide.toUpperCase()}.\`, 'info');
      slot.lastExecutedCandleTime = closedCandleTime;
      slot.lastSignal             = crossStateStr;
      slot.lastTradeCandles       = closedCandleTime;
      slot.tradesExecuted++;
      return;
    }`;

content = content.replace(
  "    // Standard strategy: only close, do NOT enter opposite\n    if (slot.strategy !== 'always_in') {\n      addLog(`📋 [${slot.symbol}] Strategy=standard: Closed. Will NOT enter new ${orderSide.toUpperCase()}.`, 'info');\n      slot.lastExecutedCandleTime = closedCandleTime;\n      slot.lastSignal             = crossStateStr;\n      slot.lastTradeCandles       = closedCandleTime;\n      slot.tradesExecuted++;\n      return;\n    }",
  step3Replace
);

let step4Replace = `  // ── STEP 3.9: Check Trade Direction ──
  const isDirectionAllowedEntry = !slot.tradeDirection || slot.tradeDirection === 'both' || (slot.tradeDirection === 'long' && orderSide === 'buy') || (slot.tradeDirection === 'short' && orderSide === 'sell');
  if (!isDirectionAllowedEntry) {
    addLog(\`⏭️ [\${slot.symbol}] Skipping \${orderSide.toUpperCase()} entry because Trade Direction is restricted to \${slot.tradeDirection.toUpperCase()}.\`, 'info');
    slot.lastExecutedCandleTime = closedCandleTime;
    slot.lastSignal             = crossStateStr;
    return;
  }

  // ── STEP 4: Enter new position ──`;

content = content.replace(
  "  // ── STEP 4: Enter new position ──",
  step4Replace
);

fs.writeFileSync('server.ts', content);
