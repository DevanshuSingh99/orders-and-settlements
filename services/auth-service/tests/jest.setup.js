// Keep test output readable: the app logs every request via pino-http,
// which is useful in production but noisy in a test run.
process.env.LOG_LEVEL = 'silent';
