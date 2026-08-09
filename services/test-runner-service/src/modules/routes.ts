import { Router } from 'express';
import { authenticateRunner } from '../middleware/authenticate';
import { authRouter } from './auth/routes';
import { createLoadRun, getLimits, getLoadRunById, streamLoadRunById } from './load/controller';
import { createRun, getRunById, streamRunById } from './runs/controller';
import { listSuites } from './suites/controller';

export const testRouter = Router();

testRouter.use(authRouter);

testRouter.get('/suites', authenticateRunner, listSuites);

testRouter.post('/runs', authenticateRunner, createRun);
testRouter.get('/runs/:id', authenticateRunner, getRunById);
testRouter.get('/runs/:id/stream', authenticateRunner, streamRunById);

testRouter.get('/load/limits', authenticateRunner, getLimits);
testRouter.post('/load/runs', authenticateRunner, createLoadRun);
testRouter.get('/load/runs/:id', authenticateRunner, getLoadRunById);
testRouter.get('/load/runs/:id/stream', authenticateRunner, streamLoadRunById);
