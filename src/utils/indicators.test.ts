import { describe, it, expect } from 'vitest';
import { calculateEmaSeries, calculateRSI, calculateRSISeries, calculateBollingerBands, calculateBollingerBandsSeries, calculateATR, calculateAtrSeries } from './indicators';

describe('Indicators', () => {
  it('calculateEmaSeries should compute correct EMA', () => {
    const prices = [10, 10, 10, 10, 10, 12, 14, 16];
    const period = 5;
    const ema = calculateEmaSeries(prices, period);
    expect(ema).toBeDefined();
    expect(ema.length).toBe(prices.length);
    // Seed should be avg of first 5 prices (10)
    expect(ema[4]).toBeCloseTo(10);
    // Next element (prices[5] = 12)
    // k = 2 / (5 + 1) = 0.3333
    // ema[5] = 12 * 0.333 + 10 * 0.666 = 4 + 6.666 = 10.666
    expect(ema[5]).toBeCloseTo(10.666, 2);
  });

  it('calculateRSI should compute RSI correctly', () => {
    // 15 days of prices
    const closes = [44.34, 44.09, 44.15, 43.61, 44.33, 44.83, 45.10, 45.42, 45.84, 46.08, 45.89, 46.03, 45.61, 46.28, 46.28];
    const rsi = calculateRSI(closes, 14);
    expect(rsi).toBeGreaterThan(0);
    expect(rsi).toBeLessThan(100);
    expect(rsi).toBeCloseTo(70.46, 1);
  });

  it('calculateRSISeries should compute RSI series correctly', () => {
    const closes = [44.34, 44.09, 44.15, 43.61, 44.33, 44.83, 45.10, 45.42, 45.84, 46.08, 45.89, 46.03, 45.61, 46.28, 46.28, 46.00];
    const series = calculateRSISeries(closes, 14);
    expect(series.length).toBe(closes.length);
    expect(series[14]).toBeCloseTo(70.46, 1);
    expect(series[15]).toBeLessThan(70.46); // dropped price
  });

  it('calculateBollingerBands should compute correctly', () => {
    const closes = [10, 11, 12, 11, 10, 9, 8, 9, 10, 11, 12, 11, 10, 9, 8, 9, 10, 11, 12, 11]; // 20 prices
    const bb = calculateBollingerBands(closes, 20, 2);
    expect(bb.sma).toBeCloseTo(10.2, 2);
    expect(bb.upper).toBeGreaterThan(bb.sma);
    expect(bb.lower).toBeLessThan(bb.sma);
  });
  
  it('calculateATR should compute correctly', () => {
    const highs = [12, 13, 14, 13, 12];
    const lows = [10, 11, 12, 11, 10];
    const closes = [11, 12, 13, 12, 11];
    // period 4
    const atr = calculateATR(highs, lows, closes, 4);
    expect(atr).toBeGreaterThan(0);
  });
});
