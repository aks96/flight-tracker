// Manual test: fabricates a price drop for a real tracker and runs it
// through the actual SchedulerService pipeline — same detection,
// notification (with retry/backoff + email fallback), alerts-table logging,
// and baseline re-arm logic a real Duffel-triggered tick would use. Only the
// live Duffel call is bypassed (see SchedulerService.simulatePriceDrop).
//
// Usage: npx tsx scripts/simulate-price-drop.ts <trackerId> [fakePrice]

import { getPool } from '../src/db/connection.js';
import { SchedulerService } from '../src/services/scheduler.service.js';
import * as trackerService from '../src/services/tracker.service.js';
import { query } from '../src/db/connection.js';

async function main() {
  const trackerId = process.argv[2];
  if (!trackerId) {
    console.error('Usage: npx tsx scripts/simulate-price-drop.ts <trackerId> [fakePrice]');
    process.exit(1);
  }

  const tracker = await trackerService.getTrackerById(trackerId);
  const dropThreshold = Number(tracker.priceDropAmount);
  const baseline = Number(tracker.baselinePrice);
  const fakePrice = process.argv[3] ? Number(process.argv[3]) : baseline - dropThreshold - 1;

  console.log('--- Simulating a price drop ---');
  console.log(`Tracker:        ${tracker.origin} -> ${tracker.destination} (${tracker.id})`);
  console.log(`Baseline price: ${tracker.currency} ${baseline}`);
  console.log(`Drop threshold: ${tracker.currency} ${dropThreshold} (alert fires at <= ${baseline - dropThreshold})`);
  console.log(`Simulated live price: ${tracker.currency} ${fakePrice}`);
  console.log('');

  const pool = getPool();
  const scheduler = new SchedulerService(pool);
  await scheduler.simulatePriceDrop(tracker, fakePrice);
  // Deliberately not calling scheduler.stopScheduler() here: this script's
  // Bull queue and the real backend's already-running scheduler both attach
  // to the same 'price-check' queue name in the same Redis instance, and
  // closing this one races against that live process. Not needed for a
  // one-shot script — process.exit below tears the connection down anyway.

  // Show what actually landed in the DB as a result.
  const alerts = await query(
    `SELECT price_at_alert, baseline_before, channel, delivery_status, detected_at, delivered_at
     FROM alerts WHERE tracker_id = $1 ORDER BY detected_at DESC LIMIT 1`,
    [trackerId]
  );
  const updatedTracker = await trackerService.getTrackerById(trackerId);
  const historyCount = await query(
    `SELECT count(*) FROM price_history WHERE origin = $1 AND destination = $2`,
    [tracker.origin, tracker.destination]
  );

  console.log('--- Result ---');
  console.log('Latest alerts row:', alerts[0] || '(none — threshold not met, no alert fired)');
  console.log(`Tracker baseline_price now: ${updatedTracker.currency} ${updatedTracker.baselinePrice}`);
  console.log(`price_history rows for this route: ${historyCount[0].count}`);

  process.exit(0);
}

main().catch((err) => {
  console.error('Simulation failed:', err);
  process.exit(1);
});
