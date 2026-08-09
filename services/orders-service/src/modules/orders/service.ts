/**
 * Business logic for orders: server-side total calculation, editability
 * rules, and audit logging. HTTP concerns live in controller.ts.
 */
import { AppError, AuditAction, calculateOrderTotalCents, ErrorCode, toCents } from '@oas/shared-domain';
import { writeAudit } from '../../audit/writeAudit';
import * as repo from './repository';
import { serializeOrder } from './serializer';
import { ordersToCsv } from './csv';
import type { CreateOrderInput, ExportOrdersQuery, ListOrdersQuery, UpdateOrderInput } from './schemas';

export interface OrderContext {
  userId: string;
  requestId: string;
  ip?: string;
  userAgent?: string;
}

function toLineItemInputs(lineItems: CreateOrderInput['lineItems']) {
  return lineItems.map((item) => {
    const unitPriceCents = toCents(item.unitPrice);
    return {
      description: item.description,
      quantity: item.quantity,
      unitPriceCents,
      lineTotalCents: item.quantity * unitPriceCents,
    };
  });
}

export async function createOrder(input: CreateOrderInput, ctx: OrderContext) {
  const lineItems = toLineItemInputs(input.lineItems);
  const totalCents = calculateOrderTotalCents(
    lineItems.map((item) => ({ quantity: item.quantity, unitPriceCents: item.unitPriceCents })),
  );

  const order = await repo.withTransaction(async (client) => {
    const created = await repo.insertOrderWithLineItems(client, {
      userId: ctx.userId,
      customer: input.customer,
      dueDate: input.dueDate,
      totalCents,
      lineItems,
    });

    await writeAudit(
      {
        actorId: ctx.userId,
        action: AuditAction.ORDER_CREATED,
        entityType: 'order',
        entityId: created.id,
        requestId: ctx.requestId,
        ip: ctx.ip,
        userAgent: ctx.userAgent,
        metadata: { customer: input.customer, totalCents, lineItemCount: lineItems.length },
      },
      client,
    );

    return created;
  });

  const fullOrder = await repo.findOrderForUser(ctx.userId, order.id);
  const items = await repo.findLineItemsForOrder(order.id);
  return serializeOrder(fullOrder!, items);
}

export async function getOrder(orderId: string, ctx: OrderContext) {
  const order = await repo.findOrderForUser(ctx.userId, orderId);
  if (!order) {
    // Same error for "doesn't exist" and "belongs to someone else" - never
    // reveal that a resource exists but is forbidden (Invariant 4).
    throw new AppError(ErrorCode.ORDER_NOT_FOUND, 'Order not found.');
  }
  const lineItems = await repo.findLineItemsForOrder(orderId);
  return serializeOrder(order, lineItems);
}

export async function listOrders(query: ListOrdersQuery, ctx: OrderContext) {
  const { orders, total } = await repo.listOrdersForUser(ctx.userId, query);
  return {
    orders: orders.map((order) => serializeOrder(order)),
    pagination: { page: query.page, limit: query.limit, total },
  };
}

export async function exportOrdersCsv(query: ExportOrdersQuery, ctx: OrderContext) {
  const { orders, total } = await repo.exportOrdersForUser(ctx.userId, query);
  return {
    csv: ordersToCsv(orders),
    total,
    offset: query.offset,
    count: orders.length,
    hasMore: query.offset + orders.length < total,
    dueDateFrom: query.dueDateFrom.slice(0, 10),
    dueDateTo: query.dueDateTo.slice(0, 10),
  };
}

export async function getSummary(ctx: OrderContext) {
  const summary = await repo.getSummaryForUser(ctx.userId);
  return {
    totalOutstanding: summary.totalOutstandingCents / 100,
    totalCollected: summary.totalCollectedCents / 100,
    overdueCount: summary.overdueCount,
    pendingCount: summary.pendingCount,
  };
}

export async function updateOrder(orderId: string, input: UpdateOrderInput, ctx: OrderContext) {
  const existing = await repo.findOrderForUser(ctx.userId, orderId);
  if (!existing) {
    throw new AppError(ErrorCode.ORDER_NOT_FOUND, 'Order not found.');
  }

  const hasFinancialChanges = input.lineItems !== undefined;
  const alreadyHasPayments = Number(existing.paid_amount_cents) > 0;

  if (hasFinancialChanges && alreadyHasPayments) {
    await writeAudit({
      actorId: ctx.userId,
      action: AuditAction.ORDER_EDIT_REJECTED,
      entityType: 'order',
      entityId: orderId,
      requestId: ctx.requestId,
      ip: ctx.ip,
      userAgent: ctx.userAgent,
      metadata: { reason: 'line items are immutable once a payment has been recorded' },
    });
    throw new AppError(
      ErrorCode.ORDER_NOT_EDITABLE,
      'This order has at least one payment recorded, so its line items can no longer be changed. You can still update the customer name and due date.',
    );
  }

  await repo.withTransaction(async (client) => {
    if (input.customer !== undefined || input.dueDate !== undefined) {
      await repo.updateOrderMetadata(orderId, { customer: input.customer, dueDate: input.dueDate });
    }

    if (input.lineItems !== undefined) {
      const lineItems = toLineItemInputs(input.lineItems);
      const totalCents = calculateOrderTotalCents(
        lineItems.map((item) => ({ quantity: item.quantity, unitPriceCents: item.unitPriceCents })),
      );
      await repo.replaceLineItems(client, orderId, lineItems, totalCents);
    }

    await writeAudit(
      {
        actorId: ctx.userId,
        action: AuditAction.ORDER_UPDATED,
        entityType: 'order',
        entityId: orderId,
        requestId: ctx.requestId,
        ip: ctx.ip,
        userAgent: ctx.userAgent,
        metadata: { fieldsChanged: Object.keys(input) },
      },
      client,
    );
  });

  const updated = await repo.findOrderForUser(ctx.userId, orderId);
  const items = await repo.findLineItemsForOrder(orderId);
  return serializeOrder(updated!, items);
}

export async function deleteOrder(orderId: string, ctx: OrderContext): Promise<void> {
  const existing = await repo.findOrderForUser(ctx.userId, orderId);
  if (!existing) {
    throw new AppError(ErrorCode.ORDER_NOT_FOUND, 'Order not found.');
  }

  if (Number(existing.paid_amount_cents) > 0) {
    throw new AppError(
      ErrorCode.ORDER_NOT_EDITABLE,
      'This order has at least one payment recorded and cannot be deleted. Financial records are kept for audit purposes.',
    );
  }

  await repo.deleteOrderForUser(ctx.userId, orderId);
  await writeAudit({
    actorId: ctx.userId,
    action: AuditAction.ORDER_DELETED,
    entityType: 'order',
    entityId: orderId,
    requestId: ctx.requestId,
    ip: ctx.ip,
    userAgent: ctx.userAgent,
  });
}
