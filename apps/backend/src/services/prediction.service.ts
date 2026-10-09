import { Pool } from 'pg';
import { getTrackerById } from './tracker.service.js';
import logger from '../utils/logger.js';

export interface PriceTrend {
  trackerId: string;
  trend: 'increasing' | 'decreasing' | 'stable';
  direction: number; // -1: decreasing, 0: stable, 1: increasing
  percentChange: number;
  bestPrice: number;
  worstPrice: number;
  averagePrice: number;
  volatility: number;
  predictedPrice: number;
  confidence: number; // 0-1
}

// Below this slope (as % of average price per data point) a trend counts as "stable".
const STABLE_SLOPE_THRESHOLD_PCT = 0.5;

export class PredictionService {
  constructor(private db: Pool) {}

  /**
   * Fetch this tracker's route/cabin price history from the shared
   * price_history hypertable (it's keyed by route+cabin, not tracker_id,
   * since history is shared across all users tracking the same route).
   */
  private async getHistoryPrices(trackerId: string, hoursBack: number): Promise<number[]> {
    const tracker = await getTrackerById(trackerId);

    const result = await this.db.query<{ price: string }>(
      `SELECT price FROM price_history
       WHERE origin = $1 AND destination = $2 AND cabin_class = $3
         AND time >= now() - ($4 || ' hours')::interval
       ORDER BY time ASC`,
      [tracker.origin, tracker.destination, tracker.cabinClass, hoursBack]
    );

    return result.rows.map((row: { price: string }) => Number(row.price));
  }

  /**
   * Calculate price trend based on historical data.
   */
  async getPriceTrend(trackerId: string, hoursBack: number = 48): Promise<PriceTrend> {
    try {
      const prices = await this.getHistoryPrices(trackerId, hoursBack);

      if (prices.length === 0) {
        // No history yet for this route/cabin (e.g. a brand-new tracker) —
        // return a neutral, clearly-low-confidence result instead of
        // fabricating a trend.
        const tracker = await getTrackerById(trackerId);
        const baseline = Number(tracker.baselinePrice);
        return {
          trackerId,
          trend: 'stable',
          direction: 0,
          percentChange: 0,
          bestPrice: baseline,
          worstPrice: baseline,
          averagePrice: baseline,
          volatility: 0,
          predictedPrice: baseline,
          confidence: 0,
        };
      }

      const bestPrice = Math.min(...prices);
      const worstPrice = Math.max(...prices);
      const averagePrice = prices.reduce((a, b) => a + b, 0) / prices.length;
      const volatility = this.calculateVolatility(prices);
      const { slope, intercept } = this.linearRegression(prices);
      const predictedPrice = intercept + slope * prices.length;

      const percentChange = ((prices[prices.length - 1] - prices[0]) / prices[0]) * 100;
      const slopePct = (Math.abs(slope) / averagePrice) * 100;

      let trend: PriceTrend['trend'] = 'stable';
      let direction = 0;
      if (prices.length > 1 && slopePct >= STABLE_SLOPE_THRESHOLD_PCT) {
        trend = slope < 0 ? 'decreasing' : 'increasing';
        direction = slope < 0 ? -1 : 1;
      }

      const confidence = this.calculateConfidence(prices, volatility);

      logger.info(`Calculated trend for tracker ${trackerId} from ${prices.length} price points`);

      return {
        trackerId,
        trend,
        direction,
        percentChange,
        bestPrice,
        worstPrice,
        averagePrice,
        volatility,
        predictedPrice,
        confidence,
      };
    } catch (error) {
      logger.error(`Failed to calculate price trend for tracker ${trackerId}`, error);
      throw error;
    }
  }

