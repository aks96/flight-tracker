import { nextCheckDelayMs } from '../src/services/scheduler.service.js';

/**
 * Tiered polling is the single biggest lever on search spend. At the old flat
 * 5-minute interval one route cost ~8,600 searches/month — roughly four times
 * the entire monthly budget.
 */

const HOUR = 60 * 60 * 1000;
const DAY = 24 * HOUR;

function daysOut(days: number): { departDateStart: Date } {
  return { departDateStart: new Date(Date.now() + days * DAY) };
}

describe('nextCheckDelayMs', () => {
  it.each([
    ['3 days out', 3, 3 * HOUR],
    ['2 weeks out', 14, 6 * HOUR],
    ['6 weeks out', 42, 12 * HOUR],
    ['6 months out', 180, 24 * HOUR],
  ])('checks a departure %s every %i days -> correct tier', (_label, days, expected) => {
    expect(nextCheckDelayMs(daysOut(days) as any)).toBe(expected);
  });

  it('uses the tightest tier for a departure already in the past', async () => {
    expect(nextCheckDelayMs(daysOut(-1) as any)).toBe(3 * HOUR);
  });

  it('applies tier boundaries inclusively', () => {
    expect(nextCheckDelayMs(daysOut(6.9) as any)).toBe(3 * HOUR);
    expect(nextCheckDelayMs(daysOut(7.1) as any)).toBe(6 * HOUR);
    expect(nextCheckDelayMs(daysOut(20.9) as any)).toBe(6 * HOUR);
    expect(nextCheckDelayMs(daysOut(21.1) as any)).toBe(12 * HOUR);
  });

  // The scheduler's share of the 2,300/month budget is 65% ~= 1,495, or about
  // 50 searches/day. These two cases pin what that actually buys, so a future
  // tier change can't quietly blow the budget or silently over-tighten it.
  const SCHEDULER_MONTHLY_BUDGET = 1495;

  function monthlySearches(daysToDeparture: number[]): number {
    const perDay = daysToDeparture.reduce(
      (total, days) => total + DAY / nextCheckDelayMs(daysOut(days) as any),
      0
    );
    return perDay * 30;
  }

  it('fits a typical 17-tracker portfolio inside the monthly budget', () => {
    const portfolio = [
      ...Array(2).fill(3),    // imminent  -> 8/day each
      ...Array(4).fill(14),   // few weeks -> 4/day each
      ...Array(6).fill(45),   // ~6 weeks  -> 2/day each
      ...Array(5).fill(120),  // distant   -> 1/day each
    ];

    expect(monthlySearches(portfolio)).toBeLessThan(SCHEDULER_MONTHLY_BUDGET);
  });

  it('documents that an imminent-heavy portfolio exceeds the budget', () => {
    // Capacity is driven by *when* trackers depart, not how many exist. Twenty
    // trackers weighted towards imminent departures does not fit, and the
    // budget guard will start refusing checks partway through the month.
    const portfolio = [
      ...Array(4).fill(3),
      ...Array(6).fill(14),
      ...Array(6).fill(45),
      ...Array(4).fill(120),
    ];

    expect(monthlySearches(portfolio)).toBeGreaterThan(SCHEDULER_MONTHLY_BUDGET);
  });

  it('fits roughly 45 distant-departure trackers, which are cheapest to watch', () => {
    expect(monthlySearches(Array(45).fill(120))).toBeLessThan(SCHEDULER_MONTHLY_BUDGET);
  });
});
