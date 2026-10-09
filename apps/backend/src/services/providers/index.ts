import { config } from '@/config/env.js';
import logger from '@/utils/logger.js';
import { DuffelProvider } from './duffel.provider.js';
import { MockProvider } from './mock.provider.js';
import { PriceProvider } from './types.js';

export * from './types.js';
export { DuffelProvider } from './duffel.provider.js';
export { MockProvider } from './mock.provider.js';

let provider: PriceProvider | null = null;

export function getPriceProvider(): PriceProvider {
  if (!provider) {
    provider = config.priceProvider === 'duffel' ? new DuffelProvider() : new MockProvider();
    logger.info(`Price provider: ${provider.name}`);
  }
  return provider;
}

/** Visible for testing — forces the next call to re-read configuration. */
export function resetPriceProvider(): void {
  provider = null;
}
