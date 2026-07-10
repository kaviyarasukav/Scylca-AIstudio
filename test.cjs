const fs = require('fs');

let content = fs.readFileSync('server.ts', 'utf8');
const usdAssetBalanceLine = "const totalUsd = usdAsset ? (parseFloat(usdAsset.balance) || freeUsd) : 0;";
const equityLine = "const totalUsd = usdAsset ? (parseFloat(usdAsset.equity) || parseFloat(usdAsset.balance) || freeUsd) : 0;";
if (content.includes(usdAssetBalanceLine)) {
  content = content.replace(usdAssetBalanceLine, equityLine);
  fs.writeFileSync('server.ts', content);
  console.log('Fixed totalUsd to use equity');
} else {
  console.log('Line not found');
}
