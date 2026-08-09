import { createApp } from './app';
import { env } from './config/env';
import { logger } from './config/logger';

const app = createApp();

app.listen(env.PAYMENTS_PORT, () => {
  logger.info(`payments-service listening on port ${env.PAYMENTS_PORT}`);
});
