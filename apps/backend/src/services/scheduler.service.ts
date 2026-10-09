import Bull, { Queue, Job } from 'bull';
import { Pool } from 'pg';
import { execute, queryOne } from '@/db/connection.js';
import { config } from '@/config/env.js';
import logger from '@/utils/logger.js';
import * as trackerService from '@/services/tracker.service.js';
import { DeviceService } from '@/services/device.service.js';
import { NotificationService } from '@/services/notification.service.js';
import { getUserById, purgeExpiredTokens } from '@/services/auth.service.js';
import { getPriceForTracker, OfferPrice, SearchBudgetExhaustedError } from '@/services/price.service.js';
import { getBudgetStatus } from '@/services/searchBudget.js';
import { checkRoute } from '@/middleware/regionGuard.js';
import { Tracker } from '@/types/index.js';

const REPEATABLE_JOB_ID = 'check-all-trackers';

/**
 * How long until this tracker should be checked again, based on how close its
 * departure window is. A fare six months out doesn't move meaningfully hour to
 * hour; one three days out does. This tiering is the single biggest lever on
 * search spend.
 */
export function nextCheckDelayMs(tracker: Pick<Tracker, 'departDateStart'>): number {
  const departure = new Date(tracker.departDateStart).getTime();
  const daysToDeparture = (departure - Date.now()) / 86_400_000;

  for (const tier of config.polling.tiers) {
    if (daysToDeparture <= tier.withinDays) return tier.intervalMs;
  }

  return config.polling.tiers[config.polling.tiers.length - 1].intervalMs;
}

export class SchedulerService {
  private priceCheckQueue: Queue;
  private deviceService: DeviceService;
  private notificationService: NotificationService;

  constructor(db: Pool) {
    // Built from config.redis.url, which understands REDIS_URL *and* the
    // discrete REDIS_HOST/PORT/PASSWORD form, and supports rediss:// TLS URLs
    // from hosted providers like Upstash. Reading process.env.REDIS_HOST
    // directly (the previous behavior) silently ignored REDIS_URL — the
    // variable every deployment doc and .env.example tells you to set.
    this.priceCheckQueue = new Bull('price-check', config.redis.url, {
      defaultJobOptions: {
        attempts: 3,
        backoff: { type: 'exponential', delay: 30_000 },
        // Without these the queue grows without bound in Redis.
        removeOnComplete: 100,
        removeOnFail: 500,
      },
    });

    this.deviceService = new DeviceService(db);
    this.notificationService = new NotificationService();

    this.setupQueuesProcessors();
  }

  private setupQueuesProcessors() {
    this.priceCheckQueue.process(async (job: Job<{ trackerId: string }>) => {
      const { trackerId } = job.data;
      await this.checkTrackerPrice(trackerId);
      return { success: true };
    });

    this.priceCheckQueue.on('completed', (job) => {
      logger.debug('Price check completed', { trackerId: job.data.trackerId });
    });

    this.priceCheckQueue.on('failed', (job, error) => {
      logger.error('Price check failed', { trackerId: job?.data?.trackerId, err: error?.message });
    });

    this.priceCheckQueue.on('error', (error) => {
      logger.error('Price check queue error', error);
    });
  }

  async startScheduler() {
    try {
      // Only prune this scheduler's own repeatable definition. `queue.empty()`
      // (the previous call) wiped every waiting job in Redis on every boot —
      // with more than one instance running, each restart destroyed the
      // other's in-flight work.
      const repeatables = await this.priceCheckQueue.getRepeatableJobs();
      for (const repeatable of repeatables) {
        if (repeatable.id === REPEATABLE_JOB_ID) {
          await this.priceCheckQueue.removeRepeatableByKey(repeatable.key);
        }
      }

      await this.priceCheckQueue.add(
        { trackerId: 'all' },
        {
          repeat: { every: config.polling.tickIntervalMs },
          jobId: REPEATABLE_JOB_ID,
        }
      );

      logger.info(
        `Scheduler started — waking every ${config.polling.tickIntervalMs / 60000}m to check trackers that are due`
      );
    } catch (error) {
      logger.error('Failed to start scheduler', error);
      throw error;
    }
  }

