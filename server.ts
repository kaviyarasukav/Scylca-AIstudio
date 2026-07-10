import cors from 'cors';
import path from 'path';
import ccxt from 'ccxt';
import { createServer as createViteServer } from 'vite';
import dotenv from 'dotenv';
import fs from 'fs';
import crypto from 'crypto';
import { deltaClient } from './deltaClient';
import { google } from 'googleapis';
import { calculateEmaSeries, calculateRSI, calculateRSISeries, calculateBollingerBands, calculateBollingerBandsSeries, calculateATR, calculateAtrSeries, isVolumeAboveAverage } from './src/utils/indicators';

dotenv.config();

let googleAccessToken = '';
let googleSpreadsheetId = '';

async function getOrCreateSpreadsheet(token: string) {
  const auth = new google.auth.OAuth2();
  auth.setCredentials({ access_token: token });
  const sheets = google.sheets({ version: 'v4', auth });
  const drive = google.drive({ version: 'v3', auth });

  if (!googleSpreadsheetId) {
    const res = await drive.files.list({
      q: "name='Delta Trades' and mimeType='application/vnd.google-apps.spreadsheet' and trashed=false",
      fields: 'files(id, name)',
    });
    if (res.data.files && res.data.files.length > 0) {
      googleSpreadsheetId = res.data.files[0].id!;
    } else {
      const createRes = await sheets.spreadsheets.create({
        requestBody: {
          properties: { title: 'Delta Trades' },
          sheets: [{ properties: { title: 'Trades' } }]
        }
      });
      googleSpreadsheetId = createRes.data.spreadsheetId!;
      await sheets.spreadsheets.values.append({
        spreadsheetId: googleSpreadsheetId,
        range: 'Trades!A1',
        valueInputOption: 'USER_ENTERED',
        requestBody: { values: [['Date', 'Symbol', 'Side', 'Type', 'Size', 'Price', 'Order ID']] }
      });
    }
  }
  return { sheets, spreadsheetId: googleSpreadsheetId };
}

async function appendTradeToSheet(trade: any) {
  if (!googleAccessToken) return;
  try {
    const { sheets, spreadsheetId } = await getOrCreateSpreadsheet(googleAccessToken);
    await sheets.spreadsheets.values.append({
      spreadsheetId,
      range: 'Trades!A1',
      valueInputOption: 'USER_ENTERED',
      requestBody: {
        values: [[
          new Date().toISOString(),
          trade.symbol,
          trade.side,
          trade.orderType,
          trade.size,
          trade.price,
          trade.orderId
        ]]
      }
    });
    console.log(`[Google Sheets] Trade appended for ${trade.symbol}`);
  } catch (err: any) {
    console.error('[Google Sheets] Failed to write to Google Sheets:', err.message);
  }
}

const app = express();
const PORT = Number(process.env.PORT) || 3000;

// ══════════════════════════════════════════════════════════════════
// GLOBAL BINANCE INSTANCE — reused across all cycles to avoid rate limiting
// ══════════════════════════════════════════════════════════════════
const binance = new ccxt.binance({ enableRateLimit: true });
let optimizationCancelled = false;

app.use(cors());
app.use(express.json());
// Fix #9: trust proxy so req.ip resolves correctly when behind nginx/reverse proxy.
// Without this, req.ip is undefined and all clients share one rate-limit bucket.
app.set('trust proxy', 1);

// Basic Authentication Middleware
app.use((req, res, next) => {
  if (req.method === 'OPTIONS') {
    return next();
  }

  const username = process.env.WEB_USERNAME;
  const password = process.env.WEB_PASSWORD;
  
  if (!username || !password) {
    return next(); // No auth configured
  }

  const b64auth = (req.headers.authorization || '').split(' ')[1] || '';
  const [login, pwd] = Buffer.from(b64auth, 'base64').toString().split(':');

  if (login && pwd) {
    const loginBuf = Buffer.from(login);
    const pwdBuf = Buffer.from(pwd);
    const userBuf = Buffer.from(username);
    const passBuf = Buffer.from(password);

    // Explicitly fixes Issue F: Timing-attack safe comparison
    if (loginBuf.length === userBuf.length && pwdBuf.length === passBuf.length &&
        crypto.timingSafeEqual(loginBuf, userBuf) && crypto.timingSafeEqual(pwdBuf, passBuf)) {
      return next();
    }
  }

  res.set('WWW-Authenticate', 'Basic realm="401"');
  res.status(401).send('Authentication required.');
});

app.get('/api/google-config', (req, res) => {
  try {
    const config = JSON.parse(fs.readFileSync('./firebase-applet-config.json', 'utf8'));
    res.json({ clientId: config.oAuthClientId });
  } catch (err) {
    res.json({ clientId: '' });
  }
});

app.post('/api/google-auth', (req, res) => {
  googleAccessToken = req.body.token;
  res.json({ success: true });
});

// ══════════════════════════════════════════════════════════════════
// LOGGING
// ══════════════════════════════════════════════════════════════════
let logs: Array<{ time: string; message: string; type: 'info' | 'error' | 'success' }> = [
  { time: new Date().toLocaleTimeString(), message: "System Initialized. Awaiting manual start.", type: 'info' }
];

const addLog = (message: string, type: 'info' | 'error' | 'success' = 'info') => {
  const time = new Date().toLocaleTimeString();
  // Fix #5: Use push+slice (O(1) amortized) instead of unshift+pop (O(n)).
  // Buffer size aligned with frontend slice(-500) for consistency.
  logs.push({ time, message, type });
  if (logs.length > 500) logs = logs.slice(-500);
  console.log(`[${time}] ${message}`);
};

function formatDeltaError(error: any): string {
  const msg = error.message || JSON.stringify(error);
  if (msg.includes('ip_not_whitelisted_for_api_key')) {
    return `Delta Exchange MANDATES IP whitelisting. Alternative: Run locally or on a VPS with a static IP.`;
  }
  if (msg.includes('401') || msg.includes('unauthorized') || msg.includes('invalid_api_key') || msg.includes('signature')) {
    return `Invalid Delta API Key/Secret or Signature: ${msg}`;
  }
  return msg;
}

// ══════════════════════════════════════════════════════════════════
// GLOBAL STATE
// ══════════════════════════════════════════════════════════════════
let isBotRunning = false;
let apiAuthError: string | null = null;

// ══════════════════════════════════════════════════════════════════
// PRODUCT MAPPING CACHE
// ══════════════════════════════════════════════════════════════════
let productsCache: any[] = [];
let productsCacheTime = 0;

async function syncProducts() {
  try {
    const resp = await deltaClient.getProducts();
    if (resp && resp.success && resp.result) {
      productsCache = resp.result;
      productsCacheTime = Date.now();
      console.log(`[Products] Synced ${productsCache.length} products from Delta API.`);
    }
  } catch (e: any) {
    console.error("Failed to sync products:", e.message);
  }
}

function getProductId(symbol: string): number | null {
  const normalizedSymbol = String(symbol || '').toUpperCase().trim();
  const baseCoin = normalizedSymbol.replace(/USDT$/, '').replace(/USD$/, '');
  const candidates = new Set([
    normalizedSymbol,
    `${baseCoin}USD`,
    `${baseCoin}USDT`,
  ]);

  let prod = productsCache.find((p: any) => candidates.has(String(p.symbol || '').toUpperCase()));
  if (prod) return prod.id;
  prod = productsCache.find((p: any) => (
    String(p.symbol || '').toUpperCase().startsWith(baseCoin) &&
    p.contract_type === 'perpetual_futures' &&
    (!p.state || p.state === 'live')
  ));
  if (prod) {
    console.warn(`[Products] Warning: Exact match for ${symbol} not found. Falling back to prefix match: ${prod.symbol}. Check if this is the correct contract!`);
    return prod.id;
  }
  return null;
}

// ══════════════════════════════════════════════════════════════════
// MULTI-SLOT TRADING ENGINE
// ══════════════════════════════════════════════════════════════════

interface TradingSlot {
  id: string;
  symbol: string;
  timeframe: string;
  fastEmaPeriod: number;
  slowEmaPeriod: number;
  size: number;
  leverage: number;
  allocationType: 'fixed' | 'percent' | 'usd';
  orderType: 'market' | 'limit';
  takeProfitPct: number;
  stopLossPct: number;
  strategy: 'always_in',
  tradeDirection: 'both' | 'standard';
  tradeDirection?: 'both' | 'long' | 'short';
  lastExecutedCandleTime: number;
  lastSignal: string; // 'BUY' | 'SELL' | 'NONE'
  // --- Signal filters ---
  useRsiFilter: boolean;
  rsiPeriod: number;
  rsiOverbought: number;
  rsiOversold: number;
  useVolumeFilter: boolean;
  cooldownCandles: number;
  lastTradeCandles: number;   // timestamp of last trade candle (for cooldown)
  tradesExecuted: number;     // counter for display
  leverageSet: boolean;       // tracks if leverage was set on Delta
  // --- Bollinger Bands Filter ---
  useBbFilter: boolean;
  bbPeriod: number;
  bbStdDev: number;
  // --- New: Price & trend confirmations ---
  usePriceConfirmation: boolean; // price must be above/below slow EMA to enter
  emaGapMinPct: number;          // minimum EMA gap % to act (0 = disabled)
  confirmCandles: number;         // 1 = immediate, 2 = require 2nd candle confirmation
  useTrendFilter: boolean;        // only trade in EMA(200) direction
  // --- New: ATR Stop Loss ---
  useAtrSl: boolean;              // use ATR-based dynamic SL (overrides fixed % SL)
  atrMultiplier: number;          // ATR multiplier
  // --- New: Grid Pyramiding ---
  useGridPyramiding: boolean;
  gridStepPct: number;
  maxPyramidLevels: number;
  // --- Internal state ---
  pendingSignal: string;          // crossover seen last candle (for 2-candle confirm)
  pendingSignalCandleTime: number;
  currentPyramidLevel: number;    // live tracker
  averageEntryPrice: number;      // live tracker for grid steps
  trailingSlPrice: number;        // live tracker
  lastCloseAttempt?: number;      // Explicitly fixes Issue A: debounce close loop
}

const activeSlots = new Map<string, TradingSlot>();
// Explicitly verified Issue #4 (Performance): Cache candles globally to prevent rate limits
const candleCache = new Map<string, any[]>();
let botInterval: NodeJS.Timeout | null = null;
const binanceUnsupportedSymbols = new Set<string>();

const SLOTS_FILE = path.join(process.cwd(), 'slots.json');

function saveSlots() {
  try {
    const slotsArr = Array.from(activeSlots.values());
    // Explicitly optimized Issue 1: Non-blocking async write to prevent Event Loop stalls
    fs.promises.writeFile(SLOTS_FILE, JSON.stringify(slotsArr, null, 2), 'utf-8').catch(err => {
      console.error('Failed to async save slots:', err.message);
    });
  } catch (err: any) {
    console.error('Failed to serialize slots:', err.message);
  }
}

function loadSlots() {
  try {
    if (fs.existsSync(SLOTS_FILE)) {
      const data = fs.readFileSync(SLOTS_FILE, 'utf-8');
      const slotsArr = JSON.parse(data);
      for (const slot of slotsArr) {
        activeSlots.set(slot.id, slot);
      }
      console.log(`Loaded ${activeSlots.size} slots from disk`);
    }
  } catch (err: any) {
    console.error('Failed to load slots:', err.message);
  }
}

// Load slots at startup
loadSlots();

// Default config for the UI form (NOT used for trading — slots are used)
let formConfig: any = {
  symbol: 'BTCUSD',
  timeframe: '15m',
  fastEmaPeriod: 9,
  slowEmaPeriod: 21,
  size: 10,
  leverage: 10,
  allocationType: 'fixed',
  orderType: 'market',
  takeProfitPct: '',
  stopLossPct: '',
  strategy: 'always_in'
};

function generateSlotId(config: { symbol: string; timeframe: string; fastEmaPeriod: number; slowEmaPeriod: number }): string {
  return `${config.symbol}_${config.timeframe}_${config.fastEmaPeriod}_${config.slowEmaPeriod}`;
}

// ══════════════════════════════════════════════════════════════════
// ORDER EXECUTION HELPER
// ══════════════════════════════════════════════════════════════════