  /**
   * Simple linear regression to predict future price
   */
  private linearRegression(prices: number[]): { slope: number; intercept: number } {
    const n = prices.length;
    if (n < 2) {
      return { slope: 0, intercept: prices[0] || 0 };
    }

    let sumX = 0;
    let sumY = 0;
    let sumXY = 0;
    let sumX2 = 0;

    for (let i = 0; i < n; i++) {
      sumX += i;
      sumY += prices[i];
      sumXY += i * prices[i];
      sumX2 += i * i;
    }

    const slope = (n * sumXY - sumX * sumY) / (n * sumX2 - sumX * sumX);
    const intercept = (sumY - slope * sumX) / n;

    return { slope, intercept };
  }

  /**
   * Calculate standard deviation (volatility)
   */
  private calculateVolatility(prices: number[]): number {
    if (prices.length === 0) return 0;
    const avg = prices.reduce((a, b) => a + b, 0) / prices.length;
    if (avg === 0) return 0;
    const squareDiffs = prices.map((price) => Math.pow(price - avg, 2));
    const avgSquareDiff = squareDiffs.reduce((a, b) => a + b, 0) / prices.length;
    const std = Math.sqrt(avgSquareDiff);

    // Normalize to percentage
    return (std / avg) * 100;
  }

  /**
   * Calculate confidence score (0-1) based on data consistency
   */
  private calculateConfidence(prices: number[], volatility: number): number {
    // Low volatility = high confidence
    // More data points = high confidence
    const volatilityScore = Math.max(0, 1 - volatility / 100);
    const dataScore = Math.min(1, prices.length / 10); // Normalize to 10+ points for max score

    return (volatilityScore + dataScore) / 2;
  }

  /**
   * Get best time to book (currently simple heuristic)
   */
  async getBestTimeToBook(trackerId: string): Promise<{
    recommendedDate: Date;
    expectedPrice: number;
    reason: string;
  }> {
    try {
      const trend = await this.getPriceTrend(trackerId);

      const recommendedDate = new Date();
      let reason = '';

      if (trend.trend === 'decreasing') {
        // Price is going down, wait a bit more
        recommendedDate.setDate(recommendedDate.getDate() + 3);
        reason = 'Prices are decreasing - wait 3 more days for better deals';
      } else if (trend.trend === 'increasing') {
        // Price is going up, book soon
        recommendedDate.setDate(recommendedDate.getDate() + 1);
        reason = 'Prices are increasing - book within 1 day to lock in current price';
      } else {
        // Price is stable
        recommendedDate.setDate(recommendedDate.getDate() + 7);
        reason = 'Prices are stable - book within a week';
      }

      return {
        recommendedDate,
        expectedPrice: trend.predictedPrice,
        reason,
      };
    } catch (error) {
      logger.error(`Failed to determine best booking time for tracker ${trackerId}`, error);
      throw error;
    }
  }

  /**
   * Get price statistics for a tracker
   */
  async getPriceStatistics(trackerId: string, days: number = 30): Promise<{
    min: number;
    max: number;
    average: number;
    median: number;
    stdDev: number;
    dataPoints: number;
  }> {
    try {
      const prices = await this.getHistoryPrices(trackerId, days * 24);

      if (prices.length === 0) {
        return { min: 0, max: 0, average: 0, median: 0, stdDev: 0, dataPoints: 0 };
      }

      const sorted = [...prices].sort((a, b) => a - b);
      const min = sorted[0];
      const max = sorted[sorted.length - 1];
      const average = prices.reduce((a, b) => a + b, 0) / prices.length;
      const mid = Math.floor(sorted.length / 2);
      const median = sorted.length % 2 === 0 ? (sorted[mid - 1] + sorted[mid]) / 2 : sorted[mid];
      const stdDev = (this.calculateVolatility(prices) / 100) * average;

      logger.info(`Calculated statistics for tracker ${trackerId} from ${prices.length} price points`);

      return { min, max, average, median, stdDev, dataPoints: prices.length };
    } catch (error) {
      logger.error(`Failed to calculate price statistics for tracker ${trackerId}`, error);
      throw error;
    }
  }
}
