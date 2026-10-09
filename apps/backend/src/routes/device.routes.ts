import express, { Request, Response, NextFunction } from 'express';
import Joi from 'joi';
import { Pool } from 'pg';
import { authenticateJWT } from '../middleware/auth.js';
import { DeviceService } from '../services/device.service.js';
import logger from '../utils/logger.js';

export function createDeviceRoutes(db: Pool): express.Router {
  const router = express.Router();
  const deviceService = new DeviceService(db);

  // Register device for push notifications
  router.post('/register', authenticateJWT, async (req: Request, res: Response, next: NextFunction) => {
    try {
      const schema = Joi.object({
        pushToken: Joi.string().required(),
        platform: Joi.string().valid('ios', 'android').required(),
      });

      const { error, value } = schema.validate(req.body);
      if (error) {
        return res.status(400).json({ error: error.details[0].message });
      }

      // authenticateJWT sets req.user = { id, email } — not req.userId, which
      // was always undefined here and made every device insert violate the
      // devices.user_id NOT NULL constraint.
      const userId = req.user!.id;
      const device = await deviceService.registerDevice(userId, value.pushToken, value.platform);

      res.json({
        data: device,
        message: 'Device registered successfully',
      });
    } catch (error) {
      logger.error('Failed to register device', error);
      next(error);
    }
  });

  // Get user's devices
  router.get('/', authenticateJWT, async (req: Request, res: Response, next: NextFunction) => {
    try {
      const userId = req.user!.id;
      const devices = await deviceService.getDevicesByUserId(userId);

      res.json({
        data: devices,
        count: devices.length,
      });
    } catch (error) {
      logger.error('Failed to get user devices', error);
      next(error);
    }
  });

  // Deactivate device
  router.delete('/:deviceId', authenticateJWT, async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { deviceId } = req.params;
      await deviceService.deactivateDevice(deviceId, req.user!.id);

      res.json({
        message: 'Device deactivated successfully',
      });
    } catch (error) {
      if (error instanceof Error && error.message === 'Device not found or unauthorized') {
        return res.status(404).json({ error: error.message });
      }
      logger.error('Failed to deactivate device', error);
      next(error);
    }
  });

  // Ping device (keep-alive)
  router.post('/:deviceId/ping', authenticateJWT, async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { deviceId } = req.params;
      await deviceService.updateLastPing(deviceId, req.user!.id);

      res.json({
        message: 'Device ping updated',
      });
    } catch (error) {
      if (error instanceof Error && error.message === 'Device not found or unauthorized') {
        return res.status(404).json({ error: error.message });
      }
      logger.error('Failed to ping device', error);
      next(error);
    }
  });

  return router;
}
