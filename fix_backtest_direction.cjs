const fs = require('fs');

let content = fs.readFileSync('server.ts', 'utf8');

let newBacktestSignal = `    const isCrossUp   = prevFast <= prevSlow && currFast > currSlow;
    const isCrossDown = prevFast >= prevSlow && currFast < currSlow;
    
    let freshSignal = 'NONE';
    if (isCrossUp) freshSignal = 'BUY';
    if (isCrossDown) freshSignal = 'SELL';`;

content = content.replace(
  /const isCrossUp   = prevFast <= prevSlow && currFast > currSlow;\s*const isCrossDown = prevFast >= prevSlow && currFast < currSlow;\s*let freshSignal = 'NONE';\s*if \(isCrossUp && \(tradeDirection === 'both' || tradeDirection === 'long'\)\) freshSignal = 'BUY';\s*if \(isCrossDown && \(tradeDirection === 'both' || tradeDirection === 'short'\)\) freshSignal = 'SELL';/,
  newBacktestSignal
);

let enterLogic = `    if (inPosition) {
      if (positionSide === signal) continue;
      // Close the current position (Standard and Always-In both do this)
      recordExit(positionSide, entryPrice, closes[i], 'REV', i);
      lastTradeCandleIdx = i;
      
      const isDirectionAllowed = !tradeDirection || tradeDirection === 'both' || (tradeDirection === 'long' && signal === 'BUY') || (tradeDirection === 'short' && signal === 'SELL');
      if (config.strategy !== 'always_in' || !isDirectionAllowed) continue;
    } else {
      const isDirectionAllowed = !tradeDirection || tradeDirection === 'both' || (tradeDirection === 'long' && signal === 'BUY') || (tradeDirection === 'short' && signal === 'SELL');
      if (!isDirectionAllowed) continue;
    }`;

content = content.replace(
  /if \(inPosition\) \{\s*if \(positionSide === signal\) continue;\s*\/\/ Close the current position \(Standard and Always-In both do this\)\s*recordExit\(positionSide, entryPrice, closes\[i\], 'REV', i\);\s*lastTradeCandleIdx = i;\s*if \(config.strategy !== 'always_in'\) continue;\s*\}/,
  enterLogic
);

fs.writeFileSync('server.ts', content);
