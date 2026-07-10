const fs = require('fs');

let content = fs.readFileSync('server.ts', 'utf8');

// Replace lines 781-782 and the finalBuy/finalSell
let newCross = `  const isCrossUpRaw   = prevFast <= prevSlow && currFast > currSlow;
  const isCrossDownRaw = prevFast >= prevSlow && currFast < currSlow;
  const isCrossUp = isCrossUpRaw && (!slot.tradeDirection || slot.tradeDirection === 'both' || slot.tradeDirection === 'long');
  const isCrossDown = isCrossDownRaw && (!slot.tradeDirection || slot.tradeDirection === 'both' || slot.tradeDirection === 'short');`;

content = content.replace(
  "  const isCrossUp   = prevFast <= prevSlow && currFast > currSlow;\n  const isCrossDown = prevFast >= prevSlow && currFast < currSlow;",
  newCross
);

content = content.replace(
  "  let finalBuy  = isCrossUp && (slot.tradeDirection === 'both' || slot.tradeDirection === 'long');\n  let finalSell = isCrossDown && (slot.tradeDirection === 'both' || slot.tradeDirection === 'short');",
  "  let finalBuy  = isCrossUp;\n  let finalSell = isCrossDown;"
);

fs.writeFileSync('server.ts', content);
