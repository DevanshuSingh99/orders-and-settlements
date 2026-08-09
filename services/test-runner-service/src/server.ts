import { createApp } from './app';
import { env } from './config/env';
import { logger } from './config/logger';

const app = createApp();

app.listen(env.TEST_RUNNER_PORT, () => {
  logger.info(`test-runner-service listening on port ${env.TEST_RUNNER_PORT}`);
});
