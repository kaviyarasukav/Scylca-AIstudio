const fs = require('fs');
let content = fs.readFileSync('src/App.tsx', 'utf8');

// Add tradeDirection to interface
content = content.replace(
  "strategy: string;",
  "strategy: string;\n  tradeDirection?: string;"
);

// Add tradeDirection to default state
content = content.replace(
  "strategy: 'always_in' as 'always_in' | 'standard',",
  "strategy: 'always_in' as 'always_in' | 'standard',\n      tradeDirection: 'both' as 'both' | 'long' | 'short',"
);

// When creating slot payload
content = content.replace(
  "strategy: botConfig.strategy,",
  "strategy: botConfig.strategy,\n                        tradeDirection: botConfig.tradeDirection,"
);

fs.writeFileSync('src/App.tsx', content);
