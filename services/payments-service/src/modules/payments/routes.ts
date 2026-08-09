import { Router } from 'express';
import { authenticate } from '../../middleware/authenticate';
import * as controller from './controller';

// Mounted at /api/orders/:orderId/payments by the gateway/app - see app.ts.
export const paymentsRouter = Router({ mergeParams: true });

paymentsRouter.use(authenticate);

paymentsRouter.get('/', controller.list);
paymentsRouter.post('/', controller.record);
paymentsRouter.get('/:paymentId', controller.getOne);
