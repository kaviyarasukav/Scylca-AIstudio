const fs = require('fs');

let content = fs.readFileSync('server.ts', 'utf8');

let newSignal = `    const isCrossUp   = prevFast <= prevSlow && currFast > currSlow;
    const isCrossDown = prevFast >= prevSlow && currFast < currSlow;
    
    let freshSignal = 'NONE';
    if (isCrossUp && (tradeDirection === 'both' || tradeDirection === 'long')) freshSignal = 'BUY';
    if (isCrossDown && (tradeDirection === 'both' || tradeDirection === 'short')) freshSignal = 'SELL';`;

content = content.replace(
  "    const isCrossUp   = prevFast <= prevSlow && currFast > currSlow;\n    const isCrossDown = prevFast >= prevSlow && currFast < currSlow;\n    const freshSignal = isCrossUp ? 'BUY' : isCrossDown ? 'SELL' : 'NONE';",
  newSignal
);

fs.writeFileSync('server.ts', content);