  private async checkTrackerPrice(trackerId: string) {
    try {
      let trackers: Tracker[];

      if (trackerId === 'all') {
        // Only trackers whose tier interval has elapsed, not every active
        // tracker on every tick. Checking all of them every 5 minutes cost
        // ~8,600 searches per route per month — several times the entire
        // monthly budget for a single route.
        trackers = await trackerService.getDueTrackers();

        const budget = await getBudgetStatus();
        if (budget.exhausted) {
          logger.error('Monthly search budget exhausted — skipping this tick', budget);
          return;
        }

        if (trackers.length > 0) {
          logger.info('Price check tick', {
            due: trackers.length,
            budgetUsed: budget.used,
            budgetLimit: budget.limit,
            estimatedSpendUsd: budget.estimatedSpendUsd,
          });
        }

        // Opportunistic housekeeping on the same tick — expired token rows
        // otherwise accumulate forever.
        purgeExpiredTokens().catch((error) => logger.warn('Token purge failed', error));
      } else {
        const tracker = await trackerService.getTrackerById(trackerId);
        trackers = tracker ? [tracker] : [];
      }

      // Fan the live Duffel calls out in small concurrent batches rather than
      // one big unthrottled loop, respecting config.polling.maxConcurrent.
      // Identical routes collapse onto one billed search via the Redis cache
      // in price.service.
      const batchSize = Math.max(1, config.polling.maxConcurrent);
      for (let i = 0; i < trackers.length; i += batchSize) {
        const batch = trackers.slice(i, i + batchSize);
        await Promise.all(batch.map((tracker) => this.checkOneTracker(tracker)));
      }
    } catch (error) {
      logger.error('Failed to run price check', error);
    }
  }

  private async checkOneTracker(tracker: Tracker, offerOverride?: OfferPrice): Promise<void> {
    if (tracker.status !== 'active') {
      return;
    }

    // A tracker whose route falls outside the supported region can never
    // produce a useful result, but would still consume a search reservation on
    // every tick. This catches trackers created before the region was
    // narrowed, which would otherwise drain the budget forever.
    if (!offerOverride) {
      const region = checkRoute(tracker.origin, tracker.destination);
      if (!region.ok) {
        logger.warn('Pausing tracker on an unsupported route', {
          trackerId: tracker.id,
          route: `${tracker.origin}->${tracker.destination}`,
          reason: region.error,
        });
        await trackerService.pauseTrackerBySystem(tracker.id);
        return;
      }
    }

    try {
      const offer = offerOverride ?? (await getPriceForTracker(tracker));

      // A fare quoted in a different currency than the tracker's can't be
      // compared against its baseline — recording it would corrupt both the
      // alert decision and the price history the prediction service reads.
      if (offer.currency !== tracker.currency) {
        logger.warn('Skipping offer in unexpected currency', {
          trackerId: tracker.id,
          expected: tracker.currency,
          received: offer.currency,
        });
        return;
      }

      await this.savePriceHistory(tracker, offer);

      if (await this.shouldSendAlert(tracker, offer)) {
        await this.fireAlert(tracker, offer);
      }
    } catch (error) {
      if (error instanceof SearchBudgetExhaustedError) {
        // Back off to the end of the tier rather than retrying immediately;
        // the budget won't recover within this tick.
        logger.warn('Skipping tracker — search budget exhausted', { trackerId: tracker.id });
      } else {
        logger.error(`Failed to check price for tracker ${tracker.id}`, error);
      }
    } finally {
      // Always reschedule, including after a failure, so one broken tracker
      // can't be retried on every tick and drain the budget.
      if (!offerOverride) {
        await trackerService.scheduleNextCheck(tracker.id, nextCheckDelayMs(tracker));
      }
    }
  }

  /**
   * Manual test hook — runs the exact same detection → notify → log → re-arm
   * pipeline as a real scheduler tick, but with a fabricated price instead of
   * a live Duffel call.
   */
  async simulatePriceDrop(tracker: Tracker, fakeAmount: number, currency?: string): Promise<void> {
    const offer: OfferPrice = {
      id: 'simulated',
      trackerId: tracker.id,
      amount: fakeAmount,
      currency: currency || tracker.currency,
      airline: 'Simulated Airline',
      fetchedAt: new Date(),
      duration: 'PT2H0M',
      firstDeparture: new Date().toISOString(),
      source: 'simulated',
    };
    await this.checkOneTracker(tracker, offer);
  }

