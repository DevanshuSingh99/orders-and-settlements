import { Router } from 'express';
import { login } from './controller';

export const authRouter = Router();
authRouter.post('/login', login);
