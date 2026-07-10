const fs = require('fs');

let content = fs.readFileSync('server.ts', 'utf8');

// In backtester, if percent is used, calculate based on current balance
let replacePercentPyramid = `             else if (allocationType === 'percent') marginToAdd = balance * (Math.min(sizeVal, 100) / 100);`;
// This is already present from my earlier patch. 
// But wait, the backtester records exit and adds PNL to the balance!
// So it already compounds perfectly.