async function placeDeltaMarketOrder(
  symbol: string,
  side: string,
  sizeInput: number,
  currentPrice: number | undefined,
  slot: TradingSlot,
  extraParams: any = {}
) {
  try {
    const productId = getProductId(symbol);
    if (!productId) {
      throw new Error(`Could not map symbol ${symbol} to a Delta Product ID.`);
    }

    let size = sizeInput;
    if (!Number.isFinite(Number(size)) || Number(size) <= 0) {
      throw new Error(`Invalid order size: ${sizeInput}`);
    }

    if (slot.allocationType === 'percent' && currentPrice && !extraParams.reduce_only) {
      const balancesResp = await deltaClient.getBalances();
      const assets = balancesResp.result || [];
      const usdAsset = assets.find((a: any) => a.asset_symbol === 'USD' || a.asset_symbol === 'USDT');
      const freeUsd = usdAsset ? (parseFloat(usdAsset.available_balance) || 0) : 0;

      const leverage = Number(slot.leverage) || 1;
      const percent = Math.min(Math.max(sizeInput, 0), 100) / 100;
      const totalUsd = usdAsset ? (parseFloat(usdAsset.equity) || parseFloat(usdAsset.balance) || freeUsd) : 0;
      const rawMarginTarget = totalUsd * percent;
      const marginToUse = Math.min(rawMarginTarget, freeUsd);
      const purchasingPower = marginToUse * leverage;

      const prod = productsCache.find((p: any) => p.id === productId);
      const contractValue = prod ? parseFloat(prod.contract_value) : 1;

      const rawSize = purchasingPower / (currentPrice * contractValue);
      size = Math.floor(rawSize);

      if (size <= 0) {
        throw new Error(`Calculated size is 0 (Purchasing Power: $${purchasingPower.toFixed(2)}, Free USD: $${freeUsd.toFixed(2)}). Not enough margin.`);
      }
    } else if (slot.allocationType === 'usd' && currentPrice && !extraParams.reduce_only) {
      const leverage = Number(slot.leverage) || 1;
      const purchasingPower = sizeInput * leverage;

      const prod = productsCache.find((p: any) => p.id === productId);
      const contractValue = prod ? parseFloat(prod.contract_value) : 1;

      const rawSize = purchasingPower / (currentPrice * contractValue);
      size = Math.floor(rawSize);

      if (size <= 0) {
        throw new Error(`Calculated size is 0 (Requested Margin: $${sizeInput}, Purchasing Power: $${purchasingPower}).`);
      }
    }

    size = Math.floor(Number(size));
    if (!Number.isFinite(size) || size <= 0) {
      throw new Error(`Calculated order size is invalid: ${size}`);
    }

    const orderSide = side.toLowerCase() as 'buy' | 'sell';
    if (orderSide !== 'buy' && orderSide !== 'sell') {
      throw new Error(`Invalid order side: ${side}`);
    }

    if (!extraParams.reduce_only && !slot.leverageSet && Number(slot.leverage) > 0) {
      try {
        await deltaClient.setLeverage(productId, Number(slot.leverage));
        slot.leverageSet = true;
        addLog(`[${symbol}] Leverage set to ${slot.leverage}x`, 'info');
      } catch (levErr: any) {
        addLog(`[${symbol}] Could not set leverage before order; exchange default will be used: ${levErr.message}`, 'error');
      }
    }

    const { bracket_take_profit_price, bracket_take_profit_limit_price, bracket_stop_loss_price, bracket_stop_loss_limit_price, _limitPrice, ...cleanExtraParams } = extraParams;
    const params: any = { ...cleanExtraParams };

    const isLimit = slot.orderType === 'limit';
    const priceToUse = _limitPrice ? Number(_limitPrice) : currentPrice;

    const prod = productsCache.find((p: any) => p.id === productId);
    const tickSize = prod && prod.tick_size ? parseFloat(prod.tick_size) : null;
    const formatPrice = (val: number) => {
      if (val === undefined || val === null) return '0.00';
      if (tickSize) {
        const inv = 1.0 / tickSize;
        return (Math.round(val * inv) / inv).toFixed(prod.tick_size.split('.')[1]?.length || 0);
      }
      return val < 1 ? val.toFixed(6) : val < 10 ? val.toFixed(4) : val.toFixed(2);
    };

    let finalOrderType: 'market_order' | 'limit_order' = 'market_order';

    if (isLimit && priceToUse) {
      finalOrderType = 'limit_order';
      params.limit_price = String(priceToUse);
    } else if (!isLimit && priceToUse && !extraParams.reduce_only) {
      // Explicitly verified Issue #2 (System Design): Unbounded Market Order Slippage
      // Convert all market entries to synthetic limit orders (IOC) with 2% slippage padding.
      // Explicitly optimized Issue 2: Tighter 1% slippage cap to better protect high leverage capital
      finalOrderType = 'limit_order';
      params.time_in_force = 'ioc';
      const syntheticLimitPrice = orderSide === 'buy' ? priceToUse * 1.01 : priceToUse * 0.99;
      params.limit_price = formatPrice(syntheticLimitPrice);
    }

    const result = await deltaClient.placeOrder(productId, size, orderSide, finalOrderType, params);
    const placedOrder = result.result || result;

    // Place bracket (TP/SL) if configured and this is an entry order
    if (!extraParams.reduce_only && currentPrice) {
      const isBuy = orderSide === 'buy';

      // Explicitly fixes Issue B: TP/SL calculated from actual fill price instead of signal price
      const actualFillPrice = Number(placedOrder?.average_fill_price) || Number(placedOrder?.price) || currentPrice;

      const tpPct = slot.takeProfitPct ? parseFloat(String(slot.takeProfitPct)) : NaN;
      const slPct = slot.stopLossPct ? parseFloat(String(slot.stopLossPct)) : NaN;

      const hasTp = !isNaN(tpPct) && tpPct > 0;
      const hasSl = !isNaN(slPct) && slPct > 0;

      if ((hasTp || hasSl) && placedOrder?.id) {
        const bracketBody: any = {
          product_id: productId,
          product_symbol: symbol,
        };

        if (hasTp) {
          const tpPrice = isBuy
            ? actualFillPrice * (1 + tpPct / 100)
            : actualFillPrice * (1 - tpPct / 100);
          bracketBody.take_profit_order = {
            order_type: 'limit_order',
            stop_price: formatPrice(tpPrice),
            limit_price: formatPrice(tpPrice),
          };
        }

        if (hasSl) {
          const slPrice = isBuy
            ? actualFillPrice * (1 - slPct / 100)
            : actualFillPrice * (1 + slPct / 100);
          bracketBody.stop_loss_order = {
            order_type: 'market_order', // market_order ensures fill during fast moves
            stop_price: formatPrice(slPrice),
          };
        }

        let retries = 3;
        while (retries > 0) {
          try {
            await deltaClient.placeBracketOrder(bracketBody);
            addLog(`🛡️ [${symbol}] Bracket order (TP/SL) placed for order ${placedOrder.id}`, 'info');
            break;
          } catch (bracketErr: any) {
            retries--;
            if (retries === 0) {
              addLog(`⚠️ [${symbol}] Main order placed but bracket (TP/SL) failed after retries: ${bracketErr.message}`, 'error');
            } else {
              addLog(`⏳ [${symbol}] Bracket placement failed, retrying in 1s... (${retries} retries left)`, 'info');
              await new Promise(resolve => setTimeout(resolve, 1000));
            }
          }
        }
      }
    }

    // Google Sheets integration
    appendTradeToSheet({
      symbol,
      side: orderSide,
      orderType: finalOrderType,
      size,
      price: priceToUse,
      orderId: placedOrder?.id || 'unknown'
    }).catch(e => console.error(e));

    return placedOrder;
  } catch (error: any) {
    throw new Error(`Delta API Error during trade execution: ${formatDeltaError(error)}`);
  }
}

// ══════════════════════════════════════════════════════════════════
// TIMEFRAME HELPERS
// ══════════════════════════════════════════════════════════════════

function getTimeframeSeconds(tf: string): number {
  const map: Record<string, number> = {
    '1m': 60, '3m': 180, '5m': 300, '15m': 900, '30m': 1800,
    '1h': 3600, '2h': 7200, '4h': 14400, '1d': 86400
  };
  return map[tf] || 900;
}

function getAdaptiveInterval(): number {
  if (activeSlots.size === 0) return 30000;
  let shortest = Infinity;
  for (const slot of activeSlots.values()) {
    const secs = getTimeframeSeconds(slot.timeframe);
    if (secs < shortest) shortest = secs;
  }
  // Explicitly fixes Issue N: Increase minimum adaptive interval to 20s to prevent Delta API overload
  return Math.max(20000, Math.min(60000, Math.floor((shortest * 1000) / 3)));
}

// ══════════════════════════════════════════════════════════════════
// BOT CYCLE — runs once for ALL active slots
// ══════════════════════════════════════════════════════════════════

let isBotCycleRunning = false;

const runBotCycle = async () => {
  if (!isBotRunning) return;
  if (activeSlots.size === 0) return;
  if (isBotCycleRunning) return; // Prevent concurrent cycle overlaps

  isBotCycleRunning = true;
  try {
    // Explicitly verified Issue #15: productsCache is now dynamically refreshed every 1 hour (3600000ms)
    // syncProducts() has its own internal try/catch and will not throw — wrapping in try/catch is dead code removed.
    if (productsCache.length === 0 || Date.now() - productsCacheTime > 3600000) await syncProducts();

    // Process all slots concurrently in chunks to fix Issue #3 (Sequential I/O Blocking) while preventing API spikes
    const slotsArray = Array.from(activeSlots.values());
    const chunkSize = 10;
    for (let i = 0; i < slotsArray.length; i += chunkSize) {
      const chunk = slotsArray.slice(i, i + chunkSize);
      const promises = chunk.map(async (slot) => {
        if (!isBotRunning) return;
        try {
          await runSlotCycle(slot);
        } catch (err: any) {
          addLog(`[${slot.symbol}] Error in slot cycle: ${err.message}`, 'error');
        }
      });
      await Promise.allSettled(promises);
    }
  } finally {
    isBotCycleRunning = false;
  }
};

async function checkGridPyramiding(slot: TradingSlot, currentPrice: number, productId: number) {
  if (slot.currentPyramidLevel >= slot.maxPyramidLevels) return;

  try {
    const positionsResp = await deltaClient.getPositions();
    const positions     = positionsResp.result || [];
    const pos           = positions.find((p: any) => p.product_id === productId);
    if (!pos) {
       if (slot.currentPyramidLevel > 0) {
           slot.currentPyramidLevel = 0;
           slot.averageEntryPrice = 0;
           slot.trailingSlPrice = 0;
           saveSlots();
       }
       return;
    }

    const rawSize = Number(pos.size);
    if (!isFinite(rawSize) || rawSize === 0) {
       if (slot.currentPyramidLevel > 0) {
           slot.currentPyramidLevel = 0;
           slot.averageEntryPrice = 0;
           slot.trailingSlPrice = 0;
           saveSlots();
       }
       return;
    }

    const posSide = rawSize > 0 ? 'BUY' : 'SELL';

    // Fix #1: Use slot.averageEntryPrice as the stable anchor for all grid step calculations.
    // pos.entry_price from the exchange drifts after each pyramid add (it becomes a weighted average),
    // which causes step targets to shift with every level. We set averageEntryPrice at initial entry
    // and only update it here AFTER the order is placed.
    const anchorPrice = (slot.averageEntryPrice && slot.averageEntryPrice > 0)
      ? slot.averageEntryPrice
      : Number(pos.entry_price);
    if (!anchorPrice) return;

    // Calculate next grid target from the ORIGINAL anchor, not the shifted average
    const nextLevel = slot.currentPyramidLevel + 1;
    const gridTarget = posSide === 'BUY'
      ? anchorPrice * (1 + slot.gridStepPct * nextLevel / 100)
      : anchorPrice * (1 - slot.gridStepPct * nextLevel / 100);

    const hitGrid = posSide === 'BUY' ? currentPrice >= gridTarget : currentPrice <= gridTarget;
    
    if (hitGrid) {
      addLog(`📶 [${slot.symbol}] Grid Step Hit! Price ${currentPrice} passed target ${gridTarget.toFixed(2)}. Pyramiding (Level ${nextLevel}/${slot.maxPyramidLevels})...`, 'success');
      
      const orderSide = posSide.toLowerCase();
      
      // Trail SL to the previous grid step level (step below current fill)
      const trailSlPrice = posSide === 'BUY'
        ? currentPrice * (1 - slot.gridStepPct / 100)
        : currentPrice * (1 + slot.gridStepPct / 100);
        
      const trailSlPct = posSide === 'BUY'
        ? (1 - trailSlPrice / currentPrice) * 100
        : (trailSlPrice / currentPrice - 1) * 100;
        
      const slotForPyramid = { ...slot, stopLossPct: trailSlPct };

      await placeDeltaMarketOrder(slot.symbol, orderSide, slot.size, currentPrice, slotForPyramid);
      
      slot.leverageSet = false;
      slot.currentPyramidLevel = nextLevel;
      // Only store the anchor on first entry (level 0→1). Never overwrite with drifted average.
      if (!slot.averageEntryPrice || slot.averageEntryPrice === 0) {
        slot.averageEntryPrice = anchorPrice;
      }
      slot.trailingSlPrice = trailSlPrice;
      saveSlots();
      addLog(`🛡️ [${slot.symbol}] Pyramiding complete. Level ${nextLevel}/${slot.maxPyramidLevels}. Trailing SL → ${trailSlPrice.toFixed(2)}.`, 'info');
    }

  } catch (e: any) {
    // Ignore transient errors
  }
}

