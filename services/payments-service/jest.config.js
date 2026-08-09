module.exports = {
  preset: 'ts-jest',
  testEnvironment: 'node',
  roots: ['<rootDir>/tests'],
  testMatch: ['**/*.test.ts'],
  watchman: false,
  testTimeout: 20000,
  setupFiles: ['<rootDir>/tests/jest.setup.js'],
};
