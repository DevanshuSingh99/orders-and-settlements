import type { Request, Response } from 'express';
import { getSuites } from '@oas/test-scenarios';
import { asyncHandler } from '../../middleware/asyncHandler';

export const listSuites = asyncHandler(async (_req: Request, res: Response) => {
  res.status(200).json({ data: { suites: getSuites() } });
});
