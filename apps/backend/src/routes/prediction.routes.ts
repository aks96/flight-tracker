import express, { Request, Response, NextFunction } from 'express';
import { Pool } from 'pg';
import { authenticateJWT } from '../middleware/auth.js';
import { PredictionService } from '../services/prediction.service.js';
import { getTrackerById } from '../services/tracker.service.js';
import logger from '../utils/logger.js';

export function createPredictionRoutes(db: Pool): express.Router {
  const router = express.Router();
  const predictionService = new PredictionService(db);

  // Get price trend for a tracker
  router.get('/tracker/:trackerId/trend', authenticateJWT, async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { trackerId } = req.params;
      const hoursBack = parseInt(req.query.hoursBack as string) || 48;

      const userId = (req as any).user?.id;
      const tracker = await getTrackerById(trackerId);

      if (!tracker || (tracker as any).userId !== userId) {
        return res.status(404).json({ error: 'Tracker not found' });
      }

      const trend = await predictionService.getPriceTrend(trackerId, hoursBack);

      res.json({
        data: trend,
      });
    } catch (error) {
      logger.error('Failed to get price trend', error);
      next(error);
    }
  });

  // Get best time to book
  router.get('/tracker/:trackerId/best-time', authenticateJWT, async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { trackerId } = req.params;

      const userId = (req as any).user?.id;
      const tracker = await getTrackerById(trackerId);

      if (!tracker || (tracker as any).userId !== userId) {
        return res.status(404).json({ error: 'Tracker not found' });
      }

      const recommendation = await predictionService.getBestTimeToBook(trackerId);

      res.json({
        data: recommendation,
      });
    } catch (error) {
      logger.error('Failed to get best booking time', error);
      next(error);
    }
  });

  // Get price statistics
  router.get('/tracker/:trackerId/statistics', authenticateJWT, async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { trackerId } = req.params;
      const days = parseInt(req.query.days as string) || 30;

      const userId = (req as any).user?.id;
      const tracker = await getTrackerById(trackerId);

      if (!tracker || (tracker as any).userId !== userId) {
        return res.status(404).json({ error: 'Tracker not found' });
      }

      const stats = await predictionService.getPriceStatistics(trackerId, days);

      res.json({
        data: stats,
      });
    } catch (error) {
      logger.error('Failed to get price statistics', error);
      next(error);
    }
  });

  return router;
}
