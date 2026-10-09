import axios from 'axios';
import { Expo, ExpoPushMessage, ExpoPushTicket, ExpoPushReceiptId } from 'expo-server-sdk';
import { config } from '@/config/env.js';
import logger from '@/utils/logger.js';
import { deactivateDeviceByPushToken } from '@/services/device.service.js';

export interface PushNotification {
  title: string;
  body: string;
  data?: Record<string, string>;
}

// Outcome of attempting to deliver an alert, so callers can log an accurate
// `delivery_status` on the `alerts` row (sent | fallback_email | failed).
export interface DeliveryResult {
  status: 'sent' | 'fallback_email' | 'failed';
  channel: 'push' | 'email' | null;
}

const SENDGRID_URL = 'https://api.sendgrid.com/v3/mail/send';

// Expo advises waiting ~15 minutes before fetching receipts, but a price-drop
// alert's whole value is immediacy: check soon enough to prune dead tokens
// promptly, accepting that some receipts are still pending on first look.
const RECEIPT_CHECK_DELAY_MS = parseInt(process.env.PUSH_RECEIPT_DELAY_MS || '60000', 10);

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export class NotificationService {
  private expo: Expo;

  constructor() {
    // The Expo SDK handles chunking (100 messages/request), gzip, and the
    // access-token header — all of which the previous hand-rolled POST to
    // exp.host skipped, so anything past 100 tokens was silently rejected and
    // per-message errors were invisible.
    this.expo = new Expo({
      accessToken: config.expo.accessToken || undefined,
      useFcmV1: true,
    });
  }

  /**
   * Send a push notification to every valid token, retrying transient failures.
   * Returns true only if Expo accepted at least one message with an `ok`
   * ticket — an accepted HTTP request whose tickets are all errors is a
   * failure, and used to be reported as success.
   */
  async sendPushNotification(pushTokens: string[], notification: PushNotification): Promise<boolean> {
    // Malformed tokens are rejected by Expo for the whole chunk, so filter
    // them out here and retire them.
    const validTokens: string[] = [];
    for (const token of pushTokens) {
      if (Expo.isExpoPushToken(token)) {
        validTokens.push(token);
      } else {
        logger.warn('Discarding malformed Expo push token');
        await this.retireToken(token, 'malformed');
      }
    }

    if (validTokens.length === 0) {
      logger.warn('No valid push tokens to send to');
      return false;
    }

    const messages: ExpoPushMessage[] = validTokens.map((token) => ({
      to: token,
      sound: 'default',
      title: notification.title,
      body: notification.body,
      data: notification.data || {},
      badge: 1,
      priority: 'high',
      channelId: 'price-alerts',
    }));

    const chunks = this.expo.chunkPushNotifications(messages);
    const tickets: ExpoPushTicket[] = [];
    // Track which token produced which ticket so receipt errors can be
    // traced back to a specific device row.
    const ticketTokens: string[] = [];
    let anyAccepted = false;

    for (const chunk of chunks) {
      const chunkTokens = chunk.map((message) => String(message.to));
      const attempts = Math.max(1, config.notification.retryAttempts);

      for (let attempt = 1; attempt <= attempts; attempt++) {
        try {
          const chunkTickets = await this.expo.sendPushNotificationsAsync(chunk);
          tickets.push(...chunkTickets);
          ticketTokens.push(...chunkTokens);

          for (let i = 0; i < chunkTickets.length; i++) {
            const ticket = chunkTickets[i];
            if (ticket.status === 'ok') {
              anyAccepted = true;
            } else {
              logger.error('Expo rejected a push message', {
                message: ticket.message,
                details: ticket.details,
              });
              if (ticket.details?.error === 'DeviceNotRegistered') {
                await this.retireToken(chunkTokens[i], 'DeviceNotRegistered');
              }
            }
          }
          break;
        } catch (error) {
          logger.error(`Push chunk attempt ${attempt}/${attempts} failed`, error);
          if (attempt < attempts) {
            await sleep(config.notification.retryDelayMs * 2 ** (attempt - 1));
          }
        }
      }
    }

    if (anyAccepted) {
      // Receipts are the only place APNs/FCM report a delivery failure for an
      // otherwise-accepted message. Checked out of band so alert latency isn't
      // held hostage to the receipt delay.
      void this.checkReceiptsLater(tickets, ticketTokens);
    } else {
      logger.error('Push delivery failed for every token');
    }

    return anyAccepted;
  }

  /**
   * Fetch delivery receipts after a delay and retire tokens the push services
   * report as unregistered. Without this, uninstalled apps' tokens stay
   * active forever and every alert wastes a send on them.
   */
  private async checkReceiptsLater(tickets: ExpoPushTicket[], tokens: string[]): Promise<void> {
    const receiptIdToToken = new Map<ExpoPushReceiptId, string>();

    tickets.forEach((ticket, index) => {
      if (ticket.status === 'ok' && ticket.id) {
        receiptIdToToken.set(ticket.id, tokens[index]);
      }
    });

    if (receiptIdToToken.size === 0) return;

    await sleep(RECEIPT_CHECK_DELAY_MS);

    try {
      const receiptIds = [...receiptIdToToken.keys()];
      for (const chunk of this.expo.chunkPushNotificationReceiptIds(receiptIds)) {
        const receipts = await this.expo.getPushNotificationReceiptsAsync(chunk);

        for (const [receiptId, receipt] of Object.entries(receipts)) {
          if (receipt.status === 'error') {
            logger.error('Push receipt reported an error', {
              message: receipt.message,
              details: receipt.details,
            });
            if (receipt.details?.error === 'DeviceNotRegistered') {
              const token = receiptIdToToken.get(receiptId as ExpoPushReceiptId);
              if (token) await this.retireToken(token, 'DeviceNotRegistered (receipt)');
            }
          }
        }
      }
    } catch (error) {
      logger.error('Failed to fetch push receipts', error);
    }
  }

  private async retireToken(pushToken: string, reason: string): Promise<void> {
    try {
      await deactivateDeviceByPushToken(pushToken);
      logger.info(`Deactivated push token (${reason})`);
    } catch (error) {
      logger.error('Failed to deactivate push token', error);
    }
  }

  /**
   * Email fallback via SendGrid — used when push fails after retries, or no
   * device is registered for the user at all.
   */
  async sendEmailFallback(toEmail: string, subject: string, body: string): Promise<boolean> {
    if (!config.sendgrid.apiKey) {
      logger.warn('SendGrid API key not configured; cannot send email fallback');
      return false;
    }

    try {
      await axios.post(
        SENDGRID_URL,
        {
          personalizations: [{ to: [{ email: toEmail }] }],
          from: { email: config.sendgrid.fromEmail },
          subject,
          content: [{ type: 'text/plain', value: body }],
        },
        {
          timeout: 15000,
          headers: {
            Authorization: `Bearer ${config.sendgrid.apiKey}`,
            'Content-Type': 'application/json',
          },
        }
      );
      logger.info('Fallback email sent');
      return true;
    } catch (error) {
      logger.error('Failed to send fallback email', error);
      return false;
    }
  }

  /**
   * Send a price-drop alert, falling back to email if push has no devices to
   * target or ultimately fails after retries.
   */
  async sendPriceDropAlert(
    pushTokens: string[],
    tracker: { origin: string; destination: string; trackerId: string },
    oldPrice: number,
    newPrice: number,
    currency: string,
    fallbackEmail?: string
  ): Promise<DeliveryResult> {
    const priceDrop = oldPrice - newPrice;

    const notification: PushNotification = {
      title: 'Price Drop Alert! ✈️',
      body: `${tracker.origin} → ${tracker.destination}: ${currency} ${newPrice} (dropped ${currency} ${priceDrop})`,
      data: {
        trackerId: tracker.trackerId,
        type: 'price_drop',
        oldPrice: oldPrice.toString(),
        newPrice: newPrice.toString(),
        currency,
      },
    };

    let pushSucceeded = false;
    if (pushTokens.length > 0) {
      pushSucceeded = await this.sendPushNotification(pushTokens, notification);
    }

    if (pushSucceeded) {
      return { status: 'sent', channel: 'push' };
    }

    // No devices registered, or push failed after retries — fall back to email.
    if (fallbackEmail) {
      const emailSucceeded = await this.sendEmailFallback(
        fallbackEmail,
        notification.title,
        `${notification.body}\n\nOpen the app to see full details.`
      );
      if (emailSucceeded) {
        return { status: 'fallback_email', channel: 'email' };
      }
    }

    return { status: 'failed', channel: null };
  }

  async sendPasswordResetEmail(toEmail: string, resetUrl: string): Promise<boolean> {
    return this.sendEmailFallback(
      toEmail,
      `Reset your ${config.appName} password`,
      `Open this link to reset your password:\n\n${resetUrl}\n\n` +
        `The link expires in 1 hour. If you didn't request a reset, you can ignore this email.`
    );
  }

  async sendTrackerCreatedNotification(
    pushTokens: string[],
    tracker: { origin: string; destination: string }
  ): Promise<void> {
    await this.sendPushNotification(pushTokens, {
      title: 'Tracker Created',
      body: `Now monitoring ${tracker.origin} → ${tracker.destination} prices`,
    });
  }

  async sendTrackerPausedNotification(
    pushTokens: string[],
    tracker: { origin: string; destination: string }
  ): Promise<void> {
    await this.sendPushNotification(pushTokens, {
      title: 'Tracker Paused',
      body: `Paused monitoring ${tracker.origin} → ${tracker.destination} prices`,
    });
  }
}
