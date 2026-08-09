import { Router } from 'express';
import { authenticate, tryAuthenticate } from '../../middleware/authenticate';
import * as controller from './controller';

export const authRouter = Router();

authRouter.post('/register', controller.register);
authRouter.post('/login', controller.login);
authRouter.post('/refresh', controller.refresh);
authRouter.post('/logout', tryAuthenticate, controller.logout);
authRouter.get('/me', authenticate, controller.me);
