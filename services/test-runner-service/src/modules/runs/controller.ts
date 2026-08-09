import type { Request, Response } from 'express';
import { AppError, ErrorCode } from '@oas/shared-domain';
import { z } from 'zod';
import { asyncHandler } from '../../middleware/asyncHandler';
import { getRun } from '../../engine/runStore';
import { streamRun } from '../sse';
import { startSuiteRun } from './service';

const startSchema = z.object({
  suites: z.array(z.string().min(1)).optional(),
});

export const createRun = asyncHandler(async (req: Request, res: Response) => {
  const parsed = startSchema.safeParse(req.body ?? {});
  if (!parsed.success) {
    throw new AppError(ErrorCode.VALIDATION_ERROR, 'Invalid run request.', {
      fieldErrors: parsed.error.flatten().fieldErrors,
    });
  }

  const run = await startSuiteRun(parsed.data.suites);
  res.status(202).json({ data: { runId: run.id, status: run.status } });
});

export const getRunById = asyncHandler(async (req: Request, res: Response) => {
  const run = await getRun(req.params.id);
  if (!run || run.kind !== 'suite') {
    throw new AppError(ErrorCode.NOT_FOUND, 'Run not found.');
  }
  res.status(200).json({ data: { run } });
});

export const streamRunById = asyncHandler(async (req: Request, res: Response) => {
  const run = await getRun(req.params.id);
  if (!run || run.kind !== 'suite') {
    throw new AppError(ErrorCode.NOT_FOUND, 'Run not found.');
  }
  await streamRun(req, res, req.params.id);
});
