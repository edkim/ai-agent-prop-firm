/**
 * TradeStation API Service
 * Handles authentication, order placement, and position management
 * Documentation: https://api.tradestation.com/docs/fundamentals/authentication/auth-overview
 */

import axios, { AxiosInstance } from 'axios';
import qs from 'qs';
import { getDatabase } from '../database/db';
import logger from './logger.service';

const TRADESTATION_API_KEY = process.env.TRADESTATION_API_KEY;
const TRADESTATION_API_SECRET = process.env.TRADESTATION_API_SECRET;
const TRADESTATION_REDIRECT_URI = process.env.TRADESTATION_REDIRECT_URI || 'http://localhost:3000/auth/callback';
const TRADESTATION_ACCOUNT_ID = process.env.TRADESTATION_ACCOUNT_ID;

// TradeStation API endpoints
const API_BASE_URL = process.env.TRADESTATION_ENV === 'live'
  ? 'https://api.tradestation.com/v3'
  : 'https://sim-api.tradestation.com/v3'; // Paper trading (simulation)

const AUTH_BASE_URL = process.env.TRADESTATION_ENV === 'live'
  ? 'https://signin.tradestation.com'
  : 'https://sim-signin.tradestation.com'; // Paper trading auth

interface AuthTokens {
  access_token: string;
  refresh_token: string;
  expires_in: number;
  expires_at: number;
}

interface Account {
  accountId: string;
  name: string;
  type: string;
  cash: number;
  equity: number;
  buyingPower: number;
}

interface Position {
  symbol: string;
  quantity: number;
  averagePrice: number;
  currentPrice: number;
  marketValue: number;
  unrealizedPnL: number;
  unrealizedPnLPercent: number;
}

interface Order {
  orderId: string;
  symbol: string;
  side: 'Buy' | 'Sell' | 'SellShort' | 'BuyToCover';
  orderType: 'Market' | 'Limit' | 'Stop' | 'StopLimit';
  quantity: number;
  limitPrice?: number;
  stopPrice?: number;
  status: string;
  filledQuantity: number;
  averageFillPrice?: number;
  submittedTime: string;
  filledTime?: string;
}

interface PlaceOrderRequest {
  symbol: string;
  side: 'Buy' | 'Sell' | 'SellShort' | 'BuyToCover';
  orderType: 'Market' | 'Limit' | 'Stop' | 'StopLimit';
  quantity: number;
  limitPrice?: number;
  stopPrice?: number;
  timeInForce?: 'DAY' | 'GTC' | 'IOC';
}

class TradestationService {
  private apiClient: AxiosInstance;
  private tokens: AuthTokens | null = null;
  private tokenRefreshTimer: NodeJS.Timeout | null = null;

  constructor() {
    this.apiClient = axios.create({
      baseURL: API_BASE_URL,
      headers: {
        'Content-Type': 'application/json'
      }
    });

    // Add request interceptor to inject access token
    this.apiClient.interceptors.request.use(
      async (config) => {
        await this.ensureValidToken();

        if (this.tokens?.access_token) {
          config.headers.Authorization = `Bearer ${this.tokens.access_token}`;
        }

        return config;
      },
      (error) => Promise.reject(error)
    );

    // Load tokens from database if available
    this.loadTokensFromDatabase();
  }

  /**
   * Get OAuth authorization URL
   */
  getAuthorizationUrl(state: string): string {
    if (!TRADESTATION_API_KEY) {
      throw new Error('TRADESTATION_API_KEY not configured');
    }

    const params = new URLSearchParams({
      response_type: 'code',
      client_id: TRADESTATION_API_KEY,
      redirect_uri: TRADESTATION_REDIRECT_URI,
      scope: 'openid profile MarketData ReadAccount Trade',
      state
    });

    const authUrl = `${AUTH_BASE_URL}/authorize?${params.toString()}`;

    logger.info('📝 Generated TradeStation authorization URL');
    logger.info(`   Redirect URI: ${TRADESTATION_REDIRECT_URI}`);
    logger.info(`   State: ${state}`);

    return authUrl;
  }

  /**
   * Exchange authorization code for access token
   */
  async authenticate(authorizationCode: string): Promise<void> {
    if (!TRADESTATION_API_KEY || !TRADESTATION_API_SECRET) {
      throw new Error('TradeStation API credentials not configured');
    }

    try {
      logger.info('🔐 Authenticating with TradeStation...');

      const response = await axios.post(
        `${AUTH_BASE_URL}/oauth/token`,
        qs.stringify({
          grant_type: 'authorization_code',
          code: authorizationCode,
          client_id: TRADESTATION_API_KEY,
          client_secret: TRADESTATION_API_SECRET,
          redirect_uri: TRADESTATION_REDIRECT_URI
        }),
        {
          headers: {
            'Content-Type': 'application/x-www-form-urlencoded'
          }
        }
      );

      this.tokens = {
        access_token: response.data.access_token,
        refresh_token: response.data.refresh_token,
        expires_in: response.data.expires_in,
        expires_at: Date.now() + (response.data.expires_in * 1000)
      };

      // Save tokens to database
      this.saveTokensToDatabase();

      // Schedule token refresh
      this.scheduleTokenRefresh();

      logger.info('✅ TradeStation authentication successful');

    } catch (error: any) {
      logger.error('❌ TradeStation authentication failed:', error.response?.data || error.message);
      throw new Error(`Authentication failed: ${error.response?.data?.error_description || error.message}`);
    }
  }

