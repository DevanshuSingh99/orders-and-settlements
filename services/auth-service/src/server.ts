import { createApp } from './app';
import { env } from './config/env';
import { logger } from './config/logger';

const app = createApp();

app.listen(env.AUTH_PORT, () => {
  logger.info(`auth-service listening on port ${env.AUTH_PORT}`);
});
