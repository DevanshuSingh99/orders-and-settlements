import { Router } from 'express';
import { authenticate } from '../../middleware/authenticate';
import * as controller from './controller';

export const ordersRouter = Router();

// Every route requires authentication; every controller/service call is
// additionally scoped to req.userId at the database layer (see repository.ts).
ordersRouter.use(authenticate);

ordersRouter.get('/summary', controller.summary);
// Registered before /:orderId so "export" is not treated as an order id.
ordersRouter.get('/export', controller.exportCsv);
ordersRouter.get('/', controller.list);
ordersRouter.post('/', controller.create);
ordersRouter.get('/:orderId', controller.getOne);
ordersRouter.patch('/:orderId', controller.update);
ordersRouter.delete('/:orderId', controller.remove);
