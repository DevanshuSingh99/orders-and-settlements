/** Integration tests run against a real Postgres + Redis (see docker-compose.yml / CI). */
module.exports = {
  preset: 'ts-jest',
  testEnvironment: 'node',
  roots: ['<rootDir>/tests'],
  testMatch: ['**/*.test.ts'],
  watchman: false,
  testTimeout: 15000,
  setupFiles: ['<rootDir>/tests/jest.setup.js'],
};
