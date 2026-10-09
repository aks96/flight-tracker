import { Pool, QueryResult } from 'pg';
import { execute } from '@/db/connection.js';
import { Device } from '@/types/index.js';
import logger from '@/utils/logger.js';

// Every query aliases snake_case columns to the camelCase `Device` shape.
// `SELECT *` (the previous form) returned rows whose `pushToken` was always
// undefined, so the scheduler sent `[undefined]` to Expo for every alert.
const DEVICE_COLUMNS = `
  id,
  user_id AS "userId",
  push_token AS "pushToken",
  platform,
  is_active AS "isActive",
  last_ping AS "lastActiveAt",
  created_at AS "createdAt"
`;

export class DeviceService {
  constructor(private db: Pool) {}

  async registerDevice(
    userId: string,
    pushToken: string,
    platform: 'ios' | 'android'
  ): Promise<Device> {
    // A token can migrate between accounts on a shared device, so reassign
    // user_id on conflict rather than leaving it pointed at the old user.
    const query = `
      INSERT INTO devices (user_id, push_token, platform, is_active, last_ping)
      VALUES ($1, $2, $3, true, NOW())
      ON CONFLICT (push_token) DO UPDATE
      SET user_id = EXCLUDED.user_id,
          platform = EXCLUDED.platform,
          last_ping = NOW(),
          is_active = true
      RETURNING ${DEVICE_COLUMNS};
    `;

    try {
      const result: QueryResult<Device> = await this.db.query(query, [userId, pushToken, platform]);
      logger.info(`Device registered: ${result.rows[0].id}`);
      return result.rows[0];
    } catch (error) {
      logger.error('Failed to register device', error);
      throw error;
    }
  }

  async getDevicesByUserId(userId: string): Promise<Device[]> {
    const query = `
      SELECT ${DEVICE_COLUMNS} FROM devices
      WHERE user_id = $1 AND is_active = true
      ORDER BY last_ping DESC;
    `;

    try {
      const result: QueryResult<Device> = await this.db.query(query, [userId]);
      return result.rows;
    } catch (error) {
      logger.error('Failed to get user devices', error);
      throw error;
    }
  }

  // Scoped to user_id so one user can't deactivate/ping another user's
  // device by guessing its UUID.
  async deactivateDevice(deviceId: string, userId: string): Promise<void> {
    const query = `
      UPDATE devices
      SET is_active = false
      WHERE id = $1 AND user_id = $2;
    `;

    try {
      const result = await this.db.query(query, [deviceId, userId]);
      if (result.rowCount === 0) {
        throw new Error('Device not found or unauthorized');
      }
      logger.info(`Device deactivated: ${deviceId}`);
    } catch (error) {
      logger.error('Failed to deactivate device', error);
      throw error;
    }
  }

  async updateLastPing(deviceId: string, userId: string): Promise<void> {
    const query = `
      UPDATE devices
      SET last_ping = NOW()
      WHERE id = $1 AND user_id = $2;
    `;

    try {
      const result = await this.db.query(query, [deviceId, userId]);
      if (result.rowCount === 0) {
        throw new Error('Device not found or unauthorized');
      }
    } catch (error) {
      logger.error('Failed to update device ping', error);
      throw error;
    }
  }

  async getActiveDevices(limit: number = 1000): Promise<Device[]> {
    const query = `
      SELECT ${DEVICE_COLUMNS} FROM devices
      WHERE is_active = true
      ORDER BY last_ping DESC
      LIMIT $1;
    `;

    try {
      const result: QueryResult<Device> = await this.db.query(query, [limit]);
      return result.rows;
    } catch (error) {
      logger.error('Failed to get active devices', error);
      throw error;
    }
  }
}

/**
 * Retire a token that Expo/APNs/FCM reported as unusable. Standalone (not on
 * the class) because the notification service has no Pool handle — it runs
 * from the worker as well as the API.
 */
export async function deactivateDeviceByPushToken(pushToken: string): Promise<void> {
  await execute('UPDATE devices SET is_active = false WHERE push_token = $1', [pushToken]);
}
