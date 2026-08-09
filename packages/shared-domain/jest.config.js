/** Jest config for the shared-domain package: plain ts-jest, no DB, runs fast. */
module.exports = {
  preset: 'ts-jest',
  testEnvironment: 'node',
  roots: ['<rootDir>/tests'],
  testMatch: ['**/*.test.ts'],
  // Watchman is unavailable in some sandboxed/CI environments; Jest's
  // built-in file crawler works fine for a package this small.
  watchman: false,
};
