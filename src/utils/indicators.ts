export const calculateEmaSeries = (prices: number[], period: number): number[] => {
  const k = 2 / (period + 1);
  if (prices.length < period) return prices.map(() => prices[0] || 0);
  const seed = prices.slice(0, period).reduce((a, b) => a + b, 0) / period;
  const ema: number[] = new Array(period).fill(seed);
  for (let i = period; i < prices.length; i++) {
    ema.push(prices[i] * k + ema[i - 1] * (1 - k));
  }
  return ema;
};

export function calculateRSI(closes: number[], period: number = 14): number {
  if (closes.length < period + 1) return 50;

  let avgGain = 0;
  let avgLoss = 0;

  for (let i = 1; i <= period; i++) {
    const change = closes[i] - closes[i - 1];
    if (change > 0) avgGain += change;
    else avgLoss += Math.abs(change);
  }
  avgGain /= period;
  avgLoss /= period;

  for (let i = period + 1; i < closes.length; i++) {
    const change = closes[i] - closes[i - 1];
    if (change > 0) {
      avgGain = (avgGain * (period - 1) + change) / period;
      avgLoss = (avgLoss * (period - 1)) / period;
    } else {
      avgGain = (avgGain * (period - 1)) / period;
      avgLoss = (avgLoss * (period - 1) + Math.abs(change)) / period;
    }
  }

  if (avgLoss === 0) return 100;
  const rs = avgGain / avgLoss;
  return 100 - (100 / (1 + rs));
}

export function calculateRSISeries(closes: number[], period: number = 14): number[] {
  const rsiArr: number[] = new Array(closes.length).fill(50);
  if (closes.length < period + 1) return rsiArr;

  let avgGain = 0;
  let avgLoss = 0;

  for (let i = 1; i <= period; i++) {
    const change = closes[i] - closes[i - 1];
    if (change > 0) avgGain += change;
    else avgLoss += Math.abs(change);
  }
  avgGain /= period;
  avgLoss /= period;

  rsiArr[period] = avgLoss === 0 ? 100 : 100 - (100 / (1 + avgGain / avgLoss));

  for (let i = period + 1; i < closes.length; i++) {
    const change = closes[i] - closes[i - 1];
    if (change > 0) {
      avgGain = (avgGain * (period - 1) + change) / period;
      avgLoss = (avgLoss * (period - 1)) / period;
    } else {
      avgGain = (avgGain * (period - 1)) / period;
      avgLoss = (avgLoss * (period - 1) + Math.abs(change)) / period;
    }
    rsiArr[i] = avgLoss === 0 ? 100 : 100 - (100 / (1 + avgGain / avgLoss));
  }

  return rsiArr;
}

export function calculateBollingerBands(closes: number[], period: number = 20, stdDev: number = 2) {
  if (closes.length < period) return { upper: 0, lower: 0, sma: 0 };
  const slice = closes.slice(-period);
  const sma = slice.reduce((a, b) => a + b, 0) / period;
  const variance = slice.reduce((a, b) => a + Math.pow(b - sma, 2), 0) / period;
  const std = Math.sqrt(variance);
  return {
    upper: sma + (std * stdDev),
    lower: sma - (std * stdDev),
    sma
  };
}

export function calculateBollingerBandsSeries(closes: number[], period: number = 20, stdDev: number = 2) {
  const upper = new Array(closes.length).fill(0);
  const lower = new Array(closes.length).fill(0);
  const sma = new Array(closes.length).fill(0);

  if (closes.length < period) return { upper, lower, sma };

  let sum = 0;
  let sumSq = 0;

  for (let i = 0; i < period; i++) {
    const val = closes[i];
    sum += val;
    sumSq += val * val;
  }

  const firstSma = sum / period;
  const firstVar = (sumSq - (sum * sum) / period) / period;
  const firstStd = Math.sqrt(Math.max(0, firstVar));
  upper[period - 1] = firstSma + firstStd * stdDev;
  lower[period - 1] = firstSma - firstStd * stdDev;
  sma[period - 1] = firstSma;

  for (let i = period; i < closes.length; i++) {
    const outgoing = closes[i - period];
    const incoming = closes[i];

    sum += incoming - outgoing;
    sumSq += incoming * incoming - outgoing * outgoing;

    const currentSma = sum / period;
    const currentVar = (sumSq - (sum * sum) / period) / period;
    const currentStd = Math.sqrt(Math.max(0, currentVar));

    upper[i] = currentSma + currentStd * stdDev;
    lower[i] = currentSma - currentStd * stdDev;
    sma[i] = currentSma;
  }

  return { upper, lower, sma };
}

export function calculateMACD(closes: number[], fast: number = 12, slow: number = 26, signalPeriod: number = 9) {
  const fastEma = calculateEmaSeries(closes, fast);
  const slowEma = calculateEmaSeries(closes, slow);
  const macdLine = fastEma.map((f, i) => f - slowEma[i]);
  const signalLine = calculateEmaSeries(macdLine, signalPeriod);
  const histogram = macdLine.map((m, i) => m - signalLine[i]);
  return {
    macdLine: macdLine[macdLine.length - 1],
    signalLine: signalLine[signalLine.length - 1],
    histogram: histogram[histogram.length - 1]
  };
}

export function calculateATR(highs: number[], lows: number[], closes: number[], period: number = 14) {
  if (closes.length < period + 1) return 0;
  
  let trSum = 0;
  for (let i = 1; i <= period; i++) {
    const tr = Math.max(
      highs[i] - lows[i],
      Math.abs(highs[i] - closes[i - 1]),
      Math.abs(lows[i] - closes[i - 1])
    );
    trSum += tr;
  }
  let atr = trSum / period;

  for (let i = period + 1; i < closes.length; i++) {
    const tr = Math.max(
      highs[i] - lows[i],
      Math.abs(highs[i] - closes[i - 1]),
      Math.abs(lows[i] - closes[i - 1])
    );
    atr = (atr * (period - 1) + tr) / period;
  }
  
  return atr;
}

export function calculateAtrSeries(highs: number[], lows: number[], closes: number[], period: number = 14): number[] {
  const result: number[] = new Array(closes.length).fill(0);
  if (closes.length < period + 1) return result;
  
  let trSum = 0;
  for (let i = 1; i <= period; i++) {
    const tr = Math.max(
      highs[i] - lows[i],
      Math.abs(highs[i] - closes[i - 1]),
      Math.abs(lows[i] - closes[i - 1])
    );
    trSum += tr;
  }
  let atr = trSum / period;
  result[period] = atr;

  for (let i = period + 1; i < closes.length; i++) {
    const tr = Math.max(
      highs[i] - lows[i],
      Math.abs(highs[i] - closes[i - 1]),
      Math.abs(lows[i] - closes[i - 1])
    );
    atr = (atr * (period - 1) + tr) / period;
    result[i] = atr;
  }
  return result;
}
export function isVolumeAboveAverage(ohlcv: any[], lookback: number = 20): boolean {
  if (ohlcv.length < lookback + 2) return true;
  const closedIdx = ohlcv.length - 2;
  const currentVolume = ohlcv[closedIdx][5] as number;
  let totalVolume = 0;
  for (let i = closedIdx - lookback; i < closedIdx; i++) {
    totalVolume += ohlcv[i][5] as number;
  }
  const avgVolume = totalVolume / lookback;
  return currentVolume >= avgVolume;
}
