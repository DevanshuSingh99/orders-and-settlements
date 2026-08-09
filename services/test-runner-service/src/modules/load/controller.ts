import type { Request, Response } from 'express';
import { AppError, ErrorCode } from '@oas/shared-domain';
import { asyncHandler } from '../../middleware/asyncHandler';
import { getLoadLimitsResponse, validateLoadProfile } from '../../engine/loadProfile';
import { getRun } from '../../engine/runStore';
import { streamRun } from '../sse';
import { startLoadRun } from './service';

export const getLimits = asyncHandler(async (_req: Request, res: Response) => {
  res.status(200).json({ data: getLoadLimitsResponse() });
});

export const createLoadRun = asyncHandler(async (req: Request, res: Response) => {
  const validated = validateLoadProfile(req.body ?? {});
  if (!validated.ok || !validated.profile) {
    throw new AppError(ErrorCode.VALIDATION_ERROR, 'Load profile exceeds hard caps or is invalid.', {
      errors: validated.errors,
      estimates: validated.estimates,
      limits: getLoadLimitsResponse().limits,
    });
  }

  const run = await startLoadRun(validated.profile);
  res.status(202).json({
    data: {
      runId: run.id,
      status: run.status,
      totalOps: run.totalOps,
      estimates: validated.estimates,
    },
  });
});

export const getLoadRunById = asyncHandler(async (req: Request, res: Response) => {
  const run = await getRun(req.params.id);
  if (!run || run.kind !== 'load') {
    throw new AppError(ErrorCode.NOT_FOUND, 'Load run not found.');
  }
  res.status(200).json({ data: { run } });
});

export const streamLoadRunById = asyncHandler(async (req: Request, res: Response) => {
  const run = await getRun(req.params.id);
  if (!run || run.kind !== 'load') {
    throw new AppError(ErrorCode.NOT_FOUND, 'Load run not found.');
  }
  await streamRun(req, res, req.params.id);
});
