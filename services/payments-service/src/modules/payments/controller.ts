import type { Request, Response } from 'express';
import { AppError, ErrorCode } from '@oas/shared-domain';
import { asyncHandler } from '../../middleware/asyncHandler';
import * as service from './service';
import { recordPaymentSchema } from './schemas';

function contextFrom(req: Request): service.PaymentContext {
  return { userId: req.userId, requestId: req.requestId, ip: req.ip, userAgent: req.header('user-agent') };
}

export const record = asyncHandler(async (req: Request, res: Response) => {
  const parsed = recordPaymentSchema.safeParse(req.body);
  if (!parsed.success) {
    throw new AppError(ErrorCode.VALIDATION_ERROR, 'Invalid payment details.', {
      fieldErrors: parsed.error.flatten().fieldErrors,
    });
  }

  // Optional client-supplied idempotency key - see
  // docs/implementation-plan.md section 12. Safe to omit; the request is
  // then simply not idempotent (a genuine retry could create a second payment).
  const idempotencyKey = req.header('idempotency-key') ?? null;

  const result = await service.recordPayment(req.params.orderId, parsed.data, idempotencyKey, contextFrom(req));
  // A replayed idempotent request returns 200 (nothing new was created);
  // a freshly created payment returns 201.
  res.status(result.replayed ? 200 : 201).json({ data: { payment: result.payment, order: result.order } });
});

export const list = asyncHandler(async (req: Request, res: Response) => {
  const payments = await service.listPayments(req.params.orderId, contextFrom(req));
  res.status(200).json({ data: payments });
});

export const getOne = asyncHandler(async (req: Request, res: Response) => {
  const payment = await service.getPayment(req.params.orderId, req.params.paymentId, contextFrom(req));
  res.status(200).json({ data: payment });
});