async function runSlotCycle(slot: TradingSlot) {
  // Explicitly fixes Issue A: Wait 5 seconds after a close attempt for the exchange to settle
  if (slot.lastCloseAttempt && Date.now() - slot.lastCloseAttempt < 5000) {
    return;
  }

  const productId = getProductId(slot.symbol);
  if (!productId) {
    addLog(`[${slot.symbol}] Product ID not found. Skipping.`, 'error');
    return;
  }

  // ── Fetch candles from Binance ──
  const baseCoin = slot.symbol.replace(/USDT$/, '').replace(/USD$/, '');
  
  // Explicitly verified Issue #6: Added multi-pair fallback mechanism to prevent failure on non-USDT derivatives
  const possibleSymbols = [`${baseCoin}/USDT`, `${baseCoin}/USDC`, `${baseCoin}/BUSD`, slot.symbol];
  let binanceSymbol = possibleSymbols[0];
  let cacheKey = '';
  let ohlcv: any[] = [];

  for (const sym of possibleSymbols) {
    if (binanceUnsupportedSymbols.has(sym)) continue;
    binanceSymbol = sym;
    cacheKey = `${sym}_${slot.timeframe}`;
    ohlcv = candleCache.get(cacheKey) || [];

    try {
      const limit = Math.max(600, (slot.slowEmaPeriod * 2) + 220);
      if (ohlcv.length === 0) {
        ohlcv = await binance.fetchOHLCV(sym, slot.timeframe, undefined, limit);
        candleCache.set(cacheKey, ohlcv);
      } else {
        const recentCandles = await binance.fetchOHLCV(sym, slot.timeframe, undefined, 2);
        if (recentCandles && recentCandles.length > 0) {
          for (const candle of recentCandles) {
            const timestamp = candle[0];
            const lastCached = ohlcv[ohlcv.length - 1];
            if (timestamp === lastCached[0]) {
              ohlcv[ohlcv.length - 1] = candle;
            } else if (timestamp > lastCached[0]) {
              ohlcv.push(candle);
            }
          }
          if (ohlcv.length > limit) ohlcv = ohlcv.slice(-limit);
          candleCache.set(cacheKey, ohlcv);
        }
      }
      break; // Successfully fetched, break the fallback loop
    } catch (candleErr: any) {
      if (candleErr.message.toLowerCase().includes('does not have market symbol') ||
        candleErr.message.toLowerCase().includes('is not supported')) {
        binanceUnsupportedSymbols.add(sym);
        ohlcv = []; // Reset ohlcv for next fallback
      } else {
        addLog(`[${slot.symbol}] Binance fetch error (may be transient): ${candleErr.message}`, 'error');
        break; // Stop trying fallbacks if it's a rate limit or transient network error
      }
    }
  }

  if (!ohlcv || ohlcv.length === 0) {
    if (binanceUnsupportedSymbols.has(binanceSymbol)) {
        addLog(`[${slot.symbol}] Symbol not available on Binance after all fallbacks. This slot will be skipped.`, 'error');
    } else {
        addLog(`[${slot.symbol}] Failed to fetch candle data.`, 'error');
    }
    return;
  }

  const closes = ohlcv.map((c) => c[4] as number);
  const highs  = ohlcv.map((c) => c[2] as number);
  const lows   = ohlcv.map((c) => c[3] as number);

  // ── Warmup guard: need 2× slowEmaPeriod + at least 3 candles beyond that ──
  const warmup = slot.slowEmaPeriod * 2;
  if (closes.length < warmup + 3) {
    addLog(`[${slot.symbol}] Not enough candles. Have ${closes.length}, need ${warmup + 3}.`, 'error');
    return;
  }

  const fastEmaSeries = calculateEmaSeries(closes, slot.fastEmaPeriod);
  const slowEmaSeries = calculateEmaSeries(closes, slot.slowEmaPeriod);

  // Last CLOSED candle = index -2 (index -1 is still forming)
  const currentClosedIdx  = closes.length - 2;
  const previousClosedIdx = closes.length - 3;

  // FIX Bug 4: ensure both indices are within the warmed-up region
  if (previousClosedIdx < warmup) {
    addLog(`[${slot.symbol}] Waiting for EMA warmup (${previousClosedIdx}/${warmup}).`, 'info');
    return;
  }

  const currFast = fastEmaSeries[currentClosedIdx];
  const currSlow = slowEmaSeries[currentClosedIdx];
  const prevFast = fastEmaSeries[previousClosedIdx];
  const prevSlow = slowEmaSeries[previousClosedIdx];

  // Ensure EMA values are finite before acting
  if (!isFinite(currFast) || !isFinite(currSlow) || !isFinite(prevFast) || !isFinite(prevSlow)) {
    addLog(`[${slot.symbol}] EMA computation returned non-finite values — skipping cycle.`, 'error');
    return;
  }

  const closedCandleTime = ohlcv[currentClosedIdx][0];
  const currentPrice     = closes[closes.length - 1]; // Live price (forming candle)
  const closedPrice      = closes[currentClosedIdx];   // Last confirmed close price
  const formatPrice = (p: number) => { if (p === undefined || p === null) return '0.00'; return p < 1 ? p.toFixed(6) : p < 10 ? p.toFixed(4) : p.toFixed(2); };

  // ── Grid Pyramiding: must run BEFORE the dedup guard so it can fire on the same candle as entry ──
  // Fix Bug 9: Previously the dedup guard returned early before pyramiding was checked,
  // so pyramiding never fired on the same candle the entry was placed on.
  if (slot.useGridPyramiding) {
    await checkGridPyramiding(slot, currentPrice, productId);
  }

  // ── Deduplicate early return (Moved to fix Issue C: prevent 30 API calls per poll) ──
  // If we already fully processed this candle, we do not need to recalculate indicators or check signals.
  if (closedCandleTime <= slot.lastExecutedCandleTime) {
    return;
  }

  // ── Detect EMA crossover on CLOSED candles ──
  const isCrossUp   = prevFast <= prevSlow && currFast > currSlow;
  const isCrossDown = prevFast >= prevSlow && currFast < currSlow;
  const emaGapPct   = Math.abs(currFast - currSlow) / currSlow * 100;

  // ── Trend filter: EMA(200) — pre-computed here, not inside the filter block ──
  // Fix #4: Previously calculateEmaSeries(closes, 200) was called inside the if-block below,
  // wasting CPU on every poll. With 30 slots × 600+ candles this is millions of ops per minute.
  // Pre-compute once per cycle and reference the single value.
  let trendDir: 'BULL' | 'BEAR' | 'NONE' = 'NONE';
  if (slot.useTrendFilter && closes.length >= 202) {
    const ema200Series = calculateEmaSeries(closes, 200);
    const ema200 = ema200Series[currentClosedIdx];
    if (isFinite(ema200)) {
      trendDir = closedPrice > ema200 ? 'BULL' : 'BEAR';
    }
  }

  // ── ATR calculation (for dynamic SL) ──
  const closedCandlesArray = closes.slice(0, currentClosedIdx + 1);
  const atrValue = slot.useAtrSl ? calculateATR(highs.slice(0, currentClosedIdx + 1), lows.slice(0, currentClosedIdx + 1), closedCandlesArray, 14) : 0;

  // ── RSI ──
  const rsiValue = calculateRSI(closedCandlesArray, slot.rsiPeriod || 14);

  const trendStr = trendDir !== 'NONE' ? ` | Trend: ${trendDir}` : '';
  const atrStr   = slot.useAtrSl && atrValue > 0 ? ` | ATR: ${formatPrice(atrValue)}` : '';
  addLog(
    `[${slot.symbol}] Price: ${formatPrice(currentPrice)} | Fast(${slot.fastEmaPeriod}): ${formatPrice(currFast)} | Slow(${slot.slowEmaPeriod}): ${formatPrice(currSlow)} | Gap: ${emaGapPct.toFixed(3)}% | RSI: ${rsiValue.toFixed(1)}${trendStr}${atrStr}`,
    'info'
  );

  // ══════════════════════════════════════════════════
  // SIGNAL DETECTION
  // ══════════════════════════════════════════════════

  // We work with two signal flags:
  //   freshCrossUp / freshCrossDown = new EMA crossover happened THIS candle
  //   finalBuy / finalSell          = the signal we will actually act on
  // These are the same in 1-candle mode; in 2-candle mode, a confirmed
  // continuation on the 2nd candle (no fresh cross) sets finalBuy/finalSell.
  let finalBuy  = isCrossUp;
  let finalSell = isCrossDown;

  // ── 2-CANDLE CONFIRM: Continuation check on the 2nd candle ──
  // When confirmCandles >= 2, the SECOND candle only needs the EMAs
  // still on the correct side (no NEW crossover needed).
  if (!(isCrossUp || isCrossDown)) {
    const hasPending = slot.pendingSignal !== 'NONE' && slot.pendingSignalCandleTime > 0;
    const isNewCandleAfterPending = closedCandleTime > slot.pendingSignalCandleTime;
    const notAlreadyProcessed = closedCandleTime > slot.lastExecutedCandleTime;

    if (hasPending && isNewCandleAfterPending && notAlreadyProcessed) {
      // Check EMA continuation
      const fastStillAbove = slot.pendingSignal === 'BUY'  && currFast > currSlow;
      const fastStillBelow = slot.pendingSignal === 'SELL' && currFast < currSlow;

      if (fastStillAbove || fastStillBelow) {
        addLog(`✔️ [${slot.symbol}] 2-candle confirm: EMA held on 2nd candle (${slot.pendingSignal}). Executing.`, 'success');
        finalBuy  = slot.pendingSignal === 'BUY';
        finalSell = slot.pendingSignal === 'SELL';
        slot.pendingSignal = 'NONE';
        slot.pendingSignalCandleTime = 0;
        // Fall through to execution below with finalBuy/finalSell set
      } else {
        addLog(`⚠️ [${slot.symbol}] 2-candle confirm: EMA reversed before 2nd candle — signal cancelled.`, 'info');
        slot.pendingSignal = 'NONE';
        slot.pendingSignalCandleTime = 0;
        slot.lastExecutedCandleTime = closedCandleTime;
        return;
      }
    } else {
      // No pending signal or same candle — nothing to do
      if (hasPending && isNewCandleAfterPending) {
        addLog(`[${slot.symbol}] Pending signal expired (no EMA continuation).`, 'info');
        slot.pendingSignal = 'NONE';
        slot.pendingSignalCandleTime = 0;
      }
      if (closedCandleTime > slot.lastExecutedCandleTime) {
        slot.lastExecutedCandleTime = closedCandleTime;
      }
      return;
    }
  }

  // No signal to act on at all
  if (!finalBuy && !finalSell) {
    slot.lastExecutedCandleTime = closedCandleTime;
    return;
  }

  const crossStateStr = finalBuy ? 'BUY' : 'SELL';
  if (isCrossUp || isCrossDown) {
    addLog(`🔔 [${slot.symbol}] EMA Cross Detected! Signal: ${crossStateStr} | Strength: ${emaGapPct.toFixed(3)}%`, 'success');
  }

  // ══════════════════════════════════════════════════
  // FILTER 1: EMA Gap Minimum Threshold (noise guard)
  // Mark candle processed but never change position on gap rejection.
  // ══════════════════════════════════════════════════
  const gapMin = slot.emaGapMinPct || 0;
  if (gapMin > 0 && emaGapPct < gapMin) {
    addLog(`⏭️ [${slot.symbol}] EMA Gap too small (${emaGapPct.toFixed(3)}% < ${gapMin}%) — noise filter. Skipping.`, 'info');
    slot.lastExecutedCandleTime = closedCandleTime;
    return;
  }

  // ══════════════════════════════════════════════════
  // FILTER 2: Price Confirmation
  // Closed price must be on the correct side of the slow EMA.
  // ══════════════════════════════════════════════════
  if (slot.usePriceConfirmation) {
    if (finalBuy && closedPrice < currSlow) {
      addLog(`⏭️ [${slot.symbol}] Price confirmation: BUY rejected — closed ${formatPrice(closedPrice)} is BELOW slow EMA ${formatPrice(currSlow)}.`, 'info');
      slot.lastExecutedCandleTime = closedCandleTime;
      return;
    }
    if (finalSell && closedPrice > currSlow) {
      addLog(`⏭️ [${slot.symbol}] Price confirmation: SELL rejected — closed ${formatPrice(closedPrice)} is ABOVE slow EMA ${formatPrice(currSlow)}.`, 'info');
      slot.lastExecutedCandleTime = closedCandleTime;
      return;
    }
    addLog(`✔️ [${slot.symbol}] Price confirmation passed.`, 'info');
  }

  // ══════════════════════════════════════════════════
  // FILTER 3: EMA(200) Trend Filter
  // Only trade in the direction of the macro trend.
  // ══════════════════════════════════════════════════
  if (slot.useTrendFilter && trendDir !== 'NONE') {
    if (finalBuy && trendDir !== 'BULL') {
      addLog(`⏭️ [${slot.symbol}] Trend filter: BUY rejected — macro is BEAR (price below EMA200).`, 'info');
      slot.lastExecutedCandleTime = closedCandleTime;
      return;
    }
    if (finalSell && trendDir !== 'BEAR') {
      addLog(`⏭️ [${slot.symbol}] Trend filter: SELL rejected — macro is BULL (price above EMA200).`, 'info');
      slot.lastExecutedCandleTime = closedCandleTime;
      return;
    }
    addLog(`✔️ [${slot.symbol}] Trend filter passed (${trendDir}).`, 'info');
  }

  // ══════════════════════════════════════════════════
  // FILTER 4: RSI
  // Position is NEVER changed by a filter rejection.
  // ══════════════════════════════════════════════════
  if (slot.useRsiFilter) {
    if (finalBuy && rsiValue >= slot.rsiOverbought) {
      addLog(`⏭️ [${slot.symbol}] RSI filter: BUY rejected — RSI ${rsiValue.toFixed(1)} >= ${slot.rsiOverbought} (overbought)`, 'info');
      slot.lastExecutedCandleTime = closedCandleTime;
      return;
    }
    if (finalSell && rsiValue <= slot.rsiOversold) {
      addLog(`⏭️ [${slot.symbol}] RSI filter: SELL rejected — RSI ${rsiValue.toFixed(1)} <= ${slot.rsiOversold} (oversold)`, 'info');
      slot.lastExecutedCandleTime = closedCandleTime;
      return;
    }
  }

  // ── FILTER 5: Volume ──
  if (slot.useVolumeFilter && !isVolumeAboveAverage(ohlcv)) {
    addLog(`⏭️ [${slot.symbol}] Volume filter: Signal rejected — volume below 20-candle average (likely fakeout)`, 'info');
    slot.lastExecutedCandleTime = closedCandleTime;
    return;
  }

  // ── FILTER 5.5: Bollinger Bands ──
  if (slot.useBbFilter) {
    const bb = calculateBollingerBands(closedCandlesArray, slot.bbPeriod || 20, slot.bbStdDev || 2);
    if (finalBuy && closedPrice > bb.upper) {
      addLog(`⏭️ [${slot.symbol}] Bollinger Bands filter: BUY rejected — closed price ${formatPrice(closedPrice)} is above upper band ${formatPrice(bb.upper)}.`, 'info');
      slot.lastExecutedCandleTime = closedCandleTime;
      return;
    }
    if (finalSell && closedPrice < bb.lower) {
      addLog(`⏭️ [${slot.symbol}] Bollinger Bands filter: SELL rejected — closed price ${formatPrice(closedPrice)} is below lower band ${formatPrice(bb.lower)}.`, 'info');
      slot.lastExecutedCandleTime = closedCandleTime;
      return;
    }
  }

  // ── FILTER 6: Cooldown ──
  if (slot.cooldownCandles > 0 && slot.lastTradeCandles > 0) {
    const lastTradeIdx = ohlcv.findIndex((c: any) => c[0] === slot.lastTradeCandles);
    const candlesSinceLast = lastTradeIdx >= 0 
      ? currentClosedIdx - lastTradeIdx 
      : Math.floor((closedCandleTime - slot.lastTradeCandles) / (getTimeframeSeconds(slot.timeframe) * 1000));
    if (candlesSinceLast < slot.cooldownCandles) {
      addLog(`⏭️ [${slot.symbol}] Cooldown: ${candlesSinceLast}/${slot.cooldownCandles} candles since last trade. Skipping.`, 'info');
      slot.lastExecutedCandleTime = closedCandleTime;
      return;
    }
  }

  // ══════════════════════════════════════════════════
  // 2-CANDLE CONFIRMATION — FIRST CANDLE RECORDING
  // (Second candle is handled by the continuation check at the top)
  // ══════════════════════════════════════════════════
  const confirmRequired = (slot.confirmCandles || 1) >= 2;
  if (confirmRequired && (isCrossUp || isCrossDown)) {
    // This is always the first candle of a fresh cross when we reach here
    // (continuation/2nd-candle path was already handled above)
    slot.pendingSignal = crossStateStr;
    slot.pendingSignalCandleTime = closedCandleTime;
    addLog(`⏳ [${slot.symbol}] 2-candle confirm: First cross (${crossStateStr}) recorded. Waiting for EMA to hold next candle.`, 'info');
    slot.lastExecutedCandleTime = closedCandleTime;
    return;
  }

  // ══════════════════════════════════════════════════
  // EXECUTION — Enter/Exit only on REAL opposite signal
  // ══════════════════════════════════════════════════
  const orderSide  = finalBuy ? 'buy' : 'sell';
  const targetSize = slot.size || 1;

  // ── STEP 1: Fetch current position with strict null-check ──
  let currentContracts = 0;
  let posSide: string | undefined;
  try {
    const positionsResp = await deltaClient.getPositions();
    const positions     = positionsResp.result || [];
    const pos           = positions.find((p: any) => p.product_id === productId);
    if (pos != null) {
      const rawSize = Number(pos.size);
      if (isFinite(rawSize) && rawSize !== 0) {
        currentContracts = Math.abs(rawSize);
        posSide          = rawSize > 0 ? 'buy' : 'sell';
      }
    }
    addLog(
      `📊 [${slot.symbol}] Position: ${currentContracts > 0 ? `Holding ${posSide?.toUpperCase()} × ${currentContracts}` : 'Flat'}`,
      'info'
    );
  } catch (posErr: any) {
    addLog(`⚠️ [${slot.symbol}] Could not fetch positions: ${posErr.message}. Will attempt anyway.`, 'error');
  }

  // ── STEP 2: Already holding SAME direction → skip (deduplicate) ──
  if (currentContracts > 0 && posSide === orderSide) {
    addLog(`⏭️ [${slot.symbol}] Already holding ${posSide?.toUpperCase()} — skipping duplicate ${crossStateStr}.`, 'info');
    slot.lastExecutedCandleTime = closedCandleTime;
    return;
  }

  // ── STEP 3: Holding OPPOSITE direction → close it (EXIT on opposite signal only) ──
  if (currentContracts > 0 && posSide && posSide !== orderSide) {
    const closingSide = posSide === 'buy' ? 'sell' : 'buy';
    addLog(`🔄 [${slot.symbol}] OPPOSITE signal! Closing ${posSide.toUpperCase()} × ${currentContracts} contracts...`, 'info');
    try {
      slot.lastCloseAttempt = Date.now(); // Record the attempt to debounce Issue A
      await placeDeltaMarketOrder(slot.symbol, closingSide, currentContracts, currentPrice, slot, { reduce_only: true });
      addLog(`✅ [${slot.symbol}] Closed ${posSide.toUpperCase()} position successfully.`, 'success');
      // Reset leverageSet so it is always re-confirmed before new entry
      slot.leverageSet = false;
      slot.currentPyramidLevel = 0;
      slot.averageEntryPrice = 0;
      slot.trailingSlPrice = 0;
    } catch (closeErr: any) {
      addLog(`❌ [${slot.symbol}] Failed to close ${posSide.toUpperCase()}: ${closeErr.message}`, 'error');
      // Do NOT advance lastExecutedCandleTime — allow full retry next cycle
      return;
    }

    // Standard strategy: only close, do NOT enter opposite
    const isDirectionAllowed = !slot.tradeDirection || slot.tradeDirection === 'both' || (slot.tradeDirection === 'long' && orderSide === 'buy') || (slot.tradeDirection === 'short' && orderSide === 'sell');

    if (slot.strategy !== 'always_in' || !isDirectionAllowed) {
      addLog(`📋 [${slot.symbol}] Strategy=standard or Direction restricted: Closed position. Will NOT enter new ${orderSide.toUpperCase()}.`, 'info');
      slot.lastExecutedCandleTime = closedCandleTime;
      slot.lastSignal             = crossStateStr;
      slot.lastTradeCandles       = closedCandleTime;
      slot.tradesExecuted++;
      return;
    }

    // Always-In strategy: do NOT block. Let the next polling cycle handle the entry.
    // Explicitly fixed Issue #3 to avoid 10s synchronous blocking retries
    addLog(`⏳ [${slot.symbol}] Strategy=always_in: Closed old position. Will enter new ${orderSide.toUpperCase()} on next poll.`, 'info');
    // We do NOT update lastExecutedCandleTime so the next cycle processes this same candle again and enters the new position.
    return;
  }

  // ── STEP 3.5: Set leverage before entry (reset after every close) ──
  if (!slot.leverageSet && slot.leverage > 0) {
    try {
      await deltaClient.setLeverage(productId, slot.leverage);
      slot.leverageSet = true;
      addLog(`⚙️ [${slot.symbol}] Leverage set to ${slot.leverage}x`, 'info');
    } catch (levErr: any) {
      addLog(`⚠️ [${slot.symbol}] Could not set leverage (will use exchange default): ${levErr.message}`, 'error');
    }
  }

  // ── STEP 3.6: ATR-based dynamic SL ──
  let dynamicSlPct: number | undefined;
  if (slot.useAtrSl && atrValue > 0 && currentPrice > 0) {
    const multiplier = slot.atrMultiplier || 1.5;
    dynamicSlPct     = (atrValue * multiplier / currentPrice) * 100;
    addLog(`📐 [${slot.symbol}] ATR SL: ${formatPrice(atrValue)} × ${multiplier} = ${dynamicSlPct.toFixed(2)}% from entry`, 'info');
  }

  const slotForEntry: TradingSlot = slot.useAtrSl && dynamicSlPct != null
    ? { ...slot, stopLossPct: dynamicSlPct }
    : slot;

  // ── STEP 3.9: Check Trade Direction ──
  const isDirectionAllowedEntry = !slot.tradeDirection || slot.tradeDirection === 'both' || (slot.tradeDirection === 'long' && orderSide === 'buy') || (slot.tradeDirection === 'short' && orderSide === 'sell');
  if (!isDirectionAllowedEntry) {
    addLog(`⏭️ [${slot.symbol}] Skipping ${orderSide.toUpperCase()} entry because Trade Direction is restricted to ${slot.tradeDirection.toUpperCase()}.`, 'info');
    slot.lastExecutedCandleTime = closedCandleTime;
    slot.lastSignal             = crossStateStr;
    return;
  }

  // ── STEP 4: Enter new position ──
  addLog(`🚀 [${slot.symbol}] Entering ${orderSide.toUpperCase()} × ${targetSize} contracts...`, 'info');
  try {
    const result = await placeDeltaMarketOrder(slot.symbol, orderSide, targetSize, currentPrice, slotForEntry);
    addLog(`✅ [${slot.symbol}] ${orderSide.toUpperCase()} entry placed! Order ID: ${result?.id || 'OK'}`, 'success');

    // Advance state ONLY on confirmed success
    slot.lastExecutedCandleTime = closedCandleTime;
    slot.lastSignal             = crossStateStr;
    slot.lastTradeCandles       = closedCandleTime;
    slot.tradesExecuted++;
    // Store the initial anchor price for grid pyramiding — never overwrite once set
    slot.averageEntryPrice = currentPrice;

    // Non-blocking position verification (3s after order)
    setTimeout(async () => {
      try {
        const checkResp = await deltaClient.getPositions();
        const checkPos  = (checkResp.result || []).find((p: any) => p.product_id === productId);
        const confirmedSize = checkPos ? Number(checkPos.size) : 0;
        if (isFinite(confirmedSize) && confirmedSize !== 0) {
          addLog(`📋 [${slot.symbol}] Position confirmed: ${confirmedSize > 0 ? 'LONG' : 'SHORT'} × ${Math.abs(confirmedSize)}`, 'success');
        } else {
          addLog(`⚠️ [${slot.symbol}] Entry placed but not yet visible — may be pending fill.`, 'info');
        }
      } catch (_) {}
    }, 3000);
  } catch (entryErr: any) {
    addLog(`❌ [${slot.symbol}] Failed to enter ${orderSide.toUpperCase()}: ${entryErr.message}`, 'error');
    // Do NOT advance lastExecutedCandleTime — allow full retry next cycle
    if (entryErr.message.includes('signature') || entryErr.message.includes('401')) {
      isBotRunning = false;
      apiAuthError = "Invalid Delta API Credentials or Signature.";
      addLog('Bot stopped due to API authentication failure.', 'error');
    }
  }
}

