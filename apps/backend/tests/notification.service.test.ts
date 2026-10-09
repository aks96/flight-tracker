import { jest } from '@jest/globals';

/**
 * Push delivery used to be a raw POST to exp.host that reported success
 * whenever the HTTP call itself succeeded — even if every message inside was
 * rejected — and never chunked, validated tokens, or read receipts.
 */

const sendPushNotificationsAsync = jest.fn<any>();
const getPushNotificationReceiptsAsync = jest.fn<any>(async () => ({}));
const isExpoPushToken = jest.fn((token: unknown) => String(token).startsWith('ExponentPushToken['));

class MockExpo {
  static isExpoPushToken = isExpoPushToken;
  sendPushNotificationsAsync = sendPushNotificationsAsync;
  getPushNotificationReceiptsAsync = getPushNotificationReceiptsAsync;
  // Mirror the real SDK's 100-messages-per-request limit.
  chunkPushNotifications(messages: any[]) {
    const chunks = [];
    for (let i = 0; i < messages.length; i += 100) chunks.push(messages.slice(i, i + 100));
    return chunks;
  }
  chunkPushNotificationReceiptIds(ids: string[]) {
    return [ids];
  }
}

jest.unstable_mockModule('expo-server-sdk', () => ({ Expo: MockExpo, default: { Expo: MockExpo } }));

const deactivateDeviceByPushToken = jest.fn<any>(async () => undefined);
jest.unstable_mockModule('../src/services/device.service.js', () => ({
  deactivateDeviceByPushToken,
  DeviceService: class {},
}));

jest.unstable_mockModule('axios', () => ({ default: { post: jest.fn<any>(async () => ({})) } }));

process.env.PUSH_RECEIPT_DELAY_MS = '5';
const { NotificationService } = await import('../src/services/notification.service.js');

const token = (n: number) => `ExponentPushToken[device-${n}]`;
const okTickets = (n: number) => Array.from({ length: n }, (_, i) => ({ status: 'ok', id: `receipt-${i}` }));

describe('sendPushNotification', () => {
  it('splits more than 100 messages into chunks Expo will accept', async () => {
    const tokens = Array.from({ length: 250 }, (_, i) => token(i));
    sendPushNotificationsAsync.mockImplementation(async (chunk: any[]) => okTickets(chunk.length));

    const sent = await new NotificationService().sendPushNotification(tokens, {
      title: 'x',
      body: 'y',
    });

    expect(sent).toBe(true);
    expect(sendPushNotificationsAsync).toHaveBeenCalledTimes(3);
    expect((sendPushNotificationsAsync.mock.calls[0] as any)[0]).toHaveLength(100);
    expect((sendPushNotificationsAsync.mock.calls[2] as any)[0]).toHaveLength(50);
  });

  it('reports failure when every ticket is an error, despite an accepted request', async () => {
    sendPushNotificationsAsync.mockResolvedValue([
      { status: 'error', message: 'bad', details: { error: 'MessageTooBig' } },
    ]);

    const sent = await new NotificationService().sendPushNotification([token(1)], {
      title: 'x',
      body: 'y',
    });

    expect(sent).toBe(false);
  });

  it('retires a token Expo reports as DeviceNotRegistered', async () => {
    sendPushNotificationsAsync.mockResolvedValue([
      { status: 'error', message: 'gone', details: { error: 'DeviceNotRegistered' } },
    ]);

    await new NotificationService().sendPushNotification([token(7)], { title: 'x', body: 'y' });

    expect(deactivateDeviceByPushToken).toHaveBeenCalledWith(token(7));
  });

  it('discards and retires malformed tokens before sending', async () => {
    sendPushNotificationsAsync.mockImplementation(async (chunk: any[]) => okTickets(chunk.length));

    await new NotificationService().sendPushNotification(['garbage-token', token(1)], {
      title: 'x',
      body: 'y',
    });

    expect(deactivateDeviceByPushToken).toHaveBeenCalledWith('garbage-token');
    expect((sendPushNotificationsAsync.mock.calls[0] as any)[0]).toHaveLength(1);
  });

  it('does not call Expo at all when no token is valid', async () => {
    const sent = await new NotificationService().sendPushNotification(['nope'], { title: 'x', body: 'y' });

    expect(sent).toBe(false);
    expect(sendPushNotificationsAsync).not.toHaveBeenCalled();
  });

  it('retires tokens that fail in the delivery receipt', async () => {
    sendPushNotificationsAsync.mockResolvedValue([{ status: 'ok', id: 'receipt-0' }]);
    getPushNotificationReceiptsAsync.mockResolvedValue({
      'receipt-0': { status: 'error', message: 'gone', details: { error: 'DeviceNotRegistered' } },
    });

    await new NotificationService().sendPushNotification([token(3)], { title: 'x', body: 'y' });

    // Receipts are polled out of band so alert latency isn't held up by them.
    await new Promise((resolve) => setTimeout(resolve, 50));
    expect(deactivateDeviceByPushToken).toHaveBeenCalledWith(token(3));
  });
});

describe('sendPriceDropAlert', () => {
  it('falls back to email when there is no registered device', async () => {
    const service = new NotificationService();
    const emailSpy = jest.spyOn(service, 'sendEmailFallback').mockResolvedValue(true);

    const result = await service.sendPriceDropAlert(
      [],
      { origin: 'DEL', destination: 'BOM', trackerId: 'trk_1' },
      6000,
      4500,
      'INR',
      'user@example.com'
    );

    expect(result).toEqual({ status: 'fallback_email', channel: 'email' });
    expect(emailSpy).toHaveBeenCalled();
  });

  it('reports failure when push fails and there is no email to fall back to', async () => {
    sendPushNotificationsAsync.mockResolvedValue([{ status: 'error', message: 'nope', details: {} }]);

    const result = await new NotificationService().sendPriceDropAlert(
      [token(1)],
      { origin: 'DEL', destination: 'BOM', trackerId: 'trk_1' },
      6000,
      4500,
      'INR'
    );

    expect(result).toEqual({ status: 'failed', channel: null });
  });

  it('carries the tracker id in the payload so a tap can deep-link', async () => {
    sendPushNotificationsAsync.mockImplementation(async (chunk: any[]) => okTickets(chunk.length));

    await new NotificationService().sendPriceDropAlert(
      [token(1)],
      { origin: 'DEL', destination: 'BOM', trackerId: 'trk_42' },
      6000,
      4500,
      'INR'
    );

    const message = (sendPushNotificationsAsync.mock.calls[0] as any)[0][0];
    expect(message.data).toMatchObject({ trackerId: 'trk_42', type: 'price_drop' });
  });
});
