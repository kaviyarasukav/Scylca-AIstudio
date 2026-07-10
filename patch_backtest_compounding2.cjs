const fs = require('fs');

let content = fs.readFileSync('server.ts', 'utf8');

// I also need to ensure we don't break the build
fs.writeFileSync('server.ts', content);