  /**
   * Refresh access token using refresh token
   */
  async refreshAccessToken(): Promise<void> {
    if (!this.tokens?.refresh_token) {
      throw new Error('No refresh token available');
    }

    if (!TRADESTATION_API_KEY || !TRADESTATION_API_SECRET) {
      throw new Error('TradeStation API credentials not configured');
    }

    try {
      logger.info('🔄 Refreshing TradeStation access token...');

      const response = await axios.post(
        `${AUTH_BASE_URL}/oauth/token`,
        qs.stringify({
          grant_type: 'refresh_token',
          refresh_token: this.tokens.refresh_token,
          client_id: TRADESTATION_API_KEY,
          client_secret: TRADESTATION_API_SECRET
        }),
        {
          headers: {
            'Content-Type': 'application/x-www-form-urlencoded'
          }
        }
      );

      this.tokens = {
        access_token: response.data.access_token,
        refresh_token: response.data.refresh_token || this.tokens.refresh_token,
        expires_in: response.data.expires_in,
        expires_at: Date.now() + (response.data.expires_in * 1000)
      };

      this.saveTokensToDatabase();
      this.scheduleTokenRefresh();

      logger.info('✅ Access token refreshed');

    } catch (error: any) {
      logger.error('❌ Token refresh failed:', error.response?.data || error.message);
      this.tokens = null;
      throw new Error(`Token refresh failed: ${error.response?.data?.error_description || error.message}`);
    }
  }

  /**
   * Ensure we have a valid access token
   */
  private async ensureValidToken(): Promise<void> {
    if (!this.tokens) {
      throw new Error('Not authenticated. Call authenticate() first.');
    }

    // Check if token is expired or will expire in next 5 minutes
    const now = Date.now();
    const bufferTime = 5 * 60 * 1000; // 5 minutes

    if (this.tokens.expires_at - now < bufferTime) {
      await this.refreshAccessToken();
    }
  }

  /**
   * Schedule automatic token refresh
   */
  private scheduleTokenRefresh(): void {
    if (this.tokenRefreshTimer) {
      clearTimeout(this.tokenRefreshTimer);
    }

    if (!this.tokens) return;

    // Refresh 10 minutes before expiry
    const refreshIn = this.tokens.expires_in * 1000 - (10 * 60 * 1000);

    this.tokenRefreshTimer = setTimeout(() => {
      this.refreshAccessToken().catch(error => {
        logger.error('Automatic token refresh failed:', error);
      });
    }, refreshIn);

    logger.info(`🕒 Token refresh scheduled in ${Math.round(refreshIn / 1000 / 60)} minutes`);
  }

  /**
   * Save tokens to database
   */
  private saveTokensToDatabase(): void {
    if (!this.tokens) return;

    try {
      const db = getDatabase();

      db.prepare(`
        INSERT OR REPLACE INTO app_config (key, value, updated_at)
        VALUES ('tradestation_tokens', ?, CURRENT_TIMESTAMP)
      `).run(JSON.stringify(this.tokens));

    } catch (error: any) {
      logger.error('Failed to save tokens to database:', error);
    }
  }

  /**
   * Load tokens from database
   */
  private loadTokensFromDatabase(): void {
    try {
      const db = getDatabase();

      // Create app_config table if it doesn't exist
      db.prepare(`
        CREATE TABLE IF NOT EXISTS app_config (
          key TEXT PRIMARY KEY,
          value TEXT NOT NULL,
          updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
        )
      `).run();

      const row = db.prepare(`
        SELECT value FROM app_config WHERE key = 'tradestation_tokens'
      `).get() as { value: string } | undefined;

      if (row) {
        this.tokens = JSON.parse(row.value);

        // Check if token is still valid
        if (this.tokens && this.tokens.expires_at > Date.now()) {
          logger.info('✅ Loaded valid TradeStation tokens from database');
          this.scheduleTokenRefresh();
        } else {
          logger.info('⚠️ Stored tokens are expired');
          this.tokens = null;
        }
      }

    } catch (error: any) {
      logger.error('Failed to load tokens from database:', error);
    }
  }

  /**
   * Get account information
   */
  async getAccount(): Promise<Account> {
    try {
      const accountId = TRADESTATION_ACCOUNT_ID;

      if (!accountId) {
        throw new Error('TRADESTATION_ACCOUNT_ID not configured');
      }

      const response = await this.apiClient.get(`/brokerage/accounts/${accountId}`);

      const data = response.data;

      return {
        accountId: data.AccountID,
        name: data.Name,
        type: data.Type,
        cash: data.Cash || 0,
        equity: data.Equity || 0,
        buyingPower: data.BuyingPower || 0
      };

    } catch (error: any) {
      logger.error('Failed to get account info:', error.response?.data || error.message);
      throw error;
    }
  }

