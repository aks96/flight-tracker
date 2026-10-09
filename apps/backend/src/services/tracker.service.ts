import { v4 as uuidv4 } from 'uuid';
import { query, queryOne, execute } from '@/db/connection.js';
import { Tracker } from '@/types/index.js';

export interface CreateTrackerInput {
  tripType: 'one_way' | 'round_trip';
  origin: string;
  destination: string;
  departDateStart: string;
  departDateEnd: string;
  returnDateStart?: string;
  returnDateEnd?: string;
  cabinClass: string;
  adults: number;
  children: number;
  infants: number;
  currency: string;
  baselinePrice: number;
  priceDropAmount: number;
}

export async function createTracker(
  userId: string,
  input: CreateTrackerInput
): Promise<Tracker> {
  const trackerId = uuidv4();

  const sql = `
    INSERT INTO trackers (
      id, user_id, trip_type, origin, destination,
      depart_date_start, depart_date_end, return_date_start, return_date_end,
      cabin_class, adults, children, infants, currency,
      baseline_price, price_drop_amount, status
    ) VALUES (
      $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17
    )
  `;

  await execute(sql, [
    trackerId,
    userId,
    input.tripType,
    input.origin,
    input.destination,
    input.departDateStart,
    input.departDateEnd,
    input.returnDateStart || null,
    input.returnDateEnd || null,
    input.cabinClass,
    input.adults,
    input.children,
    input.infants,
    input.currency,
    input.baselinePrice,
    input.priceDropAmount,
    'active',
  ]);

  return getTrackerById(trackerId);
}

export async function getTrackerById(trackerId: string): Promise<Tracker> {
  const tracker = await queryOne<any>(
    `SELECT 
      id, user_id as "userId", trip_type as "tripType", origin, destination,
      depart_date_start as "departDateStart", depart_date_end as "departDateEnd",
      return_date_start as "returnDateStart", return_date_end as "returnDateEnd",
      cabin_class as "cabinClass", adults, children, infants, currency,
      baseline_price as "baselinePrice", price_drop_amount as "priceDropAmount",
      status, created_at as "createdAt", updated_at as "updatedAt"
    FROM trackers WHERE id = $1`,
    [trackerId]
  );

  if (!tracker) {
    throw new Error('Tracker not found');
  }

  return tracker;
}

export async function getUserTrackers(userId: string): Promise<Tracker[]> {
  return query<Tracker>(
    `SELECT 
      id, user_id as "userId", trip_type as "tripType", origin, destination,
      depart_date_start as "departDateStart", depart_date_end as "departDateEnd",
      return_date_start as "returnDateStart", return_date_end as "returnDateEnd",
      cabin_class as "cabinClass", adults, children, infants, currency,
      baseline_price as "baselinePrice", price_drop_amount as "priceDropAmount",
      status, created_at as "createdAt", updated_at as "updatedAt"
    FROM trackers
    WHERE user_id = $1
    ORDER BY created_at DESC`,
    [userId]
  );
}

export async function updateTracker(
  trackerId: string,
  userId: string,
  input: Partial<CreateTrackerInput>
): Promise<Tracker> {
  // Verify ownership
  const tracker = await queryOne(
    'SELECT user_id FROM trackers WHERE id = $1',
    [trackerId]
  );

  if (!tracker || (tracker as any).user_id !== userId) {
    throw new Error('Tracker not found or unauthorized');
  }

  const updates: string[] = [];
  const values: any[] = [];
  let paramIndex = 1;

  if (input.priceDropAmount !== undefined) {
    updates.push(`price_drop_amount = $${paramIndex++}`);
    values.push(input.priceDropAmount);
  }

  if (input.cabinClass !== undefined) {
    updates.push(`cabin_class = $${paramIndex++}`);
    values.push(input.cabinClass);
  }

  if (updates.length === 0) {
    return getTrackerById(trackerId);
  }

  values.push(trackerId);
  const sql = `UPDATE trackers SET ${updates.join(', ')}, updated_at = now() WHERE id = $${paramIndex}`;

  await execute(sql, values);
  return getTrackerById(trackerId);
}

export async function deleteTracker(trackerId: string, userId: string): Promise<void> {
  // Verify ownership
  const tracker = await queryOne(
    'SELECT user_id FROM trackers WHERE id = $1',
    [trackerId]
  );

  if (!tracker || (tracker as any).user_id !== userId) {
    throw new Error('Tracker not found or unauthorized');
  }

  await execute('DELETE FROM trackers WHERE id = $1', [trackerId]);
}

