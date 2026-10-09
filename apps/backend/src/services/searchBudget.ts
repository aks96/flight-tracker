import { config } from '@/config/env.js';
import { getRedis } from '@/utils/redis.js';
import logger from '@/utils/logger.js';

/**
 * Hard ceiling on billable searches per calendar month.
 *
 * Duffel charges $0.005 per search beyond a 1500:1 search-to-book ratio. This
 * app takes no bookings in v1, so effectively every search is billable and an
 * unbounded polling loop is an unbounded bill. The counter lives in Redis so
 * the limit holds across the API and worker processes together.
 */

export type SearchConsumer = 'scheduler' | 'interactive';

export interface BudgetStatus {
  month: string;
  used: number;
  limit: number;
  remaining: number;
  schedulerUsed: number;
  schedulerLimit: number;
  interactiveUsed: number;
  interactiveLimit: number;
  estimatedSpendUsd: number;
  exhausted: boolean;
}

function currentMonthKey(now = new Date()): string {
  return `${now.getUTCFullYear()}-${String(now.getUTCMonth() + 1).padStart(2, '0')}`;
}

function counterKey(consumer: SearchConsumer, month = currentMonthKey()): string {
  return `search-budget:${month}:${consumer}`;
}

function limits() {
  const total = config.searchBudget.monthlyLimit;
  const scheduler = Math.floor(total * config.searchBudget.schedulerShare);
  return { total, scheduler, interactive: total - scheduler };
}

/**
 * Reserve one search for `consumer`, returning false if that would exceed its
 * share. Each consumer has its own sub-limit so a burst of user browsing can
 * never starve the polling that actually drives alerts, and vice versa.
 *
 * Fails **open** if Redis is unavailable: a cache outage should degrade the
 * cost ceiling to "unenforced and loudly warned about", not take the product
 * offline. The monthly Duffel invoice is the backstop.
 */
export async function reserveSearch(consumer: SearchConsumer): Promise<boolean> {
  const { scheduler, interactive } = limits();
  const cap = consumer === 'scheduler' ? scheduler : interactive;

  try {
    const redis = getRedis();
    const key = counterKey(consumer);
    const used = await redis.incr(key);

    if (used === 1) {
      // Expire a little over two months out, so the previous month's counter
      // survives long enough to be reported on.
      await redis.expire(key, 70 * 24 * 60 * 60);
    }

    if (used > cap) {
      // Give the reservation back so the counter reflects searches actually
      // performed, not attempts.
      await redis.decr(key);
      logger.warn('Search budget exhausted — refusing search', { consumer, used: used - 1, cap });
      return false;
    }

    if (used === Math.floor(cap * config.searchBudget.warnThreshold)) {
      logger.warn('Search budget threshold crossed', { consumer, used, cap });
    }

    return true;
  } catch (error) {
    logger.error('Search budget check failed — allowing the search', error);
    return true;
  }
}

/** Return a reservation when a search was aborted before it was billed. */
export async function releaseSearch(consumer: SearchConsumer): Promise<void> {
  try {
    await getRedis().decr(counterKey(consumer));
  } catch (error) {
    logger.warn('Failed to release search reservation', error);
  }
}

export async function getBudgetStatus(): Promise<BudgetStatus> {
  const { total, scheduler, interactive } = limits();
  const month = currentMonthKey();

  let schedulerUsed = 0;
  let interactiveUsed = 0;

  try {
    const redis = getRedis();
    const [s, i] = await redis.mget(counterKey('scheduler', month), counterKey('interactive', month));
    schedulerUsed = Number(s || 0);
    interactiveUsed = Number(i || 0);
  } catch (error) {
    logger.warn('Could not read search budget counters', error);
  }

  const used = schedulerUsed + interactiveUsed;

  return {
    month,
    used,
    limit: total,
    remaining: Math.max(0, total - used),
    schedulerUsed,
    schedulerLimit: scheduler,
    interactiveUsed,
    interactiveLimit: interactive,
    // 4 decimal places, not 2: at $0.005 per search, cent-level rounding hides
    // everything below a couple of searches.
    estimatedSpendUsd: Number((used * config.searchBudget.costPerSearchUsd).toFixed(4)),
    exhausted: used >= total,
  };
}