  /**
   * Get current positions
   */
  async getPositions(): Promise<Position[]> {
    try {
      const accountId = TRADESTATION_ACCOUNT_ID;

      if (!accountId) {
        throw new Error('TRADESTATION_ACCOUNT_ID not configured');
      }

      const response = await this.apiClient.get(`/brokerage/accounts/${accountId}/positions`);

      const positions: Position[] = (response.data.Positions || []).map((pos: any) => ({
        symbol: pos.Symbol,
        quantity: pos.Quantity,
        averagePrice: pos.AveragePrice,
        currentPrice: pos.Last,
        marketValue: pos.MarketValue,
        unrealizedPnL: pos.UnrealizedProfitLoss,
        unrealizedPnLPercent: pos.UnrealizedProfitLossPercent
      }));

      return positions;

    } catch (error: any) {
      logger.error('Failed to get positions:', error.response?.data || error.message);
      throw error;
    }
  }

  /**
   * Place an order
   */
  async placeOrder(request: PlaceOrderRequest): Promise<Order> {
    try {
      const accountId = TRADESTATION_ACCOUNT_ID;

      if (!accountId) {
        throw new Error('TRADESTATION_ACCOUNT_ID not configured');
      }

      const orderRequest: any = {
        AccountID: accountId,
        Symbol: request.symbol,
        Quantity: request.quantity.toString(),
        OrderType: request.orderType,
        TradeAction: request.side,
        TimeInForce: { Duration: request.timeInForce || 'DAY' }
      };

      if (request.limitPrice) {
        orderRequest.LimitPrice = request.limitPrice.toString();
      }

      if (request.stopPrice) {
        orderRequest.StopPrice = request.stopPrice.toString();
      }

      logger.info(`📤 Placing ${request.side} order: ${request.quantity} ${request.symbol} @ ${request.orderType}`);

      const response = await this.apiClient.post(
        `/orderexecution/orders`,
        orderRequest
      );

      const orderId = response.data.OrderID;

      logger.info(`✅ Order placed successfully: ${orderId}`);

      // Return order details
      return {
        orderId,
        symbol: request.symbol,
        side: request.side,
        orderType: request.orderType,
        quantity: request.quantity,
        limitPrice: request.limitPrice,
        stopPrice: request.stopPrice,
        status: 'Pending',
        filledQuantity: 0,
        submittedTime: new Date().toISOString()
      };

    } catch (error: any) {
      logger.error('❌ Failed to place order:', error.response?.data || error.message);
      throw new Error(`Order placement failed: ${error.response?.data?.Message || error.message}`);
    }
  }

  /**
   * Cancel an order
   */
  async cancelOrder(orderId: string): Promise<void> {
    try {
      logger.info(`🚫 Cancelling order: ${orderId}`);

      await this.apiClient.delete(`/orderexecution/orders/${orderId}`);

      logger.info(`✅ Order cancelled: ${orderId}`);

    } catch (error: any) {
      logger.error('Failed to cancel order:', error.response?.data || error.message);
      throw error;
    }
  }

  /**
   * Get order status
   */
  async getOrderStatus(orderId: string): Promise<Order> {
    try {
      const response = await this.apiClient.get(`/orderexecution/orders/${orderId}`);

      const data = response.data;

      return {
        orderId: data.OrderID,
        symbol: data.Symbol,
        side: data.TradeAction,
        orderType: data.OrderType,
        quantity: parseInt(data.Quantity),
        limitPrice: data.LimitPrice ? parseFloat(data.LimitPrice) : undefined,
        stopPrice: data.StopPrice ? parseFloat(data.StopPrice) : undefined,
        status: data.Status,
        filledQuantity: parseInt(data.FilledQuantity || '0'),
        averageFillPrice: data.AverageFillPrice ? parseFloat(data.AverageFillPrice) : undefined,
        submittedTime: data.OpenedDateTime,
        filledTime: data.ClosedDateTime
      };

    } catch (error: any) {
      logger.error('Failed to get order status:', error.response?.data || error.message);
      throw error;
    }
  }

  /**
   * Check if authenticated
   */
  isAuthenticated(): boolean {
    return this.tokens !== null && this.tokens.expires_at > Date.now();
  }

  /**
   * Get authentication status
   */
  getAuthStatus(): {
    authenticated: boolean;
    accountId: string | undefined;
    expiresIn: number | null;
  } {
    const expiresIn = this.tokens
      ? Math.floor((this.tokens.expires_at - Date.now()) / 1000)
      : null;

    return {
      authenticated: this.isAuthenticated(),
      accountId: TRADESTATION_ACCOUNT_ID,
      expiresIn
    };
  }
}

// Singleton instance
const tradestationService = new TradestationService();

export default tradestationService;