export async function pauseTracker(trackerId: string, userId: string): Promise<Tracker> {
  // Verify ownership
  const tracker = await queryOne(
    'SELECT user_id FROM trackers WHERE id = $1',
    [trackerId]
  );

  if (!tracker || (tracker as any).user_id !== userId) {
    throw new Error('Tracker not found or unauthorized');
  }

  await execute(
    'UPDATE trackers SET status = $1, updated_at = now() WHERE id = $2',
    ['paused', trackerId]
  );

  return getTrackerById(trackerId);
}

export async function resumeTracker(trackerId: string, userId: string): Promise<Tracker> {
  // Verify ownership
  const tracker = await queryOne(
    'SELECT user_id FROM trackers WHERE id = $1',
    [trackerId]
  );

  if (!tracker || (tracker as any).user_id !== userId) {
    throw new Error('Tracker not found or unauthorized');
  }

  await execute(
    'UPDATE trackers SET status = $1, updated_at = now() WHERE id = $2',
    ['active', trackerId]
  );

  return getTrackerById(trackerId);
}

/**
 * Trackers whose tier interval has elapsed. The scheduler polls only these
 * rather than every active tracker on every tick — a NULL next_check_at means
 * a newly created tracker that has never been checked, so it goes first.
 */
export async function getDueTrackers(limit = 200): Promise<Tracker[]> {
  return query<Tracker>(
    `SELECT 
      id, user_id as "userId", trip_type as "tripType", origin, destination,
      depart_date_start as "departDateStart", depart_date_end as "departDateEnd",
      return_date_start as "returnDateStart", return_date_end as "returnDateEnd",
      cabin_class as "cabinClass", adults, children, infants, currency,
      baseline_price as "baselinePrice", price_drop_amount as "priceDropAmount",
      status, created_at as "createdAt", updated_at as "updatedAt"
    FROM trackers
    WHERE status = 'active'
      AND (next_check_at IS NULL OR next_check_at <= now())
      -- A departed itinerary can never drop in price again; checking it is
      -- pure waste against the search budget.
      AND depart_date_end >= CURRENT_DATE
    ORDER BY next_check_at ASC NULLS FIRST
    LIMIT $1`,
    [limit]
  );
}

/**
 * Pause a tracker without a user request — used when the scheduler finds it can
 * never succeed (e.g. its route is outside the supported region), so it stops
 * consuming the search budget on every tick.
 */
export async function pauseTrackerBySystem(trackerId: string): Promise<void> {
  await execute(`UPDATE trackers SET status = 'paused', updated_at = now() WHERE id = $1`, [
    trackerId,
  ]);
}

/** Stamp when this tracker should next be polled. */
export async function scheduleNextCheck(trackerId: string, delayMs: number): Promise<void> {
  await execute(
    `UPDATE trackers
     SET next_check_at = now() + ($1 || ' milliseconds')::interval,
         last_checked_at = now()
     WHERE id = $2`,
    [Math.round(delayMs), trackerId]
  );
}

/**
 * Most recent observed price for a route, straight from price_history. Lets
 * the dashboard show a real, recently-fetched fare without every card view
 * triggering a billable search.
 */
export async function getLatestObservedPrice(
  tracker: Pick<Tracker, 'origin' | 'destination' | 'cabinClass' | 'currency'>
): Promise<{ price: number; currency: string; observedAt: Date } | null> {
  const row = await queryOne<{ price: string; currency: string; time: Date }>(
    `SELECT price, currency, time
     FROM price_history
     WHERE origin = $1 AND destination = $2 AND cabin_class = $3 AND currency = $4
     ORDER BY time DESC
     LIMIT 1`,
    [tracker.origin, tracker.destination, tracker.cabinClass, tracker.currency]
  );

  return row ? { price: Number(row.price), currency: row.currency, observedAt: row.time } : null;
}

export async function getActiveTrackers(): Promise<Tracker[]> {
  return query<Tracker>(
    `SELECT 
      id, user_id as "userId", trip_type as "tripType", origin, destination,
      depart_date_start as "departDateStart", depart_date_end as "departDateEnd",
      return_date_start as "returnDateStart", return_date_end as "returnDateEnd",
      cabin_class as "cabinClass", adults, children, infants, currency,
      baseline_price as "baselinePrice", price_drop_amount as "priceDropAmount",
      status, created_at as "createdAt", updated_at as "updatedAt"
    FROM trackers
    WHERE status = $1`,
    ['active']
  );
}
