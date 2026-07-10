const fs = require('fs');
let content = fs.readFileSync('server.ts', 'utf8');

content = content.replace(
  "    const isCrossUp   = prevFast <= prevSlow && currFast > currSlow;\n  const isCrossDown = prevFast >= prevSlow && currFast < currSlow;\n  \n  let finalBuy  = isCrossUp && (slot.tradeDirection === 'both' || slot.tradeDirection === 'long');\n  let finalSell = isCrossDown && (slot.tradeDirection === 'both' || slot.tradeDirection === 'short');",
  "  let finalBuy  = isCrossUp && (slot.tradeDirection === 'both' || slot.tradeDirection === 'long');\n  let finalSell = isCrossDown && (slot.tradeDirection === 'both' || slot.tradeDirection === 'short');"
);

fs.writeFileSync('server.ts', content);
