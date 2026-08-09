/**
 * Request validation for the orders module. The server NEVER trusts a
 * client-supplied total - only `description`, `quantity`, and `unitPrice`
 * are accepted per line item, and the total is always computed server-side
 * (see service.ts / @oas/shared-domain calculateOrderTotalCents).
 */
import { z } from 'zod';
import { ORDER_STATUSES } from '@oas/shared-domain';

const lineItemSchema = z.object({
  description: z.string().trim().min(1, 'Line item description is required.'),
  quantity: z.number().int('Quantity must be a whole number.').min(1, 'Quantity must be at least 1.'),
  unitPrice: z.number().min(0, 'Unit price cannot be negative.'),
});

export const createOrderSchema = z.object({
  customer: z.string().trim().min(1, 'Customer name is required.'),
  dueDate: z.string().refine((value) => !Number.isNaN(Date.parse(value)), 'A valid due date is required.'),
  lineItems: z.array(lineItemSchema).min(1, 'At least one line item is required.'),
});

/**
 * customer/dueDate are always editable metadata. lineItems are only
 * accepted here at the schema level; the service layer additionally
 * rejects them once the order has any payments (ORDER_NOT_EDITABLE) - see
 * docs/implementation-plan.md section 14.
 */
export const updateOrderSchema = z
  .object({
    customer: z.string().trim().min(1).optional(),
    dueDate: z
      .string()
      .refine((value) => !Number.isNaN(Date.parse(value)), 'A valid due date is required.')
      .optional(),
    lineItems: z.array(lineItemSchema).min(1, 'At least one line item is required.').optional(),
  })
  .refine((data) => Object.keys(data).length > 0, { message: 'At least one field must be provided.' });

const orderSortSchema = z.enum([
  'createdAt_desc',
  'createdAt_asc',
  'customer_asc',
  'customer_desc',
  'status_asc',
  'status_desc',
  'total_asc',
  'total_desc',
  'paid_asc',
  'paid_desc',
  'due_asc',
  'due_desc',
  'dueDate_asc',
  'dueDate_desc',
]);

const isoDateSchema = z.string().refine((v) => !Number.isNaN(Date.parse(v)), 'Invalid date');

export const listOrdersQuerySchema = z.object({
  status: z.enum(ORDER_STATUSES as [string, ...string[]]).optional(),
  search: z.string().trim().min(1).optional(),
  dueDateFrom: isoDateSchema.optional(),
  dueDateTo: isoDateSchema.optional(),
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(10).max(50).default(10),
  sort: orderSortSchema.default('createdAt_desc'),
});

/**
 * CSV export query. Due-date range is required; per-request limit is capped
 * at 10_000 with offset-based continuation (see export controller headers).
 */
export const exportOrdersQuerySchema = z
  .object({
    dueDateFrom: isoDateSchema,
    dueDateTo: isoDateSchema,
    status: z.enum(ORDER_STATUSES as [string, ...string[]]).optional(),
    search: z.string().trim().min(1).optional(),
    sort: orderSortSchema.default('createdAt_desc'),
    offset: z.coerce.number().int().min(0).default(0),
    limit: z.coerce.number().int().min(1).max(10_000).default(10_000),
  })
  .refine((data) => data.dueDateFrom.slice(0, 10) <= data.dueDateTo.slice(0, 10), {
    message: 'dueDateFrom must be on or before dueDateTo.',
    path: ['dueDateFrom'],
  });

export type CreateOrderInput = z.infer<typeof createOrderSchema>;
export type UpdateOrderInput = z.infer<typeof updateOrderSchema>;
export type ListOrdersQuery = z.infer<typeof listOrdersQuerySchema>;
export type ExportOrdersQuery = z.infer<typeof exportOrdersQuerySchema>;