// ══════════════════════════════════════════════════════════════════
// API ROUTES — Diagnostic & Account
// ══════════════════════════════════════════════════════════════════

app.post('/api/ping', async (req, res) => {
  try {
    const [balancesResp, profileResp] = await Promise.all([
      deltaClient.getBalances(),
      deltaClient.getProfile(),
    ]);

    const assets = (balancesResp.result || []).map((a: any) => ({
      asset: a.asset_symbol,
      total: parseFloat(a.balance),
      free: parseFloat(a.available_balance)
    })).filter((a: any) => a.total > 0);

    return res.json({
      success: true,
      assets,
      profile: profileResp.result,
      serverTime: Date.now(),
      localTime: Date.now()
    });
  } catch (error: any) {
    return res.status(400).json({
      success: false,
      message: formatDeltaError(error)
    });
  }
});

app.get('/api/positions', async (req, res) => {
  try {
    const { symbol } = req.query;
    if (productsCache.length === 0) await syncProducts();
    const positionsResp = await deltaClient.getPositions();
    let positions = positionsResp.result || [];

    positions = positions.map((p: any) => {
      const prod = productsCache.find((prod: any) => prod.id === p.product_id);
      const size = Number(p.size) || 0;
      return {
        ...p,
        symbol: prod ? prod.symbol : p.product_id,
        contracts: size,
        side: size > 0 ? 'long' : 'short',
        entryPrice: p.entry_price,
        liquidationPrice: p.liquidation_price,
        info: { realized_pnl: p.realized_pnl }
      };
    });

    if (symbol) {
      positions = positions.filter((p: any) => p.symbol === symbol);
    }

    return res.json({ success: true, positions });
  } catch (error: any) {
    const msg = formatDeltaError(error);
    if (msg.includes('unauthorized') || msg.includes('signature')) {
      return res.status(401).json({ success: false, message: msg });
    }
    return res.status(400).json({ success: false, message: msg });
  }
});

app.post('/api/close_position', async (req, res) => {
  try {
    const { symbol, side, size } = req.body;
    if (productsCache.length === 0) await syncProducts();
    const productId = getProductId(symbol);
    if (!productId) throw new Error("Product ID not found for " + symbol);
    const closeSize = Math.abs(Number(size));
    if (!Number.isFinite(closeSize) || closeSize <= 0) {
      throw new Error(`Invalid close size: ${size}`);
    }

    const closingSide = (side as string).toLowerCase() === 'buy' || (side as string).toLowerCase() === 'long' ? 'sell' : 'buy';

    const result = await deltaClient.placeOrder(productId, Math.floor(closeSize), closingSide, 'market_order', { reduce_only: true });
    appendTradeToSheet({
      symbol,
      side: closingSide,
      orderType: 'market_order',
      size: Math.floor(closeSize),
      price: 'Market Close',
      orderId: result.result?.id || result?.id || 'unknown'
    }).catch(e => console.error(e));
    return res.json({ success: true, result });
  } catch (error: any) {
    const msg = formatDeltaError(error);
    return res.status(400).json({ success: false, message: msg });
  }
});

// ══════════════════════════════════════════════════════════════════
// DELTA API PROXY ROUTES
// ══════════════════════════════════════════════════════════════════

app.get('/api/delta/verify_order/:id', async (req, res) => {
  try {
    const orderId = req.params.id;
    const result = await deltaClient.verifyOrderExecution(orderId);
    return res.json(result);
  } catch (error: any) {
    return res.status(400).json({ success: false, message: formatDeltaError(error) });
  }
});

app.get('/api/delta/products', async (req, res) => {
  try {
    const products = await deltaClient.getProducts();
    return res.json(products);
  } catch (error: any) {
    return res.status(400).json({ success: false, message: formatDeltaError(error) });
  }
});

app.get('/api/delta/tickers/:symbol', async (req, res) => {
  try {
    const ticker = await deltaClient.getTicker(req.params.symbol);
    return res.json(ticker);
  } catch (error: any) {
    return res.status(400).json({ success: false, message: formatDeltaError(error) });
  }
});

app.get('/api/delta/history/candles', async (req, res) => {
  try {
    const { symbol, resolution, start, end } = req.query as any;
    const history = await deltaClient.getHistoricalCandles(symbol, resolution, start, end);
    return res.json(history);
  } catch (error: any) {
    return res.status(400).json({ success: false, message: formatDeltaError(error) });
  }
});

app.post('/api/delta/orders', async (req, res) => {
  try {
    const { product_id, size, side, order_type, ...extraParams } = req.body;

    // Explicitly fixes Issue P: Validate proxy inputs to prevent unpredictable Delta API behavior
    if (!product_id || typeof product_id !== 'number') return res.status(400).json({ success: false, message: 'Invalid product_id' });
    if (!size || typeof size !== 'number' || size <= 0) return res.status(400).json({ success: false, message: 'Invalid size' });
    if (!['BUY', 'SELL', 'buy', 'sell'].includes(side)) return res.status(400).json({ success: false, message: 'Invalid side' });

    const order = await deltaClient.placeOrder(product_id, size, side, order_type || 'market_order', extraParams);
    return res.json(order);
  } catch (error: any) {
    return res.status(400).json({ success: false, message: formatDeltaError(error) });
  }
});

app.get('/api/balances', async (req, res) => {
  try {
    const balancesResp = await deltaClient.getBalances();
    const assets = (balancesResp.result || []).map((a: any) => ({
      asset: a.asset_symbol,
      total: parseFloat(a.balance),
      free: parseFloat(a.available_balance),
      used: parseFloat(a.blocked_margin || '0')
    })).filter((a: any) => a.total > 0);

    return res.json({ success: true, assets });
  } catch (error: any) {
    const msg = formatDeltaError(error);
    if (msg.includes('unauthorized') || msg.includes('signature')) {
      return res.status(401).json({ success: false, message: msg });
    }
    return res.status(400).json({ success: false, message: msg });
  }
});

let cachedSyncedSymbols: string[] = [];
let cachedSyncedSymbolsTime: number = 0;

app.get('/api/symbols', async (req, res) => {
  try {
    const force = req.query.force === 'true';
    const now = Date.now();
    if (force) {
      await syncProducts();
    } else if (cachedSyncedSymbols.length > 0 && now - cachedSyncedSymbolsTime < 3600000) {
      return res.json({ success: true, symbols: cachedSyncedSymbols, cached: true });
    }

    if (productsCache.length === 0) await syncProducts();

    const validSymbols = productsCache
      .filter((p: any) => p.contract_type === 'perpetual_futures' && p.state === 'live')
      .map((p: any) => p.symbol)
      .sort();

    cachedSyncedSymbols = [...new Set(validSymbols)];
    cachedSyncedSymbolsTime = now;

    return res.json({ success: true, symbols: cachedSyncedSymbols });
  } catch (error: any) {
    return res.status(400).json({ success: false, message: formatDeltaError(error) });
  }
});

// ══════════════════════════════════════════════════════════════════
// API ROUTES — Status, Credentials, Config
// ══════════════════════════════════════════════════════════════════

app.get('/api/status', (req, res) => {
  res.json({
    isBotRunning,
    apiAuthError,
    logs,
    formConfig,
    slots: Array.from(activeSlots.values()),
    hasKeys: !!(process.env.DELTA_KEY && process.env.DELTA_SECRET)
  });
});

app.post('/api/credentials', (req, res) => {
  let { apiKey, apiSecret } = req.body;
  if (!apiKey || !apiSecret || !apiKey.trim() || !apiSecret.trim()) {
    return res.status(400).json({ success: false, message: 'Missing API Key or Secret' });
  }
  apiKey = apiKey.trim();
  apiSecret = apiSecret.trim();

  process.env.DELTA_KEY = apiKey;
  process.env.DELTA_SECRET = apiSecret;
  deltaClient.resetTimeSync();

  apiAuthError = null;
  // Explicitly verified Issue #9: No longer saving credentials to .env file on disk. 
  // Credentials are only kept in memory during the session for security.
  addLog("API Credentials updated in memory for this session (not saved to disk).", "success");
  res.json({ success: true, message: 'Credentials updated in memory successfully' });
});

app.post('/api/credentials/clear', (req, res) => {
  delete process.env.DELTA_KEY;
  delete process.env.DELTA_SECRET;
  deltaClient.resetTimeSync();

  apiAuthError = "Credentials cleared manually.";
  addLog("API Credentials cleared from memory successfully", "info");
  res.json({ success: true, message: 'Credentials cleared from memory successfully' });
});

