import { Router, Request, Response } from 'express';
import * as trackerService from '@/services/tracker.service.js';
import { getQuote, getCheapestOffer, SearchBudgetExhaustedError } from '@/services/price.service.js';
import { authenticateJWT } from '@/middleware/auth.js';
import { quoteLimiter } from '@/middleware/rateLimit.js';
import { checkRoute } from '@/middleware/regionGuard.js';
import Joi from 'joi';

const router = Router();

// Middleware to ensure JWT is present
router.use(authenticateJWT);

// IATA codes are uppercase A-Z only, dates must be in the future and ordered,
// and infants can't outnumber adults (each lap infant needs an accompanying
// adult). None of this was checked before, so invalid trackers were happily
// persisted and then failed forever against Duffel on every scheduler tick.
const iataCode = Joi.string()
  .length(3)
  .uppercase()
  .pattern(/^[A-Z]{3}$/)
  .required();

const createTrackerSchema = Joi.object({
  tripType: Joi.string().valid('one_way', 'round_trip').required(),
  origin: iataCode,
  destination: iataCode.invalid(Joi.ref('origin')).messages({
    'any.invalid': 'destination must differ from origin',
  }),
  departDateStart: Joi.date().iso().min('now').required(),
  departDateEnd: Joi.date().iso().min(Joi.ref('departDateStart')).required(),
  returnDateStart: Joi.date().iso().min(Joi.ref('departDateStart')).when('tripType', {
    is: 'round_trip',
    then: Joi.required(),
  }),
  returnDateEnd: Joi.date().iso().min(Joi.ref('returnDateStart')).when('tripType', {
    is: 'round_trip',
    then: Joi.required(),
  }),
  cabinClass: Joi.string()
    .valid('economy', 'premium_economy', 'business', 'first')
    .required(),
  adults: Joi.number().integer().min(1).max(9).required(),
  children: Joi.number().integer().min(0).max(8).required(),
  infants: Joi.number().integer().min(0).max(Joi.ref('adults')).required().messages({
    'number.max': 'infants cannot outnumber adults',
  }),
  currency: Joi.string().valid('INR', 'USD', 'EUR').required(),
  baselinePrice: Joi.number().positive().max(10_000_000).required(),
  priceDropAmount: Joi.number().positive().less(Joi.ref('baselinePrice')).required().messages({
    'number.less': 'priceDropAmount must be less than baselinePrice',
  }),
});

const updateTrackerSchema = Joi.object({
  priceDropAmount: Joi.number().positive().max(10_000_000),
  cabinClass: Joi.string().valid('economy', 'premium_economy', 'business', 'first'),
}).min(1);

const quoteSchema = Joi.object({
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
  cabinClass: Joi.string()
    .valid('economy', 'premium_economy', 'business', 'first')
    .required(),
  adults: Joi.number().integer().min(1).max(9).required(),
  children: Joi.number().integer().min(0).max(8).required(),
  infants: Joi.number().integer().min(0).max(Joi.ref('adults')).required(),
  currency: Joi.string().valid('INR', 'USD', 'EUR'),
});

// POST /trackers/quote - Live price lookup for a route, before a tracker is
// saved. Powers the "current price" auto-fill on the create-tracker screen.
router.post('/quote', quoteLimiter, async (req: Request, res: Response) => {
  try {
    const { error, value } = quoteSchema.validate(req.body);
    if (error) {
      res.status(400).json({ error: error.details[0].message });
      return;
    }

    const region = checkRoute(value.origin, value.destination);
    if (!region.ok) {
      res.status(422).json({ error: region.error, code: 'route_out_of_region' });
      return;
    }

    const offer = await getQuote(value);
    if (!offer) {
      res.status(404).json({ error: 'No fares found for this route' });
      return;
    }

    res.status(200).json({ amount: offer.amount, currency: offer.currency, airline: offer.airline });
  } catch (err: any) {
    if (err instanceof SearchBudgetExhaustedError) {
      res.status(429).json({
        error: 'Monthly flight search budget reached — enter the price manually',
        code: 'search_budget_exhausted',
      });
      return;
    }
    // The provider being unreachable/unconfigured shouldn't read as "your
    // route is invalid" — surface it as a lookup failure so the client can
    // fall back to manual entry instead of a confusing validation error.
    res.status(502).json({ error: 'Live price lookup failed — enter the price manually' });
  }
});

// POST /trackers - Create tracker
router.post('/', async (req: Request, res: Response) => {
  try {
    const { error, value } = createTrackerSchema.validate(req.body);
    if (error) {
      res.status(400).json({ error: error.details[0].message });
      return;
    }

    // A tracker outside the region would poll forever against a route the
    // search endpoint refuses, quietly consuming budget.
    const region = checkRoute(value.origin, value.destination);
    if (!region.ok) {
      res.status(422).json({ error: region.error, code: 'route_out_of_region' });
      return;
    }

    const tracker = await trackerService.createTracker(req.user!.id, value);
    res.status(201).json({ tracker });
  } catch (err: any) {
    res.status(400).json({ error: err.message });
  }
});