  private async fireAlert(tracker: Tracker, offer: OfferPrice): Promise<void> {
    const baselineBefore = Number(tracker.baselinePrice);
    const detectedAt = new Date();

    const devices = await this.deviceService.getDevicesByUserId(tracker.userId);
    const pushTokens = devices.map((d) => d.pushToken).filter(Boolean);

    const user = await getUserById(tracker.userId);

    const result = await this.notificationService.sendPriceDropAlert(
      pushTokens,
      {
        origin: tracker.origin,
        destination: tracker.destination,
        trackerId: tracker.id,
      },
      baselineBefore,
      offer.amount,
      offer.currency,
      user?.email
    );

    // Log the alert regardless of outcome so the seconds-level delivery SLA
    // (detected_at -> delivered_at) and any failures are auditable.
    await this.logAlert(tracker.id, offer.amount, baselineBefore, result, detectedAt);

    // Stamp the attempt even on failure — this is what the cooldown reads, so
    // a persistently failing tracker retries on the cooldown interval instead
    // of on every single tick.
    await this.stampAlertAttempt(tracker.id);

    // Re-arm the baseline to the new low only on confirmed delivery; if
    // delivery failed outright, keep the old baseline so the alert is retried.
    if (result.status !== 'failed') {
      await this.updateTrackerBaseline(tracker.id, offer.amount);
    }
  }

  private async shouldSendAlert(tracker: Tracker, currentPrice: OfferPrice): Promise<boolean> {
    const baselinePrice = Number(tracker.baselinePrice);
    const dropThreshold = Number(tracker.priceDropAmount);

    if (!Number.isFinite(currentPrice.amount) || currentPrice.amount <= 0) {
      return false;
    }

    if (baselinePrice - currentPrice.amount < dropThreshold) {
      return false;
    }

    // Cooldown: never alert the same tracker twice inside the window, however
    // the previous attempt went.
    const row = await queryOne<{ last_alert_at: Date | null }>(
      'SELECT last_alert_at FROM trackers WHERE id = $1',
      [tracker.id]
    );

    if (row?.last_alert_at) {
      const elapsedMs = Date.now() - new Date(row.last_alert_at).getTime();
      if (elapsedMs < config.notification.cooldownMs) {
        logger.debug('Alert suppressed by cooldown', { trackerId: tracker.id, elapsedMs });
        return false;
      }
    }

    return true;
  }

  private async logAlert(
    trackerId: string,
    priceAtAlert: number,
    baselineBefore: number,
    result: { status: 'sent' | 'fallback_email' | 'failed'; channel: 'push' | 'email' | null },
    detectedAt: Date
  ): Promise<void> {
    const deliveredAt = result.status === 'failed' ? null : new Date();

    try {
      await execute(
        `INSERT INTO alerts (tracker_id, price_at_alert, baseline_before, channel, delivery_status, detected_at, delivered_at)
         VALUES ($1, $2, $3, $4, $5, $6, $7)`,
        [trackerId, priceAtAlert, baselineBefore, result.channel, result.status, detectedAt, deliveredAt]
      );
    } catch (error) {
      logger.error(`Failed to log alert for tracker ${trackerId}`, error);
    }
  }

  private async stampAlertAttempt(trackerId: string): Promise<void> {
    try {
      await execute('UPDATE trackers SET last_alert_at = now() WHERE id = $1', [trackerId]);
    } catch (error) {
      logger.error(`Failed to stamp alert attempt for tracker ${trackerId}`, error);
    }
  }

  private async savePriceHistory(tracker: Tracker, offer: OfferPrice): Promise<void> {
    try {
      await execute(
        `INSERT INTO price_history (time, origin, destination, depart_date, return_date, cabin_class, price, currency, source)
         VALUES (now(), $1, $2, $3, $4, $5, $6, $7, $8)`,
        [
          tracker.origin,
          tracker.destination,
          tracker.departDateStart,
          tracker.returnDateStart || null,
          tracker.cabinClass,
          offer.amount,
          offer.currency,
          offer.source,
        ]
      );
    } catch (error) {
      logger.error(`Failed to save price history for tracker ${tracker.id}`, error);
    }
  }

  private async updateTrackerBaseline(trackerId: string, newPrice: number): Promise<void> {
    try {
      await execute('UPDATE trackers SET baseline_price = $1, updated_at = NOW() WHERE id = $2', [
        newPrice,
        trackerId,
      ]);
    } catch (error) {
      logger.error(`Failed to update tracker baseline for ${trackerId}`, error);
    }
  }

  async addManualPriceCheck(trackerId: string, delayMinutes: number = 0) {
    try {
      await this.priceCheckQueue.add(
        { trackerId },
        {
          delay: delayMinutes * 60 * 1000,
          jobId: `manual-check-${trackerId}-${Date.now()}`,
        }
      );
      logger.info(`Added manual price check for tracker ${trackerId}`);
    } catch (error) {
      logger.error('Failed to add manual price check', error);
      throw error;
    }
  }

  async stopScheduler() {
    try {
      await this.priceCheckQueue.close();
      logger.info('Scheduler stopped');
    } catch (error) {
      logger.error('Failed to stop scheduler', error);
      throw error;
    }
  }
}
