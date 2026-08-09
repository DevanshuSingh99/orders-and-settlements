import { createApp } from './app';
import { env } from './config/env';
import { logger } from './config/logger';

const app = createApp();

app.listen(env.GATEWAY_PORT, () => {
  logger.info(`gateway listening on port ${env.GATEWAY_PORT}`);
});
