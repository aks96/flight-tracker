import { Router, Request, Response, NextFunction } from 'express';
import Joi from 'joi';
import { authenticateJWT } from '@/middleware/auth.js';
import { quoteLimiter } from '@/middleware/rateLimit.js';
import { searchFlights, SearchBudgetExhaustedError } from '@/services/price.service.js';
import { getBudgetStatus } from '@/services/searchBudget.js';
import { checkRoute } from '@/middleware/regionGuard.js';
import { supportedAirports } from '@/data/airports.js';
import logger from '@/utils/logger.js';

const router = Router();

router.use(authenticateJWT);

const iataCode = Joi.string()
  .length(3)
  .uppercase()
  .pattern(/^[A-Z]{3}$/)
  .required();

const searchSchema = Joi.object({
  tripType: Joi.string().valid('one_way', 'round_trip').required(),
  origin: iataCode,
  destination: iataCode.invalid(Joi.ref('origin')).messages({
    'any.invalid': 'destination must differ from origin',
  }),
  departDateStart: Joi.date().iso().min('now').required(),
  returnDateStart: Joi.date().iso().min(Joi.ref('departDateStart')).when('tripType', {
    is: 'round_trip',
    then: Joi.required(),
  }),
  cabinClass: Joi.string().valid('economy', 'premium_economy', 'business', 'first').required(),
  adults: Joi.number().integer().min(1).max(9).required(),
  children: Joi.number().integer().min(0).max(8).required(),
  infants: Joi.number().integer().min(0).max(Joi.ref('adults')).required(),
  currency: Joi.string().valid('INR', 'USD', 'EUR').default('INR'),
  limit: Joi.number().integer().min(1).max(30).default(20),
});

/**
 * POST /api/flights/search — the full list of available flights for a route,
 * so a user can compare fares in-app and create a tracker from what they see
 * instead of checking prices somewhere else first.
 *
 * Results are cached in Redis for SEARCH_CACHE_TTL_SEC, so repeated browsing
 * of the same route costs one billable search rather than one per view.
 */
router.post('/search', quoteLimiter, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { error, value } = searchSchema.validate(req.body);
    if (error) {
      res.status(400).json({ error: error.details[0].message });
      return;
    }

    // Region check before anything billable happens.
    const region = checkRoute(value.origin, value.destination);
    if (!region.ok) {
      res.status(422).json({ error: region.error, code: 'route_out_of_region' });
      return;
    }

    const { limit, ...input } = value;
    const result = await searchFlights(input, { limit, consumer: 'interactive', kind: 'search' });

    if (result.offers.length === 0) {
      res.status(404).json({ error: 'No fares found for this route' });
      return;
    }

    res.status(200).json({
      offers: result.offers,
      // Surfaced so the client can label the list honestly rather than
      // implying a number is live when it came from cache.
      meta: {
        cached: result.cached,
        fetchedAt: result.fetchedAt,
        cheapest: result.offers[0].amount,
        currency: result.offers[0].currency,
      },
    });
  } catch (err) {
    if (err instanceof SearchBudgetExhaustedError) {
      res.status(429).json({
        error: 'Monthly flight search budget reached — live search resumes next month',
        code: 'search_budget_exhausted',
      });
      return;
    }
    logger.error('Flight search failed', err);
    next(err);
  }
});

/**
 * Airports the app currently serves, so the client can offer the same set the
 * API will accept rather than letting a user pick a route that gets rejected.
 */
router.get('/airports', async (_req: Request, res: Response, next: NextFunction) => {
  try {
    const airports = supportedAirports();
    res.status(200).json({ airports, count: airports.length });
  } catch (err) {
    next(err);
  }
});

/** Current search-budget consumption, for a settings/diagnostics view. */
router.get('/budget', async (_req: Request, res: Response, next: NextFunction) => {
  try {
    res.status(200).json(await getBudgetStatus());
  } catch (err) {
    next(err);
  }
});

export default router;