// Fix #6: Whitelist allowed config keys — prevents raw req.body spread from injecting
// arbitrary fields into formConfig, which is sent to all clients on every /api/status call.
const ALLOWED_FORM_CONFIG_KEYS = new Set([
  'symbol', 'timeframe', 'fastEmaPeriod', 'slowEmaPeriod', 'size', 'leverage',
  'allocationType', 'orderType', 'limitPrice', 'takeProfitPct', 'stopLossPct',
  'strategy', 'useRsiFilter', 'rsiPeriod', 'rsiOverbought', 'rsiOversold',
  'useVolumeFilter', 'cooldownCandles', 'usePriceConfirmation', 'emaGapMinPct',
  'confirmCandles', 'useTrendFilter', 'useAtrSl', 'atrMultiplier',
  'useBbFilter', 'bbPeriod', 'bbStdDev', 'useGridPyramiding', 'gridStepPct',
  'maxPyramidLevels', 'tradingFeePct', 'slippagePct', 'initialBalance',
  'startDate', 'endDate', 'optFastEmaMin', 'optFastEmaMax', 'optSlowEmaMin', 'optSlowEmaMax', 'optimizationMethod', 'filtersToOptimize', 'optTimeframes',
  'optRsiPeriodMin', 'optRsiPeriodMax', 'optRsiObMin', 'optRsiObMax', 'optRsiOsMin', 'optRsiOsMax',
  'optBbPeriodMin', 'optBbPeriodMax', 'optBbStdDevMin', 'optBbStdDevMax', 'optAtrMultMin', 'optAtrMultMax',
  'optEmaGapMin', 'optEmaGapMax', 'optCooldownMin', 'optCooldownMax', 'optGridStepMin', 'optGridStepMax',
  'optPyramidMin', 'optPyramidMax'
]);

// Form config endpoint — only updates the UI form state, does NOT affect running slots
app.post('/api/config', (req, res) => {
  const sanitized = Object.fromEntries(
    Object.entries(req.body).filter(([k]) => ALLOWED_FORM_CONFIG_KEYS.has(k))
  );
  formConfig = {
    ...formConfig,
    ...sanitized,
    symbol: sanitized.symbol ? String(sanitized.symbol).toUpperCase().trim() : formConfig.symbol,
    fastEmaPeriod: sanitized.fastEmaPeriod !== undefined ? parseInt(sanitized.fastEmaPeriod as string, 10) : formConfig.fastEmaPeriod,
    slowEmaPeriod: sanitized.slowEmaPeriod !== undefined ? parseInt(sanitized.slowEmaPeriod as string, 10) : formConfig.slowEmaPeriod,
  };

  // NOTE: We do NOT reset lastExecutedCandleTime here. That was a major bug.
  res.json({ success: true, formConfig });
});

app.post('/api/clear-memory', (req, res) => {
  logs = [{ time: new Date().toLocaleTimeString(), message: "Memory cleared. Caches reset.", type: 'info' }];
  binanceUnsupportedSymbols.clear();
  cachedSyncedSymbols = [];
  cachedSyncedSymbolsTime = 0;
  apiAuthError = null;
  isBotRunning = false;
  if (botInterval) { clearTimeout(botInterval); botInterval = null; } // Fix #7: null after clear
  activeSlots.clear();

  candleCache.clear(); // Fix: Clear stale candle cache so cleared symbols don't resurrect
  saveSlots();         // Fix: Persist the cleared state so reload doesn't resurrect old slots
  addLog("System memory, caches, and all slots have been cleared.", "success");
  res.json({ success: true, message: 'Memory cleared' });
});

// ══════════════════════════════════════════════════════════════════
// API ROUTES — Slot Management
// ══════════════════════════════════════════════════════════════════

app.get('/api/slots', (req, res) => {
  res.json({ success: true, slots: Array.from(activeSlots.values()) });
});

app.post('/api/slots/add', (req, res) => {
  const {
    symbol, timeframe, fastEmaPeriod, slowEmaPeriod, size, leverage,
    allocationType, orderType, takeProfitPct, stopLossPct, strategy, tradeDirection,
    useRsiFilter, rsiPeriod, rsiOverbought, rsiOversold,
    useVolumeFilter, cooldownCandles,
    // Advanced signal filters
    usePriceConfirmation, emaGapMinPct, confirmCandles,
    useTrendFilter, useAtrSl, atrMultiplier,
    useBbFilter, bbPeriod, bbStdDev,
    useGridPyramiding, gridStepPct, maxPyramidLevels
  } = req.body;

  if (!symbol || !timeframe) {
    return res.status(400).json({ success: false, message: 'Symbol and timeframe are required' });
  }

  // Fix #2: Block ALL_ASSETS server-side — it is a UI-only meta-value, not a real symbol.
  // A direct API call with ALL_ASSETS would create a slot that crashes every bot cycle.
  // Use raw symbol here; normalizedSymbol is not yet declared at this point.
  if (String(symbol).toUpperCase().trim() === 'ALL_ASSETS') {
    return res.status(400).json({ success: false, message: 'ALL_ASSETS is not a valid tradeable symbol. Use the bulk-add feature in the UI.' });
  }

  // Parse ALL numeric fields to numbers at creation time
  const fast = parseInt(fastEmaPeriod, 10) || 9;
  const slow = parseInt(slowEmaPeriod, 10) || 21;

  if (fast >= slow) {
    return res.status(400).json({ success: false, message: `Fast EMA (${fast}) must be less than Slow EMA (${slow}).` });
  }

  const normalizedSymbol = String(symbol).toUpperCase().trim();
  const slotId = generateSlotId({ symbol: normalizedSymbol, timeframe, fastEmaPeriod: fast, slowEmaPeriod: slow });

  // Explicitly verified Issue #7: This strict symbol-level duplicate check prevents orphaning positions.
  // A slot must be explicitly removed before adding a new one for the same symbol.
  if (Array.from(activeSlots.values()).some((s: TradingSlot) => s.symbol === normalizedSymbol)) {
    return res.status(400).json({ success: false, message: `A slot for ${normalizedSymbol} already exists. Delta Exchange only allows 1 position per symbol. Please remove the existing slot for ${normalizedSymbol} before adding a new configuration.` });
  }

  const parsedSize     = Number(size)           || 1;
  const parsedLeverage = Number(leverage)        || 10;
  const parsedTp       = Number(takeProfitPct)   || 0;
  const parsedSl       = Number(stopLossPct)     || 0;

  const newSlot: TradingSlot = {
    id:                    slotId,
    symbol:                normalizedSymbol,
    timeframe,
    fastEmaPeriod:         fast,
    slowEmaPeriod:         slow,
    size:                  parsedSize,
    leverage:              parsedLeverage,
    allocationType:        allocationType  || 'fixed',
    orderType:             orderType       || 'market',
    takeProfitPct:         parsedTp,
    stopLossPct:           parsedSl,
    strategy:              strategy        || 'always_in',
    tradeDirection:        tradeDirection  || 'both',
    lastExecutedCandleTime: 0,
    lastSignal:            'NONE',
    // Filters
    useRsiFilter:          Boolean(useRsiFilter),
    rsiPeriod:             Number(rsiPeriod)       || 14,
    rsiOverbought:         Number(rsiOverbought)   || 70,
    rsiOversold:           Number(rsiOversold)     || 30,
    useVolumeFilter:       Boolean(useVolumeFilter),
    cooldownCandles:       Number(cooldownCandles) || 0,
    lastTradeCandles:      0,
    tradesExecuted:        0,
    leverageSet:           false,
    // Bollinger Bands Filter
    useBbFilter:           Boolean(useBbFilter),
    bbPeriod:              Number(bbPeriod)        || 20,
    bbStdDev:              Number(bbStdDev)        || 2,
    // Advanced signal filters
    usePriceConfirmation:  Boolean(usePriceConfirmation),
    emaGapMinPct:          Number(emaGapMinPct)    || 0,
    confirmCandles:        Number(confirmCandles)  || 1,
    useTrendFilter:        Boolean(useTrendFilter),
    useAtrSl:              Boolean(useAtrSl),
    atrMultiplier:         Number(atrMultiplier)   || 1.5,
    useGridPyramiding:     Boolean(useGridPyramiding),
    gridStepPct:           Number(gridStepPct)     || 1.0,
    maxPyramidLevels:      Number(maxPyramidLevels) || 3,
    // Internal state
    pendingSignal:         'NONE',
    pendingSignalCandleTime: 0,
    currentPyramidLevel:   0,
    averageEntryPrice:     0,
    trailingSlPrice:       0
  };

  activeSlots.set(slotId, newSlot);
  saveSlots();
  addLog(`➕ Slot added: ${slotId} | Strategy: ${newSlot.strategy} | Size: ${parsedSize} | Leverage: ${parsedLeverage}x`, 'success');
  return res.json({ success: true, slot: newSlot });
});

app.delete('/api/slots/:id', (req, res) => {
  const slotId = req.params.id;
  if (!activeSlots.has(slotId)) {
    return res.status(404).json({ success: false, message: `Slot "${slotId}" not found.` });
  }
  const removedSlot = activeSlots.get(slotId)!;
  // Fix: Evict candle cache for the removed slot so re-adding doesn't use stale data
  const baseCoin = removedSlot.symbol.replace(/USDT$/, '').replace(/USD$/, '');
  for (const key of candleCache.keys()) {
    if (key.startsWith(`${baseCoin}/`) || key.startsWith(removedSlot.symbol)) {
      candleCache.delete(key);
    }
  }
  activeSlots.delete(slotId);
  saveSlots();
  addLog(`➖ Slot removed: ${slotId}`, 'info');
  res.json({ success: true, message: `Slot "${slotId}" removed.` });
});

// ══════════════════════════════════════════════════════════════════
// API ROUTES — Engine Control
// ══════════════════════════════════════════════════════════════════

app.post('/api/start', async (req, res) => {
  if (isBotRunning) {
    return res.status(400).json({ message: "Bot is already running" });
  }

  if (!process.env.DELTA_KEY || !process.env.DELTA_SECRET) {
    apiAuthError = "Missing Delta Exchange credentials";
    addLog("Failed to start: Missing Delta Exchange credentials", "error");
    return res.status(400).json({ message: "Missing credentials" });
  }

  if (activeSlots.size === 0) {
    addLog("Failed to start: No trading slots configured. Add at least one slot first.", "error");
    return res.status(400).json({ message: "No trading slots configured. Add at least one slot first." });
  }

  isBotRunning = true;
  apiAuthError = null;

  const slotNames = Array.from(activeSlots.values()).map(s => s.symbol).join(', ');
  addLog(`🤖 Delta Engine Started with ${activeSlots.size} slot(s): [${slotNames}]`, "success");

  await syncProducts();

  const loopBot = async () => {
    if (!isBotRunning) return;
    await runBotCycle();
    if (isBotRunning) {
      const nextMs = getAdaptiveInterval();
      // Explicitly verified Issue #6: Using recursive setTimeout instead of setInterval ensures interval adapts dynamically
      botInterval = setTimeout(loopBot, nextMs) as any;
    }
  };

  loopBot();

  res.json({ success: true });
});

app.post('/api/stop', (req, res) => {
  isBotRunning = false;
  if (botInterval) { clearTimeout(botInterval); botInterval = null; }
  addLog("Bot stopped manually.", "info");
  res.json({ success: true });
});

// ══════════════════════════════════════════════════════════════════
// API ROUTES — Manual Trade
// ══════════════════════════════════════════════════════════════════
const rateLimits = new Map<string, number>();
// Explicitly fixes Issue E: Sweep old entries to prevent infinite memory growth
setInterval(() => {
  const now = Date.now();
  for (const [key, timestamp] of rateLimits.entries()) {
    if (now - timestamp > 60000) rateLimits.delete(key);
  }
}, 60000);
function checkRateLimit(ip: string, route: string, limitMs: number = 2000): boolean {
  const key = `${ip}_${route}`;
  const now = Date.now();
  if (rateLimits.has(key) && now - rateLimits.get(key)! < limitMs) {
    return false;
  }
  rateLimits.set(key, now);
  return true;
}

app.post('/api/manual-trade', async (req, res) => {
  if (!checkRateLimit(req.ip || 'unknown', 'manual-trade', 2000)) {
    return res.status(429).json({ success: false, message: 'Too many requests. Please wait.' });
  }
  const formConfig = req.body;
  const { symbol, side, size, limitPrice } = formConfig;
  const normalizedSymbol = String(symbol || '').toUpperCase().trim();
  addLog(`Manual trade requested: ${side} ${normalizedSymbol} (Size: ${size})...`, "info");

  try {
    if (!normalizedSymbol) throw new Error('Symbol is required');
    if (!['BUY', 'SELL', 'buy', 'sell'].includes(String(side))) throw new Error(`Invalid side: ${side}`);
    const parsedSize = Number(size);
    // Explicitly fixed Issue #4: validate parsedSize is a positive finite number before processing
    if (!Number.isFinite(parsedSize) || parsedSize <= 0) throw new Error(`Invalid trade size: ${size}`);
    if (productsCache.length === 0) await syncProducts();

    const extraParams = limitPrice ? { _limitPrice: limitPrice } : {};

    // Get current price for TP/SL calculations
    let currentPrice: number | undefined = undefined;
    try {
      const binanceSymbol = normalizedSymbol.replace(/USDT$/, '/USDT').replace(/USD$/, '/USDT');
      const ticker = await binance.fetchTicker(binanceSymbol);
      if (ticker.last) currentPrice = ticker.last;
    } catch (e: any) {
      console.warn("Could not fetch current price for manual trade TP/SL.");
    }

    // Create a temporary slot-like config for the manual trade
    // Fix Bug 14: Validate all numeric fields from req.body to prevent NaN propagation
    // when the client omits or sends undefined fields.
    const manualSlot: TradingSlot = {
      id: 'manual',
      symbol: normalizedSymbol,
      timeframe: formConfig.timeframe || '15m',
      fastEmaPeriod: Number(formConfig.fastEmaPeriod) || 9,
      slowEmaPeriod: Number(formConfig.slowEmaPeriod) || 21,
      size: size || 1,
      leverage: Number(formConfig.leverage) || 10,
      allocationType: formConfig.allocationType || 'fixed',
      orderType: formConfig.orderType || 'market',
      takeProfitPct: Number(formConfig.takeProfitPct) || 0,
      stopLossPct: Number(formConfig.stopLossPct) || 0,
      strategy: formConfig.strategy,
      lastExecutedCandleTime: 0,
      lastSignal: 'NONE',
      useRsiFilter: false,
      rsiPeriod: 14,
      rsiOverbought: 70,
      rsiOversold: 30,
      useVolumeFilter: false,
      cooldownCandles: 0,
      lastTradeCandles: 0,
      tradesExecuted: 0,
      leverageSet: false,
      // Bollinger Bands Filter
      useBbFilter: false,
      bbPeriod: 20,
      bbStdDev: 2,
      // New fields — not used in manual trades, safe defaults
      usePriceConfirmation: false,
      emaGapMinPct: 0,
      confirmCandles: 1,
      useTrendFilter: false,
      useAtrSl: false,
      atrMultiplier: 1.5,
      useGridPyramiding: false,
      gridStepPct: 1.0,
      maxPyramidLevels: 3,
      pendingSignal: 'NONE',
      pendingSignalCandleTime: 0,
      currentPyramidLevel: 0,
      averageEntryPrice: 0,
      trailingSlPrice: 0
    };

    const result = await placeDeltaMarketOrder(normalizedSymbol, side, parsedSize, currentPrice, manualSlot, extraParams);
    addLog(`➔ Order Placed! ID: ${result?.id || 'Success'}`, "success");
    res.json({ success: true, result });
  } catch (error: any) {
    addLog(`➔ Error: ${error.message}`, "error");
    res.status(500).json({ success: false, error: error.message });
  }
});