// GET /trackers - List user trackers
router.get('/', async (req: Request, res: Response) => {
  try {
    const trackers = await trackerService.getUserTrackers(req.user!.id);
    res.status(200).json({ trackers });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

/**
 * GET /trackers/:id/price — the tracker's live cheapest fare.
 *
 * The dashboard and detail screens previously displayed `baselinePrice` under
 * a "Current Price" label with a live indicator beside it. That column only
 * changes when an alert fires and delivers, so a tracker that never dropped
 * showed the same number indefinitely while claiming to be live. This is the
 * endpoint that makes that label true.
 *
 * Served from the Redis quote cache when warm, so opening the dashboard does
 * not cost a search per tracker.
 */
router.get('/:id/price', async (req: Request, res: Response) => {
  try {
    const tracker = await trackerService.getTrackerById(req.params.id);

    if (tracker.userId !== req.user!.id) {
      res.status(404).json({ error: 'Tracker not found' });
      return;
    }

    const offer = await getCheapestOffer(tracker, tracker.id, 'interactive');

    if (!offer) {
      // Fall back to the most recent observation rather than showing nothing —
      // clearly labelled as such by `live: false`.
      const observed = await trackerService.getLatestObservedPrice(tracker);
      if (observed) {
        res.status(200).json({
          amount: observed.price,
          currency: observed.currency,
          live: false,
          fetchedAt: observed.observedAt,
        });
        return;
      }
      res.status(404).json({ error: 'No fares currently available for this route' });
      return;
    }

    res.status(200).json({
      amount: offer.amount,
      currency: offer.currency,
      airline: offer.airline,
      live: true,
      fetchedAt: offer.fetchedAt,
      baselinePrice: Number(tracker.baselinePrice),
      priceDropAmount: Number(tracker.priceDropAmount),
    });
  } catch (err: any) {
    if (err instanceof SearchBudgetExhaustedError) {
      const tracker = await trackerService.getTrackerById(req.params.id).catch(() => null);
      const observed = tracker ? await trackerService.getLatestObservedPrice(tracker) : null;

      if (observed) {
        res.status(200).json({
          amount: observed.price,
          currency: observed.currency,
          live: false,
          fetchedAt: observed.observedAt,
          note: 'Showing the last observed price — monthly live-search budget reached',
        });
        return;
      }
      res.status(429).json({ error: 'Monthly flight search budget reached', code: 'search_budget_exhausted' });
      return;
    }
    res.status(404).json({ error: err.message });
  }
});

// GET /trackers/:id - Get single tracker
router.get('/:id', async (req: Request, res: Response) => {
  try {
    const tracker = await trackerService.getTrackerById(req.params.id);

    // Verify ownership
    if (tracker.userId !== req.user!.id) {
      res.status(403).json({ error: 'Unauthorized' });
      return;
    }

    res.status(200).json({ tracker });
  } catch (err: any) {
    res.status(404).json({ error: err.message });
  }
});

// PATCH /trackers/:id - Update tracker
router.patch('/:id', async (req: Request, res: Response) => {
  try {
    const { error, value } = updateTrackerSchema.validate(req.body);
    if (error) {
      res.status(400).json({ error: error.details[0].message });
      return;
    }

    const tracker = await trackerService.updateTracker(
      req.params.id,
      req.user!.id,
      value
    );
    res.status(200).json({ tracker });
  } catch (err: any) {
    res.status(400).json({ error: err.message });
  }
});

// DELETE /trackers/:id - Delete tracker
router.delete('/:id', async (req: Request, res: Response) => {
  try {
    await trackerService.deleteTracker(req.params.id, req.user!.id);
    res.status(204).send();
  } catch (err: any) {
    res.status(400).json({ error: err.message });
  }
});

// POST /trackers/:id/pause - Pause tracker
router.post('/:id/pause', async (req: Request, res: Response) => {
  try {
    const tracker = await trackerService.pauseTracker(req.params.id, req.user!.id);
    res.status(200).json({ tracker });
  } catch (err: any) {
    res.status(400).json({ error: err.message });
  }
});

// POST /trackers/:id/resume - Resume tracker
router.post('/:id/resume', async (req: Request, res: Response) => {
  try {
    const tracker = await trackerService.resumeTracker(req.params.id, req.user!.id);
    res.status(200).json({ tracker });
  } catch (err: any) {
    res.status(400).json({ error: err.message });
  }
});

export default router;
