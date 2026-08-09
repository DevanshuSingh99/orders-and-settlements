import type { Request, Response } from 'express';
import { AppError, ErrorCode } from '@oas/shared-domain';
import { asyncHandler } from '../../middleware/asyncHandler';
import * as service from './service';
import { createOrderSchema, exportOrdersQuerySchema, listOrdersQuerySchema, updateOrderSchema } from './schemas';

function contextFrom(req: Request): service.OrderContext {
  return { userId: req.userId, requestId: req.requestId, ip: req.ip, userAgent: req.header('user-agent') };
}

export const create = asyncHandler(async (req: Request, res: Response) => {
  const parsed = createOrderSchema.safeParse(req.body);
  if (!parsed.success) {
    throw new AppError(ErrorCode.VALIDATION_ERROR, 'Invalid order details.', {
      fieldErrors: parsed.error.flatten().fieldErrors,
    });
  }

  const order = await service.createOrder(parsed.data, contextFrom(req));
  res.status(201).json({ data: order });
});

export const list = asyncHandler(async (req: Request, res: Response) => {
  const parsed = listOrdersQuerySchema.safeParse(req.query);
  if (!parsed.success) {
    throw new AppError(ErrorCode.VALIDATION_ERROR, 'Invalid query parameters.', {
      fieldErrors: parsed.error.flatten().fieldErrors,
    });
  }

  const { orders, pagination } = await service.listOrders(parsed.data, contextFrom(req));
  res.status(200).json({ data: orders, pagination });
});

export const summary = asyncHandler(async (req: Request, res: Response) => {
  const data = await service.getSummary(contextFrom(req));
  res.status(200).json({ data });
});

export const exportCsv = asyncHandler(async (req: Request, res: Response) => {
  const parsed = exportOrdersQuerySchema.safeParse(req.query);
  if (!parsed.success) {
    throw new AppError(ErrorCode.VALIDATION_ERROR, 'Invalid export parameters.', {
      fieldErrors: parsed.error.flatten().fieldErrors,
      formErrors: parsed.error.flatten().formErrors,
    });
  }

  const result = await service.exportOrdersCsv(parsed.data, contextFrom(req));
  const filename = `orders-${result.dueDateFrom}-to-${result.dueDateTo}.csv`;

  res.setHeader('Content-Type', 'text/csv; charset=utf-8');
  res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
  res.setHeader('Cache-Control', 'no-store');
  res.setHeader('X-Export-Total', String(result.total));
  res.setHeader('X-Export-Offset', String(result.offset));
  res.setHeader('X-Export-Count', String(result.count));
  res.setHeader('X-Export-Has-More', result.hasMore ? 'true' : 'false');
  // Expose custom headers to browser JS (dashboard stitch) when called via gateway CORS.
  res.setHeader(
    'Access-Control-Expose-Headers',
    'Content-Disposition, X-Export-Total, X-Export-Offset, X-Export-Count, X-Export-Has-More',
  );

  res.status(200).send(result.csv);
});

export const getOne = asyncHandler(async (req: Request, res: Response) => {
  const order = await service.getOrder(req.params.orderId, contextFrom(req));
  res.status(200).json({ data: order });
});

export const update = asyncHandler(async (req: Request, res: Response) => {
  const parsed = updateOrderSchema.safeParse(req.body);
  if (!parsed.success) {
    throw new AppError(ErrorCode.VALIDATION_ERROR, 'Invalid update details.', {
      fieldErrors: parsed.error.flatten().fieldErrors,
    });
  }

  const order = await service.updateOrder(req.params.orderId, parsed.data, contextFrom(req));
  res.status(200).json({ data: order });
});

export const remove = asyncHandler(async (req: Request, res: Response) => {
  await service.deleteOrder(req.params.orderId, contextFrom(req));
  res.status(200).json({ data: { deleted: true } });
});