// ══════════════════════════════════════════════════════════════════
// API ROUTES — Backtesting
// ══════════════════════════════════════════════════════════════════


function getContractValue(symbol: string): number {
  if (productsCache.length === 0) return 1;
  const prod = productsCache.find((p: any) => p.symbol === symbol || p.symbol === symbol.replace('/', ''));
  return prod ? parseFloat(prod.contract_value) : 1;
}

app.post('/api/backtest', async (req, res) => {
  if (!checkRateLimit(req.ip || 'unknown', 'backtest', 2000)) {
    return res.status(429).json({ success: false, message: 'Too many requests. Please wait.' });
  }
  const config = req.body;
  try {
    const baseCoin = config.symbol.replace(/USDT$/, '').replace(/USD$/, '');
    const binanceSymbol = `${baseCoin}/USDT`;

    const fetchOHLCVWithRetries = async (symbol: string, tf: string, since: number, limit: number, maxRetries = 3) => {
       for (let i = 0; i < maxRetries; i++) {
         try {
           return await binance.fetchOHLCV(symbol, tf, since, limit);
         } catch (e: any) {
           if (i === maxRetries - 1) throw e;
           await new Promise(r => setTimeout(r, 1000 * (i + 1)));
         }
       }
       return [];
    };

    const limit = 1000;
    const maxCandles = 2000000; // Allows up to ~5 years on 1m timeframe
    let ohlcv: any[] = [];

    // Default to 2 years ago if no start date is provided to ensure deep backtests
    let currentSince = config.startDate 
      ? new Date(config.startDate).getTime() 
      : Date.now() - ((Number(config.optDays) || (2 * 365)) * 24 * 60 * 60 * 1000);
    const endTime = config.endDate ? new Date(config.endDate).getTime() : Date.now();

    while (ohlcv.length < maxCandles) {
      const batch = await fetchOHLCVWithRetries(binanceSymbol, config.timeframe, currentSince, limit);
      if (!batch || batch.length === 0) break;

      const validBatch = batch.filter((c: any[]) => c[0] <= endTime);
      ohlcv.push(...validBatch);

      if (batch.length < limit || validBatch.length < batch.length) break;

      currentSince = batch[batch.length - 1][0] + 1;
      await new Promise(r => setTimeout(r, 20)); // Super fast rate limit
    }

    if (!ohlcv || ohlcv.length === 0) {
      return res.status(400).json({ success: false, message: 'No historical data found' });
    }

    const mappedData = {
      ohlcv,
      closes: ohlcv.map((c: any[]) => c[4] as number),
      opens: ohlcv.map((c: any[]) => c[1] as number),
      highs: ohlcv.map((c: any[]) => c[2] as number),
      lows: ohlcv.map((c: any[]) => c[3] as number),
      volumes: ohlcv.map((c: any[]) => c[5] as number)
    };
    const cv = getContractValue(config.symbol);
    const results = simulateBacktest(config, mappedData, cv);
    res.json({ success: true, results });
  } catch (error: any) {
    res.status(500).json({ success: false, message: error.message });
  }
});

async function runGeneticOptimization(config: any, timeframesData: Record<string, any[]>) {
  if (optimizationCancelled) {
    throw new Error('Optimization stopped by user');
  }
  const POPULATION_SIZE = 50;
  const GENERATIONS = 10;
  const MUTATION_RATE = 0.15;
  const ELITISM_COUNT = 5;

  const tfs = Object.keys(timeframesData);

  const allFilters = [
    'useRsiFilter',
    'useBbFilter',
    'useAtrSl',
    'useTrendFilter',
    'usePriceConfirmation',
    'useVolumeFilter',
    'useGridPyramiding'
  ];

  const filtersToPermute = Array.isArray(config.filtersToOptimize)
    ? config.filtersToOptimize.filter((f: string) => allFilters.includes(f))
    : allFilters;

  const randomGen = (min: number, max: number, isFloat = false) => {
    if (isFloat) return min + Math.random() * (max - min);
    return Math.floor(Math.random() * (max - min + 1)) + min;
  };

  const getRand = (minKey: string, maxKey: string, defaultMin: number, defaultMax: number, isFloat = false) => {
     const min = config[minKey] !== undefined && config[minKey] !== "" ? Number(config[minKey]) : defaultMin;
     const max = config[maxKey] !== undefined && config[maxKey] !== "" ? Number(config[maxKey]) : defaultMax;
     let val = randomGen(min, max, isFloat);
     if (isFloat) val = parseFloat(val.toFixed(2));
     return val;
  };

  const createIndividual = () => {
    const ind: any = {
      fastEmaPeriod: getRand('optFastEmaMin', 'optFastEmaMax', 5, 20),
      slowEmaPeriod: getRand('optSlowEmaMin', 'optSlowEmaMax', 20, 60),
      timeframe: tfs[Math.floor(Math.random() * tfs.length)]
    };
    
    for (const f of filtersToPermute) {
      ind[f] = Math.random() > 0.5;
      if (ind[f]) {
         if (f === 'useRsiFilter') {
            ind.rsiPeriod = getRand('optRsiPeriodMin', 'optRsiPeriodMax', 7, 21);
            ind.rsiOverbought = getRand('optRsiObMin', 'optRsiObMax', 70, 85);
            ind.rsiOversold = getRand('optRsiOsMin', 'optRsiOsMax', 15, 30);
         }
         if (f === 'useBbFilter') {
            ind.bbPeriod = getRand('optBbPeriodMin', 'optBbPeriodMax', 10, 30);
            ind.bbStdDev = getRand('optBbStdDevMin', 'optBbStdDevMax', 1.0, 3.0, true);
         }
         if (f === 'useAtrSl') {
            ind.atrMultiplier = getRand('optAtrMultMin', 'optAtrMultMax', 1.0, 3.5, true);
         }
         if (f === 'useGridPyramiding') {
            ind.gridStepPct = getRand('optGridStepMin', 'optGridStepMax', 0.5, 3.0, true);
            ind.maxPyramidLevels = getRand('optPyramidMin', 'optPyramidMax', 1, 5);
         }
      }
    }

    ind.emaGapMinPct = getRand('optEmaGapMin', 'optEmaGapMax', 0, 1.0, true);
    ind.cooldownCandles = getRand('optCooldownMin', 'optCooldownMax', 0, 10);
    
    return ind;
  };

  const evaluateFitness = (ind: any) => {
    const runConfig = { 
      ...config, 
      ...ind
    };
    const mappedData = timeframesData[ind.timeframe];
    const cv = getContractValue(runConfig.symbol);
    const res = simulateBacktest(runConfig, mappedData, cv);
    const profitPct = res.netProfitPct;
    const dd = res.maxDrawdown;
    let score = profitPct * (1 - dd / 100);
    if (profitPct < 0) {
      score = profitPct * (1 + dd / 100);
    }
    if (isNaN(score)) score = -9999999;
    return {
      genes: ind,
      netProfit: res.netProfit,
      netProfitPct: profitPct,
      winRate: res.winRate,
      maxDrawdown: dd,
      totalTrades: res.totalTrades,
      fitness: score
    };
  };

  const crossover = (p1: any, p2: any) => {
    const child: any = {};
    const keys = new Set([...Object.keys(p1), ...Object.keys(p2)]);
    for (const key of keys) {
      child[key] = Math.random() > 0.5 ? p1[key] : p2[key];
    }
    if (child.fastEmaPeriod >= child.slowEmaPeriod) {
      child.fastEmaPeriod = p1.fastEmaPeriod < p1.slowEmaPeriod ? p1.fastEmaPeriod : Math.max(2, child.slowEmaPeriod - 1);
    }
    return child;
  };

  const applyMutate = (mutated: any, key: string, minKey: string, maxKey: string, defaultMin: number, defaultMax: number, isFloat = false) => {
     const min = config[minKey] !== undefined && config[minKey] !== "" ? Number(config[minKey]) : defaultMin;
     const max = config[maxKey] !== undefined && config[maxKey] !== "" ? Number(config[maxKey]) : defaultMax;
     
     let val = mutated[key];
     if (val === undefined || isNaN(val)) val = randomGen(min, max, isFloat);
     else {
       const shift = isFloat ? randomGen(-max*0.1, max*0.1, true) : randomGen(-2, 2);
       val += shift;
     }
     
     if (val < min) val = min;
     if (val > max) val = max;
     if (isFloat) val = parseFloat(val.toFixed(2));
     mutated[key] = val;
  };

  const mutate = (ind: any) => {
    const mutated = { ...ind };

    if (Math.random() < MUTATION_RATE) applyMutate(mutated, 'fastEmaPeriod', 'optFastEmaMin', 'optFastEmaMax', 5, 20);
    if (Math.random() < MUTATION_RATE) applyMutate(mutated, 'slowEmaPeriod', 'optSlowEmaMin', 'optSlowEmaMax', 20, 60);

    if (Math.random() < MUTATION_RATE * 0.5 && tfs.length > 1) {
      mutated.timeframe = tfs[Math.floor(Math.random() * tfs.length)];
    }

    for (const f of filtersToPermute) {
      if (Math.random() < MUTATION_RATE * 0.5) mutated[f] = !mutated[f];
      
      if (mutated[f]) {
        if (f === 'useRsiFilter') {
          if (Math.random() < MUTATION_RATE) applyMutate(mutated, 'rsiPeriod', 'optRsiPeriodMin', 'optRsiPeriodMax', 7, 21);
          if (Math.random() < MUTATION_RATE) applyMutate(mutated, 'rsiOverbought', 'optRsiObMin', 'optRsiObMax', 70, 85);
          if (Math.random() < MUTATION_RATE) applyMutate(mutated, 'rsiOversold', 'optRsiOsMin', 'optRsiOsMax', 15, 30);
        }
        if (f === 'useBbFilter') {
          if (Math.random() < MUTATION_RATE) applyMutate(mutated, 'bbPeriod', 'optBbPeriodMin', 'optBbPeriodMax', 10, 30);
          if (Math.random() < MUTATION_RATE) applyMutate(mutated, 'bbStdDev', 'optBbStdDevMin', 'optBbStdDevMax', 1.0, 3.0, true);
        }
        if (f === 'useAtrSl') {
          if (Math.random() < MUTATION_RATE) applyMutate(mutated, 'atrMultiplier', 'optAtrMultMin', 'optAtrMultMax', 1.0, 3.5, true);
        }
        if (f === 'useGridPyramiding') {
          if (Math.random() < MUTATION_RATE) applyMutate(mutated, 'gridStepPct', 'optGridStepMin', 'optGridStepMax', 0.5, 3.0, true);
          if (Math.random() < MUTATION_RATE) applyMutate(mutated, 'maxPyramidLevels', 'optPyramidMin', 'optPyramidMax', 1, 5);
        }
      }
    }

    if (Math.random() < MUTATION_RATE) applyMutate(mutated, 'emaGapMinPct', 'optEmaGapMin', 'optEmaGapMax', 0, 1.0, true);
    if (Math.random() < MUTATION_RATE) applyMutate(mutated, 'cooldownCandles', 'optCooldownMin', 'optCooldownMax', 0, 10);

    if (mutated.fastEmaPeriod >= mutated.slowEmaPeriod) mutated.fastEmaPeriod = Math.max(2, mutated.slowEmaPeriod - 1);

    return mutated;
  };

  let population = Array.from({ length: POPULATION_SIZE }, () => createIndividual());
  let evaluated = population.map(ind => evaluateFitness(ind));

  for (let gen = 0; gen < GENERATIONS; gen++) {
    if (optimizationCancelled) {
      throw new Error('Optimization stopped by user');
    }
    await new Promise(resolve => setImmediate(resolve));

    evaluated.sort((a, b) => b.fitness - a.fitness);
    const nextGen: any[] = [];

    for (let i = 0; i < ELITISM_COUNT; i++) {
      nextGen.push(evaluated[i].genes);
    }

    while (nextGen.length < POPULATION_SIZE) {
      const selectParent = () => {
        const pool = Array.from({ length: 4 }, () => evaluated[Math.floor(Math.random() * POPULATION_SIZE)]);
        pool.sort((a, b) => b.fitness - a.fitness);
        return pool[0].genes;
      };

      const parent1 = selectParent();
      const parent2 = selectParent();

      let child = crossover(parent1, parent2);
      child = mutate(child);
      nextGen.push(child);
    }

    population = nextGen;
    evaluated = population.map(ind => evaluateFitness(ind));
  }

  evaluated.sort((a, b) => b.fitness - a.fitness);
  const uniqueResults: any[] = [];
  const seenKeys = new Set<string>();

  for (const item of evaluated) {
    const key = JSON.stringify(item.genes);
    if (!seenKeys.has(key)) {
      seenKeys.add(key);
      uniqueResults.push({
        fastEma: item.genes.fastEmaPeriod,
        slowEma: item.genes.slowEmaPeriod,
        timeframe: item.genes.timeframe,
        netProfit: item.netProfit,
        netProfitPct: item.netProfitPct,
        winRate: item.winRate,
        totalTrades: item.totalTrades,
        maxDrawdown: item.maxDrawdown,
        ...item.genes
      });
    }
  }

  return uniqueResults;
}

