/**
 * ESM + ts-jest. The package is `"type": "module"`, so tests need the ESM
 * preset and `NODE_OPTIONS=--experimental-vm-modules` (set in the npm script).
 * `moduleNameMapper` resolves both the `@/*` path alias and the explicit
 * `.js` extensions that ESM TypeScript imports carry.
 */
export default {
  preset: 'ts-jest/presets/default-esm',
  testEnvironment: 'node',
  extensionsToTreatAsEsm: ['.ts'],
  roots: ['<rootDir>/src', '<rootDir>/tests'],
  testMatch: ['**/*.test.ts'],
  moduleNameMapper: {
    '^@/(.*)\\.js$': '<rootDir>/src/$1',
    '^@/(.*)$': '<rootDir>/src/$1',
    '^(\\.{1,2}/.*)\\.js$': '$1',
  },
  transform: {
    '^.+\\.ts$': ['ts-jest', { useESM: true, tsconfig: { module: 'ES2022', verbatimModuleSyntax: false } }],
  },
  collectCoverageFrom: ['src/**/*.ts', '!src/index.ts', '!src/worker.ts', '!src/db/setup.ts'],
  clearMocks: true,
};
