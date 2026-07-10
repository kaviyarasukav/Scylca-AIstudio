import axios from 'axios';
import crypto from 'crypto';
import dotenv from 'dotenv';

dotenv.config();

export class DeltaClient {
  private baseUrl: string;
  private timeOffset: number = 0;
  private timeSynced: boolean = false;

  constructor() {
    this.baseUrl = process.env.DELTA_BASE_URL || 'https://api.india.delta.exchange';
  }

  resetTimeSync() {
    this.timeOffset = 0;
    this.timeSynced = false;
  }

  async syncTime() {
    // Explicitly verified Issue #8: No longer calling /v2/products (CDN endpoint).
    // We rely on the signature expiration auto-retry mechanism 
    // to obtain the accurate server_time directly from the engine, avoiding CDN cached times.
    this.timeSynced = true;
  }

  private getAuthHeaders(method: string, path: string, queryString: string, payloadStr: string) {
    const apiKey = process.env.DELTA_KEY;
    const apiSecret = process.env.DELTA_SECRET;

    if (!apiKey || !apiSecret) {
      throw new Error('Missing Delta API credentials (DELTA_KEY, DELTA_SECRET)');
    }

    const timestamp = (Math.floor(Date.now() / 1000) + this.timeOffset).toString();
    const signatureData = method.toUpperCase() + timestamp + path + queryString + payloadStr;
    const signature = crypto.createHmac('sha256', apiSecret).update(signatureData).digest('hex');

    return {
      'api-key': apiKey,
      'timestamp': timestamp,
      'signature': signature,
      'User-Agent': 'nodejs-bot',
      'Content-Type': 'application/json',
      'Accept': 'application/json'
    };
  }

  private async makeRequest(method: string, path: string, queryParams: any = {}, payload: any = {}, isPrivate: boolean = true) {
    if (isPrivate && !this.timeSynced) {
      await this.syncTime();
    }

    const payloadStr = Object.keys(payload).length > 0 ? JSON.stringify(payload) : '';
    const queryString = Object.keys(queryParams).length > 0
      ? '?' + new URLSearchParams(queryParams).toString()
      : '';
    const url = `${this.baseUrl}${path}${queryString}`;

    const MAX_RETRIES = 3;
    let attempt = 0;

    while (attempt <= MAX_RETRIES) {
      let headers: any = {
        'User-Agent': 'nodejs-bot',
        'Content-Type': 'application/json',
        'Accept': 'application/json'
      };

      if (isPrivate) {
        headers = this.getAuthHeaders(method, path, queryString, payloadStr);
      }

      try {
        const response = await axios({
          method,
          url,
          data: Object.keys(payload).length > 0 ? payload : undefined,
          headers,
          timeout: 10000
        });
        if (response.data && response.data.success === false) {
          throw new Error(response.data.error?.message || JSON.stringify(response.data));
        }
        return response.data;
      } catch (error: any) {
        let isTransient = false;
        
        if (error.response && error.response.data) {
          const errData = error.response.data;
          
          if (isPrivate && errData.error && errData.error.code === 'expired_signature' && errData.error.context) {
            const reqTime = errData.error.context.request_time;
            const svrTime = errData.error.context.server_time;
            if (reqTime && svrTime) {
              const newOffset = svrTime - Math.floor(Date.now() / 1000);
              if (Math.abs(newOffset - this.timeOffset) > 2) {
                const oldOffset = this.timeOffset;
                this.timeOffset = newOffset;
                this.timeSynced = true;
                console.log(`[DeltaClient] Detected signature expiration. Automatically adjusted server offset to ${this.timeOffset}s (shift: ${this.timeOffset - oldOffset}s)`);
              }
              if (attempt < MAX_RETRIES) {
                attempt++;
                continue; 
              } else {
                throw new Error(`[DeltaClient] API Request failed after ${MAX_RETRIES} retries due to signature expiration.`);
              }
            }
          }
          
          if (error.response.status >= 500 || error.response.status === 429) {
            isTransient = true;
          } else {
            throw new Error(JSON.stringify(errData));
          }
        } else {
          isTransient = true;
        }

        if (isTransient) {
          if (attempt < MAX_RETRIES) {
            attempt++;
            const backoff = Math.pow(2, attempt) * 500;
            console.warn(`[DeltaClient] Transient API error (${error.message}). Retrying ${attempt}/${MAX_RETRIES} in ${backoff}ms...`);
            await new Promise(resolve => setTimeout(resolve, backoff));
            continue;
          } else {
            throw new Error(`[DeltaClient] API Request failed after ${MAX_RETRIES} retries: ${error.message}`);
          }
        }
        
        throw error;
      }
    }
  }

  async getProducts() {
    return await this.makeRequest('GET', '/v2/products', {}, {}, false);
  }

  async getBalances() {
    return await this.makeRequest('GET', '/v2/wallet/balances');
  }

  async getPositions() {
    return await this.makeRequest('GET', '/v2/positions/margined');
  }

  async getProfile() {
    return await this.makeRequest('GET', '/v2/profile');
  }

  async getTicker(symbol: string) {
    return await this.makeRequest('GET', `/v2/tickers/${symbol}`, {}, {}, false);
  }

  async getHistoricalCandles(symbol: string, resolution: string, start: string, end: string) {
    const params = { symbol, resolution, start, end };
    return await this.makeRequest('GET', '/v2/history/candles', params, {}, false);
  }
  
  // NOTE: /v2/settings does not exist. Server time is obtained from the profile endpoint.

  async placeOrder(productId: number, size: number, side: 'buy' | 'sell', orderType: 'market_order' | 'limit_order' = 'market_order', extraParams: any = {}) {
    const payload = {
      product_id: productId,
      size: size,
      side: side.toLowerCase(),
      order_type: orderType,
      ...extraParams
    };
    return await this.makeRequest('POST', '/v2/orders', {}, payload);
  }

  /**
   * Places a bracket (TP/SL) order for an existing position.
   * Body must follow Delta's CreateBracketOrderRequest schema with
   * nested take_profit_order and/or stop_loss_order objects.
   * Endpoint: POST /v2/orders/bracket
   */
  async placeBracketOrder(payload: {
    product_id: number;
    product_symbol?: string;
    take_profit_order?: { order_type: string; stop_price: string; limit_price?: string };
    stop_loss_order?: { order_type: string; stop_price: string; limit_price?: string; trail_amount?: string };
  }) {
    return await this.makeRequest('POST', '/v2/orders/bracket', {}, payload);
  }

  /**
   * Sets leverage for a specific product.
   * Must be called before placing orders to ensure correct margin usage.
   * Endpoint: POST /v2/products/{product_id}/orders/leverage
   */
  async setLeverage(productId: number, leverage: number) {
    const payload = { leverage: String(leverage) };
    return await this.makeRequest('POST', `/v2/products/${productId}/orders/leverage`, {}, payload);
  }

  /**
   * Trade execution verification foundation logic.
   * Fetches an order by ID to confirm state (e.g. open, closed, cancelled) 
   * and verify fill precision matching API requests.
   */
  async verifyOrderExecution(orderId: string | number) {
    return await this.makeRequest('GET', `/v2/orders/${orderId}`);
  }
}

// Global instance to replace CCXT Delta
export const deltaClient = new DeltaClient();
