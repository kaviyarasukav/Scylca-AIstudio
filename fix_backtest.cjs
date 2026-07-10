const fs = require('fs');

let content = fs.readFileSync('server.ts', 'utf8');

let newLogic = `    if (signal === 'NONE') continue;

    if (!slTpExited && cooldownCandles > 0 && (i - lastTradeCandleIdx) < cooldownCandles) continue;

    const isDirectionAllowed = !tradeDirection || tradeDirection === 'both' || (tradeDirection === 'long' && signal === 'BUY') || (tradeDirection === 'short' && signal === 'SELL');

    if (inPosition) {
      if (positionSide === signal) continue;

      // Explicitly verified Issue #14: Bounds check (i + 1 < ohlcv.length) protects against undefined opens[i+1]
      const exitExecPrice = i + 1 < ohlcv.length ? opens[i + 1] : closes[i];
      const safeExitIdx = i + 1 < ohlcv.length ? i + 1 : i;

      if (shouldReverse && isDirectionAllowed) {
        recordExit(positionSide, entryPrice, exitExecPrice, 'REVERSAL', safeExitIdx);
      } else {
        recordExit(positionSide, entryPrice, exitExecPrice, 'SIGNAL_EXIT', safeExitIdx);
        lastTradeCandleIdx = i;
        continue; 
      }
    }

    if (!inPosition) {
      if (!isDirectionAllowed) continue;`;

content = content.replace(
  /    if \(signal === 'NONE'\) continue;\s*if \(!slTpExited && cooldownCandles > 0 && \(i - lastTradeCandleIdx\) < cooldownCandles\) continue;\s*if \(inPosition\) \{\s*if \(positionSide === signal\) continue;\s*\/\/ Explicitly verified Issue #14: Bounds check \(i \+ 1 < ohlcv.length\) protects against undefined opens\[i\+1\]\s*const exitExecPrice = i \+ 1 < ohlcv.length \? opens\[i \+ 1\] : closes\[i\];\s*const safeExitIdx = i \+ 1 < ohlcv.length \? i \+ 1 : i;\s*if \(shouldReverse\) \{\s*recordExit\(positionSide, entryPrice, exitExecPrice, 'REVERSAL', safeExitIdx\);\s*\} else \{\s*recordExit\(positionSide, entryPrice, exitExecPrice, 'SIGNAL_EXIT', safeExitIdx\);\s*lastTradeCandleIdx = i;\s*continue; \s*\}\s*\}\s*if \(!inPosition\) \{/,
  newLogic
);

fs.writeFileSync('server.ts', content);