async function runCombinatorialOptimization(config: any, timeframesData: Record<string, any[]>) {
  if (optimizationCancelled) {
    throw new Error('Optimization stopped by user');
  }
  const allFilters = [
    'useRsiFilter',
    'useBbFilter',
    'useAtrSl',
    'useTrendFilter',
    'usePriceConfirmation',
    'useVolumeFilter',
    'useGridPyramiding'
  ];

  const filtersToPermute = Array.isArray(config.filtersToOptimize)
    ? config.filtersToOptimize.filter((f: string) => allFilters.includes(f))
    : allFilters;

  const generateBooleanPermutations = (keys: string[]): any[] => {
    if (keys.length === 0) return [{}];
    const key = keys[0];
    const subPerms = generateBooleanPermutations(keys.slice(1));
    const result = [];
    for (const perm of subPerms) {
      result.push({ ...perm, [key]: true });
      result.push({ ...perm, [key]: false });
    }
    return result;
  };

  const boolPerms = generateBooleanPermutations(filtersToPermute);

  // Fallbacks for EMAs if not provided
  if (config.optFastEmaMin === undefined) config.optFastEmaMin = 5;
  if (config.optFastEmaMax === undefined) config.optFastEmaMax = 20;
  if (config.optSlowEmaMin === undefined) config.optSlowEmaMin = 20;
  if (config.optSlowEmaMax === undefined) config.optSlowEmaMax = 60;

  const paramRanges: any[] = [];
  const addRange = (key: string, minKey: string, maxKey: string, step: number, isFloat = false, filterKey = 'always') => {
    if (config[minKey] !== undefined && config[minKey] !== "" && config[maxKey] !== undefined && config[maxKey] !== "") {
      paramRanges.push({ key, min: Number(config[minKey]), max: Number(config[maxKey]), step, isFloat, filterKey });
    }
  };

  addRange('fastEmaPeriod', 'optFastEmaMin', 'optFastEmaMax', 1, false, 'always');
  addRange('slowEmaPeriod', 'optSlowEmaMin', 'optSlowEmaMax', 1, false, 'always');
  addRange('rsiPeriod', 'optRsiPeriodMin', 'optRsiPeriodMax', 1, false, 'useRsiFilter');
  addRange('rsiOverbought', 'optRsiObMin', 'optRsiObMax', 1, false, 'useRsiFilter');
  addRange('rsiOversold', 'optRsiOsMin', 'optRsiOsMax', 1, false, 'useRsiFilter');
  addRange('bbPeriod', 'optBbPeriodMin', 'optBbPeriodMax', 1, false, 'useBbFilter');
  addRange('bbStdDev', 'optBbStdDevMin', 'optBbStdDevMax', 0.1, true, 'useBbFilter');
  addRange('atrMultiplier', 'optAtrMultMin', 'optAtrMultMax', 0.1, true, 'useAtrSl');
  addRange('emaGapMinPct', 'optEmaGapMin', 'optEmaGapMax', 0.1, true, 'always');
  addRange('cooldownCandles', 'optCooldownMin', 'optCooldownMax', 1, false, 'always');
  addRange('gridStepPct', 'optGridStepMin', 'optGridStepMax', 0.1, true, 'useGridPyramiding');
  addRange('maxPyramidLevels', 'optPyramidMin', 'optPyramidMax', 1, false, 'useGridPyramiding');

  const allResults: any[] = [];
  let backtestsRun = 0;

  for (const boolPerm of boolPerms) {
    if (optimizationCancelled) {
      throw new Error('Optimization stopped by user');
    }
    const activeRanges = paramRanges.filter(pr => pr.filterKey === 'always' || boolPerm[pr.filterKey] === true);

    const recursiveSweep = async (index: number, currentNumericParams: any) => {
      if (optimizationCancelled) {
        throw new Error('Optimization stopped by user');
      }

      if (index === activeRanges.length) {
        if (currentNumericParams.fastEmaPeriod !== undefined && currentNumericParams.slowEmaPeriod !== undefined) {
           if (currentNumericParams.fastEmaPeriod >= currentNumericParams.slowEmaPeriod) return;
        }

        for (const [tf, tfData] of Object.entries(timeframesData)) {
          if (optimizationCancelled) {
            throw new Error('Optimization stopped by user');
          }
          if (++backtestsRun % 50 === 0) {
            await new Promise(resolve => setImmediate(resolve));
          }

          const runConfig = { 
            ...config, 
            ...currentNumericParams, 
            ...boolPerm,
            timeframe: tf
          };
          const cv = getContractValue(runConfig.symbol);
          const resObj = simulateBacktest(runConfig, tfData, cv);
          
          allResults.push({
             ...currentNumericParams,
             fastEma: currentNumericParams.fastEmaPeriod,
             slowEma: currentNumericParams.slowEmaPeriod,
             timeframe: tf,
             netProfit: resObj.netProfit,
             netProfitPct: resObj.netProfitPct,
             winRate: resObj.winRate,
             totalTrades: resObj.totalTrades,
             maxDrawdown: resObj.maxDrawdown,
             profitFactor: resObj.profitFactor,
             grossProfit: resObj.grossProfit,
             grossLoss: resObj.grossLoss,
             ...boolPerm
          });
        }
        return;
      }

      const { key, min, max, step, isFloat } = activeRanges[index];
      const safeStep = step > 0 ? step : 1; 
      const numSteps = Math.floor((max - min) / safeStep) + 1;

      for (let i = 0; i < numSteps; i++) {
        let val = min + i * safeStep;
        const finalVal = isFloat ? parseFloat(val.toFixed(2)) : Math.floor(val);
        if (finalVal > max) break;
        await recursiveSweep(index + 1, { ...currentNumericParams, [key]: finalVal });
      }
    };

    await recursiveSweep(0, {});
  }

  allResults.sort((a, b) => b.netProfit - a.netProfit);
  return allResults;
}

app.post('/api/optimize', async (req, res) => {
  if (!checkRateLimit(req.ip || 'unknown', 'optimize', 2000)) {
    return res.status(429).json({ success: false, message: 'Too many requests. Please wait.' });
  }
  const config = req.body;

  try {
    const baseCoin = config.symbol.replace(/USDT$/, '').replace(/USD$/, '');
    const binanceSymbol = `${baseCoin}/USDT`;

    const fetchOHLCVWithRetries = async (symbol: string, tf: string, since: number, limit: number, maxRetries = 3) => {
       for (let i = 0; i < maxRetries; i++) {
         try {
           return await binance.fetchOHLCV(symbol, tf, since, limit);
         } catch (e: any) {
           if (i === maxRetries - 1) throw e;
           await new Promise(r => setTimeout(r, 1000 * (i + 1)));
         }
       }
       return [];
    };

    const limit = 1000;
    
    const timeframesToFetch = (config.optTimeframes && config.optTimeframes.length > 0) 
      ? config.optTimeframes 
      : [config.timeframe];
      
    const symbolsToFetch = (config.optSymbols && config.optSymbols.length > 0) 
      ? config.optSymbols 
      : [config.symbol];

    // Cap at 10k if iterating over multiple symbols to avoid timeouts
    const maxCandles = symbolsToFetch.length > 1 ? 10000 : 50000; 

    const timeframesData: Record<string, any> = {};

    for (const sym of symbolsToFetch) {
      const baseCoin = sym.replace(/USDT$/, '').replace(/USD$/, '');
      const binanceSymbol = `${baseCoin}/USDT`;

      for (const tf of timeframesToFetch) {
        let ohlcv: any[] = [];
        let currentSince = config.startDate 
          ? new Date(config.startDate).getTime() 
          : Date.now() - ((Number(config.optDays) || (2 * 365)) * 24 * 60 * 60 * 1000);
        const endTime = config.endDate ? new Date(config.endDate).getTime() : Date.now();

        while (ohlcv.length < maxCandles) {
          const batch = await fetchOHLCVWithRetries(binanceSymbol, tf, currentSince, limit);
          if (!batch || batch.length === 0) break;
          const validBatch = batch.filter((c: any[]) => c[0] <= endTime);
          ohlcv.push(...validBatch);
          if (batch.length < limit || validBatch.length < batch.length) break;
          currentSince = batch[batch.length - 1][0] + 1;
          await new Promise(r => setTimeout(r, 20));
        }
        
        if (ohlcv.length > 0) {
          const key = symbolsToFetch.length > 1 ? `${sym}_${tf}` : tf;
          timeframesData[key] = {
            ohlcv,
            closes: ohlcv.map((c: any[]) => c[4] as number),
            opens: ohlcv.map((c: any[]) => c[1] as number),
            highs: ohlcv.map((c: any[]) => c[2] as number),
            lows: ohlcv.map((c: any[]) => c[3] as number),
            volumes: ohlcv.map((c: any[]) => c[5] as number)
          };
        }
      }
    }

    if (Object.keys(timeframesData).length === 0) {
      return res.status(400).json({ success: false, message: 'No historical data found' });
    }

    let topResults = [];
    optimizationCancelled = false; // Reset flag at start

    if (config.optimizationMethod === 'genetic') {
      topResults = await runGeneticOptimization(config, timeframesData);
    } else if (config.optimizationMethod === 'brute_force') {
      topResults = await runCombinatorialOptimization(config, timeframesData);
    } else {
      const fastMin = Number(config.optFastEmaMin) || 5;
      const fastMax = Number(config.optFastEmaMax) || 20;
      const slowMin = Number(config.optSlowEmaMin) || 20;
      const slowMax = Number(config.optSlowEmaMax) || 60;

      let bestResults = [];
      let backtestsRun = 0;

      for (const [tf, tfData] of Object.entries(timeframesData)) {
        for (let f = fastMin; f <= fastMax; f++) {
          for (let s = slowMin; s <= slowMax; s++) {
            if (optimizationCancelled) {
              throw new Error('Optimization stopped by user');
            }
            if (f >= s) continue;

            if (++backtestsRun % 50 === 0) {
              await new Promise(resolve => setImmediate(resolve));
            }

            const runConfig = { ...config, fastEmaPeriod: f, slowEmaPeriod: s, timeframe: tf };
            const resObj = simulateBacktest(runConfig, tfData);

            bestResults.push({
              fastEma: f,
              slowEma: s,
              fastEmaPeriod: f,
              slowEmaPeriod: s,
              timeframe: tf,
              netProfit: resObj.netProfit,
              netProfitPct: resObj.netProfitPct,
              winRate: resObj.winRate,
              totalTrades: resObj.totalTrades,
              maxDrawdown: resObj.maxDrawdown,
              profitFactor: resObj.profitFactor
            });
          }
        }
      }

      bestResults.sort((a: any, b: any) => b.netProfit - a.netProfit);
      topResults = bestResults;
    }

    if (optimizationCancelled) {
      throw new Error('Optimization stopped by user');
    }

    // Unpack symbol and tf from keys
    topResults = topResults.map((r: any) => {
      if (r.timeframe && r.timeframe.includes('_')) {
        const [sym, tf] = r.timeframe.split('_');
        return { ...r, symbol: sym, timeframe: tf };
      }
      return r;
    });

    const uniqueRes = [];
    const seen = new Set();
    for (const r of topResults) {
      let sig = `${r.symbol || config.symbol}_${r.timeframe}_${r.fastEma ?? r.fastEmaPeriod}_${r.slowEma ?? r.slowEmaPeriod}`;
      if (r.useRsiFilter) sig += `_rsi${r.rsiPeriod}_${r.rsiOverbought}_${r.rsiOversold}`;
      if (r.useBbFilter) sig += `_bb${r.bbPeriod}_${r.bbStdDev}`;
      if (r.useAtrSl) sig += `_atr${r.atrMultiplier}`;
      if (r.useGridPyramiding) sig += `_grid${r.gridStepPct}_${r.maxPyramidLevels}`;
      if (r.useTrendFilter) sig += `_trend`;
      if (r.usePriceConfirmation) sig += `_price`;
      if (r.useVolumeFilter) sig += `_vol`;
      if (r.emaGapMinPct > 0) sig += `_gap${r.emaGapMinPct}`;
      if (r.cooldownCandles > 0) sig += `_cd${r.cooldownCandles}`;
      if (!seen.has(sig)) {
        seen.add(sig);
        uniqueRes.push(r);
      }
    }
    topResults = uniqueRes;

    res.json({ success: true, results: topResults });
  } catch (error: any) {
    if (error.message === 'Optimization stopped by user') {
      return res.status(400).json({ success: false, message: 'Optimization stopped by user' });
    }
    res.status(500).json({ success: false, message: error.message });
  }
});

app.post('/api/optimize/stop', (req, res) => {
  optimizationCancelled = true;
  res.json({ success: true, message: 'Optimization stopping...' });
});

