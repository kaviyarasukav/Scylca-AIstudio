const fs = require('fs');

let content = fs.readFileSync('server.ts', 'utf8');

// Replace the patched isCross logic
let oldCross = `  const isCrossUpRaw   = prevFast <= prevSlow && currFast > currSlow;
  const isCrossDownRaw = prevFast >= prevSlow && currFast < currSlow;
  const isCrossUp = isCrossUpRaw && (!slot.tradeDirection || slot.tradeDirection === 'both' || slot.tradeDirection === 'long');
  const isCrossDown = isCrossDownRaw && (!slot.tradeDirection || slot.tradeDirection === 'both' || slot.tradeDirection === 'short');`;

let newCross = `  const isCrossUp   = prevFast <= prevSlow && currFast > currSlow;
  const isCrossDown = prevFast >= prevSlow && currFast < currSlow;`;

if (content.includes(oldCross)) {
  content = content.replace(oldCross, newCross);
}

fs.writeFileSync('server.ts', content);
