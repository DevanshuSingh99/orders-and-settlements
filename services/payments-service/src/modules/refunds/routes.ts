import { Router } from 'express';
import { authenticate } from '../../middleware/authenticate';
import * as controller from './controller';

// Mounted at /api/orders/:orderId/refunds by the gateway/app - see app.ts.
export const refundsRouter = Router({ mergeParams: true });

refundsRouter.use(authenticate);

refundsRouter.get('/', controller.list);
refundsRouter.post('/', controller.record);