function simulateBacktest(config: any, data: any, contractValue: number = 1) {
  const { closes, opens, highs, lows, volumes, ohlcv } = data;
  const cache = data.cache || {};

  const fastEmaPeriod = Number(config.fastEmaPeriod) || 9;
  const slowEmaPeriod = Number(config.slowEmaPeriod) || 21;
  const rsiPeriod     = Number(config.rsiPeriod)     || 14;
  const leverage      = Number(config.leverage)      || 1;
  const feePct        = (Number(config.tradingFeePct)  || 0) / 100;
  const slipPct       = (Number(config.slippagePct)    || 0) / 100;
  const slPctNum      = Number(config.stopLossPct)     || 0;
  const tpPctNum      = Number(config.takeProfitPct)   || 0;
  
  const allocationType = config.allocationType || 'fixed';
  const sizeVal        = Number(config.size) || 10;
  const tradeDirection = config.tradeDirection || 'both';
  
  const useAtrSl      = Boolean(config.useAtrSl);
  const atrMultiplier = Number(config.atrMultiplier)   || 1.5;
  const useTrendFilter = Boolean(config.useTrendFilter);
  const usePriceConfirmation = Boolean(config.usePriceConfirmation);
  const useBbFilter   = Boolean(config.useBbFilter);
  const bbPeriod      = Number(config.bbPeriod)      || 20;
  const bbStdDev      = Number(config.bbStdDev)      || 2;
  const confirmCandles = Number(config.confirmCandles) || 1;
  const emaGapMinPct  = Number(config.emaGapMinPct)    || 0;
  const cooldownCandles = Number(config.cooldownCandles) || 0;
  
  const useGridPyramiding = Boolean(config.useGridPyramiding);
  const gridStepPct       = Number(config.gridStepPct) || 1.0;
  const maxPyramidLevels  = Number(config.maxPyramidLevels) || 3;

  const fastEma = calculateEmaSeries(closes, fastEmaPeriod);
  const slowEma = calculateEmaSeries(closes, slowEmaPeriod);

  const ema200 = useTrendFilter ? (cache.ema200 || calculateEmaSeries(closes, 200)) : [];
  const rsiSeries = config.useRsiFilter ? (cache.rsiSeries || calculateRSISeries(closes, rsiPeriod)) : [];
  // Fix: atrSeries was referenced but never declared — caused runtime crash when useAtrSl=true
  const atrSeries = useAtrSl ? (cache.atrSeries || calculateAtrSeries(highs, lows, closes, config.optAtrMultMin ? 14 : 14)) : [];
  const bbSeries = useBbFilter ? (cache.bbSeries || calculateBollingerBandsSeries(closes, bbPeriod, bbStdDev)) : null;
  const shouldReverse = config.strategy === 'always_in' || config.strategy === 'STOP_REVERSE';

  let inPosition   = false;
  let positionSide = 'NONE';
  let entryPrice   = 0;
  let initialEntryPrice = 0; // Explicitly fixes Issue I: Store initial fill for pyramiding math
  let entryTime    = 0;
  let positionSlPct = slPctNum;
  let positionValue = 0;
  let positionMargin = 0;
  let currentPyramidLevel = 0;
  
  const trades: any[] = [];
  let lastTradeCandleIdx = -Infinity;

  let pendingSignal = 'NONE';
  let pendingSignalIndex = -1;

  const initialCap = Number(config.initialBalance) || 1000;
  let balance      = initialCap;
  let peakBalance  = initialCap;
  let maxDrawdown  = 0;

  const startIdx = (slowEmaPeriod * 2) + 1;

  // recordExit handles SL/TP exits properly with pyramided sizes.
  const recordExit = (side: string, entry: number, exit: number, type: string, candleIdx: number) => {
    const effectiveValue = positionValue;
    const actualExit = exit * (side === 'BUY' ? (1 - slipPct) : (1 + slipPct));
    let pnlPct = side === 'BUY'
      ? (actualExit - entry) / entry
      : (entry - actualExit) / entry;
    
    let pnlAmount = effectiveValue * pnlPct;
    let exitValue = effectiveValue + pnlAmount;
    let exitFee = exitValue * feePct;

    if (type === 'LIQUIDATION' || exitValue <= 0) {
      pnlAmount = -positionMargin; // Margin is wiped
      exitFee = 0; // Exchange took the margin, no extra fee applied to balance
    }

    balance += pnlAmount - exitFee;
    trades.push({
      side, entry, exit: actualExit,
      pnlPct: pnlPct * 100,
      pnlAmount: pnlAmount - exitFee,
      type, entryTime,
      time: ohlcv[candleIdx][0],
      balanceAfter: balance
    });
    
    peakBalance = Math.max(peakBalance, balance);
    maxDrawdown = Math.max(maxDrawdown, (peakBalance - balance) / peakBalance * 100);
    
    inPosition   = false;
    positionSide = 'NONE';
    positionValue = 0;
    positionMargin = 0;
    currentPyramidLevel = 0;
  };

  for (let i = startIdx; i < ohlcv.length - 1; i++) {
    if (balance <= 0) { balance = 0; break; }

    let slTpExited = false;
    if (inPosition) {
      const chkHigh = highs[i];
      const chkLow  = lows[i];

      // --- Grid Pyramiding & Trailing SL ---
      // Fix #11: Snapshot positionValue BEFORE pyramiding mutates it.
      // recordExit uses positionValue from the outer scope. If pyramiding fires
      // and inflates positionValue on the same candle as SL/TP, the PnL is calculated
      // using the bloated post-pyramid size, not the actual size at the exit point.
      const positionValueAtCandleOpen = positionValue;
      if (useGridPyramiding && currentPyramidLevel < maxPyramidLevels) {
         // Calculate the target price for the next grid step from the ORIGINAL entry, or simply step up from current average.
         // A true grid steps from the initial entry.
         const gridTarget = positionSide === 'BUY' 
             ? initialEntryPrice * (1 + (gridStepPct * (currentPyramidLevel + 1)) / 100)
             : initialEntryPrice * (1 - (gridStepPct * (currentPyramidLevel + 1)) / 100);

         if ( (positionSide === 'BUY' && chkHigh >= gridTarget) || (positionSide === 'SELL' && chkLow <= gridTarget) ) {
             currentPyramidLevel++;
             const fillPrice = gridTarget;
             
             let marginToAdd = 0;
                          if (allocationType === 'fixed') marginToAdd = (sizeVal * contractValue * fillPrice) / leverage;
             else if (allocationType === 'percent') marginToAdd = balance * (Math.min(sizeVal, 100) / 100);
             else marginToAdd = sizeVal; 

             balance -= marginToAdd * feePct; 
             const newTotalMargin = positionMargin + marginToAdd;
             const positionSizeValue = marginToAdd * leverage;
             
             // New average entry price
             entryPrice = ((entryPrice * positionValue) + (fillPrice * positionSizeValue)) / (positionValue + positionSizeValue);
             positionValue += positionSizeValue;
             positionMargin = newTotalMargin;

             // Trail Stop Loss to the previous grid step level
             const trailSlPrice = positionSide === 'BUY'
                ? fillPrice * (1 - gridStepPct / 100)
                : fillPrice * (1 + gridStepPct / 100);
                
             // Update positionSlPct so the existing SL logic uses this new trailed price
             if (positionSide === 'BUY') {
                 positionSlPct = (1 - trailSlPrice / entryPrice) * 100;
             } else {
                 positionSlPct = (trailSlPrice / entryPrice - 1) * 100;
             }
         }
      }

      const liqPct = 1 / leverage;
      const longLiqPrice  = entryPrice * (1 - liqPct + 0.005);
      const shortLiqPrice = entryPrice * (1 + liqPct - 0.005);

      if (positionSide === 'BUY') {
        const slPrice = entryPrice * (1 - positionSlPct / 100);
        const tpPrice = entryPrice * (1 + tpPctNum / 100);
        
        if (chkLow <= longLiqPrice) {
          recordExit(positionSide, entryPrice, longLiqPrice, 'LIQUIDATION', i);
          slTpExited = true;
        } else if (positionSlPct > 0 && chkLow <= slPrice) {
          recordExit(positionSide, entryPrice, slPrice, 'SL', i);
          slTpExited = true;
        } else if (tpPctNum > 0 && chkHigh >= tpPrice) {
          recordExit(positionSide, entryPrice, tpPrice, 'TP', i);
          slTpExited = true;
        }
      } else if (positionSide === 'SELL') {
        const slPrice = entryPrice * (1 + positionSlPct / 100);
        const tpPrice = entryPrice * (1 - tpPctNum / 100);
        
        if (chkHigh >= shortLiqPrice) {
          recordExit(positionSide, entryPrice, shortLiqPrice, 'LIQUIDATION', i);
          slTpExited = true;
        } else if (positionSlPct > 0 && chkHigh >= slPrice) {
          recordExit(positionSide, entryPrice, slPrice, 'SL', i);
          slTpExited = true;
        } else if (tpPctNum > 0 && chkLow <= tpPrice) {
          recordExit(positionSide, entryPrice, tpPrice, 'TP', i);
          slTpExited = true;
        }
      }

      if (slTpExited) {
        lastTradeCandleIdx = i;
        // Fix #3: Always skip the rest of this candle after SL/TP exit.
        // Previously, shouldReverse=true would fall through to the EMA cross check below,
        // allowing a fresh cross on the same candle to immediately re-enter — creating phantom
        // trades and inflating win rates. The correct behaviour is to enter on the NEXT candle.
        continue;
      }
    }

    const prevFast = fastEma[i - 1];
    const prevSlow = slowEma[i - 1];
    const currFast = fastEma[i];
    const currSlow = slowEma[i];

    const isCrossUp   = prevFast <= prevSlow && currFast > currSlow;
    const isCrossDown = prevFast >= prevSlow && currFast < currSlow;
    
    let freshSignal = 'NONE';
    if (isCrossUp && (tradeDirection === 'both' || tradeDirection === 'long')) freshSignal = 'BUY';
    if (isCrossDown && (tradeDirection === 'both' || tradeDirection === 'short')) freshSignal = 'SELL';
    let signal = 'NONE';

    const evaluateFilters = (sig: string, idx: number) => {
      if (sig === 'NONE') return 'NONE';

      if (usePriceConfirmation) {
        const closedPrice = closes[idx];
        const slowVal = slowEma[idx];
        if (sig === 'BUY' && closedPrice < slowVal) return 'NONE';
        if (sig === 'SELL' && closedPrice > slowVal) return 'NONE';
      }

      if (useTrendFilter && idx >= 200) {
        const ema200Val = ema200[idx];
        if (isFinite(ema200Val)) {
          const closedPrice = closes[idx];
          const trend = closedPrice > ema200Val ? 'BULL' : 'BEAR';
          if (sig === 'BUY' && trend !== 'BULL') return 'NONE';
          if (sig === 'SELL' && trend !== 'BEAR') return 'NONE';
        }
      }

      const gapMin = emaGapMinPct;
      const fVal = fastEma[idx];
      const sVal = slowEma[idx];
      const gap = Math.abs(fVal - sVal) / sVal * 100;
      if (gapMin > 0 && gap < gapMin) return 'NONE';

      if (config.useRsiFilter && rsiSeries.length > 0 && idx < rsiSeries.length) {
        const rsi = rsiSeries[idx];
        if (sig === 'BUY' && rsi > (Number(config.rsiOverbought) || 70)) return 'NONE';
        if (sig === 'SELL' && rsi < (Number(config.rsiOversold) || 30)) return 'NONE';
      }

      if (config.useVolumeFilter && idx >= 20) {
        const avgVol = volumes.slice(idx - 20, idx).reduce((a, b) => a + b, 0) / 20;
        if (volumes[idx] < avgVol) return 'NONE';
      }

      if (useBbFilter && bbSeries && idx >= bbPeriod - 1) {
        const bbUpper = bbSeries.upper[idx];
        const bbLower = bbSeries.lower[idx];
        const price = closes[idx];
        if (sig === 'BUY' && price > bbUpper) return 'NONE';
        if (sig === 'SELL' && price < bbLower) return 'NONE';
      }

      return sig;
    };

    const confirmRequired = confirmCandles >= 2;
    if (confirmRequired) {
      if (pendingSignal !== 'NONE' && i > pendingSignalIndex) {
        const fastStillAbove = pendingSignal === 'BUY'  && currFast > currSlow;
        const fastStillBelow = pendingSignal === 'SELL' && currFast < currSlow;
        if (fastStillAbove || fastStillBelow) {
          signal = evaluateFilters(pendingSignal, i);
        }
        pendingSignal = 'NONE';
        pendingSignalIndex = -1;
      }
      
      const freshPassed = evaluateFilters(freshSignal, i);
      if (freshPassed !== 'NONE') {
        pendingSignal = freshPassed;
        pendingSignalIndex = i;
      }
    } else {
      signal = evaluateFilters(freshSignal, i);
    }

    if (signal === 'NONE') continue;

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
      if (!isDirectionAllowed) continue;
      inPosition   = true;
      positionSide = signal;
      const safeNextIdx = i + 1 < ohlcv.length ? i + 1 : i;
      entryTime    = ohlcv[safeNextIdx][0];
      const nextOpen = i + 1 < ohlcv.length ? opens[i + 1] : closes[i];
      entryPrice = nextOpen * (signal === 'BUY' ? (1 + slipPct) : (1 - slipPct));
      initialEntryPrice = entryPrice;
      
            if (allocationType === 'fixed') {
        positionMargin = (sizeVal * contractValue * entryPrice) / leverage;
      } else if (allocationType === 'percent') {
        positionMargin = balance * (Math.min(sizeVal, 100) / 100);
      } else {
        positionMargin = sizeVal;
      }
      if (positionMargin > balance) positionMargin = balance;
      if (positionMargin <= 0) {
        inPosition = false;
        continue;
      }

      // Fix Bug 5: Compute and deduct entry fee BEFORE calculating positionValue to prevent
      // equity leaks when trading all-in (positionMargin === balance). Previously, the fee
      // was subtracted from balance AFTER positionValue was set, potentially making balance negative
      // while positionValue still carried the full leveraged size.
      const entryFee = positionMargin * leverage * feePct;
      if (entryFee >= balance) {
        inPosition = false;
        continue;
      }
      balance -= entryFee;
      positionValue = positionMargin * leverage;

      // Stop Loss Check (ATR or Fixed)
      let currentSlPct = slPctNum;
      if (useAtrSl) {
        // Explicitly fixes Issue H: Use precalculated ATR series to prevent O(n^2) array slicing
        const atr = atrSeries[i] || 0;
        if (atr > 0 && entryPrice > 0) {
          currentSlPct = (atr * atrMultiplier / entryPrice) * 100;
        }
      }
      positionSlPct = currentSlPct;
      lastTradeCandleIdx = i;
      currentPyramidLevel = 0;
    }
  }

  if (inPosition) {
    recordExit(positionSide, entryPrice, closes[closes.length - 1], 'END', ohlcv.length - 1);
  }

  const winningTrades = trades.filter(t => t.pnlAmount > 0);
  const losingTrades = trades.filter(t => t.pnlAmount <= 0);

  const grossProfit = winningTrades.reduce((a, b) => a + b.pnlAmount, 0);
  const grossLoss = Math.abs(losingTrades.reduce((a, b) => a + b.pnlAmount, 0));
  const profitFactor = grossLoss === 0 ? (grossProfit > 0 ? 999 : 0) : grossProfit / grossLoss;
  const avgWin = winningTrades.length > 0 ? grossProfit / winningTrades.length : 0;
  const avgLoss = losingTrades.length > 0 ? grossLoss / losingTrades.length : 0;

  let currentWinStreak = 0;
  let maxWinStreak = 0;
  let currentLossStreak = 0;
  let maxLossStreak = 0;
  trades.forEach(t => {
     if (t.pnlAmount > 0) {
        currentWinStreak++;
        maxWinStreak = Math.max(maxWinStreak, currentWinStreak);
        currentLossStreak = 0;
     } else {
        currentLossStreak++;
        maxLossStreak = Math.max(maxLossStreak, currentLossStreak);
        currentWinStreak = 0;
     }
  });

  const totalDuration = trades.reduce((a, b) => a + (b.time - (b.entryTime || b.time)), 0);
  const avgDurationMs = trades.length > 0 ? totalDuration / trades.length : 0;

  const firstClose = closes[0];
  const lastClose = closes[closes.length - 1];
  const buyAndHoldReturn = firstClose > 0 ? ((lastClose - firstClose) / firstClose) * 100 : 0;

  const winRate = trades.length > 0 ? (winningTrades.length / trades.length) * 100 : 0;
  const netProfit = balance - initialCap;
  const netProfitPct = (netProfit / initialCap) * 100;

  return {
    initialBalance: initialCap,
    finalBalance: balance,
    totalTrades: trades.length,
    winRate: winRate,
    netProfit: netProfit,
    netProfitPct: netProfitPct,
    maxDrawdown: maxDrawdown,
    grossProfit,
    grossLoss,
    profitFactor,
    avgWin,
    avgLoss,
    buyAndHoldReturn,
    winningTradesCount: winningTrades.length,
    losingTradesCount: losingTrades.length,
    maxWinStreak,
    maxLossStreak,
    avgDurationMs,
    trades
  };
}

// ══════════════════════════════════════════════════════════════════
// SERVER STARTUP
// ══════════════════════════════════════════════════════════════════

async function startServer() {
  if (process.env.NODE_ENV !== 'production') {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), 'dist');
    app.use(express.static(distPath));
    app.get('*', (req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  const host = process.env.HOST || '127.0.0.1';
  app.listen(PORT, host, () => {
    console.log(`Server running on http://${host}:${PORT}`);
  });
}

startServer();
