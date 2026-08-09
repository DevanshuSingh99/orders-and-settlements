import type { Request, Response } from 'express';
import { AppError, ErrorCode } from '@oas/shared-domain';
import { asyncHandler } from '../../middleware/asyncHandler';
import * as service from './service';
import { recordRefundSchema } from './schemas';

function contextFrom(req: Request): service.RefundContext {
  return { userId: req.userId, requestId: req.requestId, ip: req.ip, userAgent: req.header('user-agent') };
}

export const record = asyncHandler(async (req: Request, res: Response) => {
  const parsed = recordRefundSchema.safeParse(req.body);
  if (!parsed.success) {
    throw new AppError(ErrorCode.VALIDATION_ERROR, 'Invalid refund details.', {
      fieldErrors: parsed.error.flatten().fieldErrors,
    });
  }

  const idempotencyKey = req.header('idempotency-key') ?? null;

  const result = await service.recordRefund(req.params.orderId, parsed.data, idempotencyKey, contextFrom(req));
  res.status(result.replayed ? 200 : 201).json({ data: { refund: result.refund, order: result.order } });
});

export const list = asyncHandler(async (req: Request, res: Response) => {
  const refunds = await service.listRefunds(req.params.orderId, contextFrom(req));
  res.status(200).json({ data: refunds });
});
