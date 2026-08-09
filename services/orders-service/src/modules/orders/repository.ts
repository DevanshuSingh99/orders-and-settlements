/**
 * Data access for orders and their line items. Every query is scoped with
 * `WHERE user_id = $userId` - never `findById` alone - so a user can never
 * read or modify another user's order by guessing/changing an id in the
 * URL (see docs/implementation-plan.md section 24, Authorization).
 */
import type { PoolClient } from 'pg';
import { pool } from '../../db/pool';
import { ORDER_STATUS_CASE_SQL } from '../../db/statusSql';
import type { ExportOrdersQuery, ListOrdersQuery } from './schemas';

export interface OrderRow {
  id: string;
  user_id: string;
  customer: string;
  due_date: string; // date, returned as 'YYYY-MM-DD' by pg
  total_cents: string; // bigint comes back as string from pg by default
  paid_amount_cents: string;
  created_at: Date;
  updated_at: Date;
}

export interface OrderRowWithStatus extends OrderRow {
  status: string;
}

export interface LineItemRow {
  id: string;
  order_id: string;
  description: string;
  quantity: number;
  unit_price_cents: string;
  line_total_cents: string;
}

export interface LineItemInput {
  description: string;
  quantity: number;
  unitPriceCents: number;
  lineTotalCents: number;
}

export async function withTransaction<T>(work: (client: PoolClient) => Promise<T>): Promise<T> {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const result = await work(client);
    await client.query('COMMIT');
    return result;
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}

export async function insertOrderWithLineItems(
  client: PoolClient,
  params: { userId: string; customer: string; dueDate: string; totalCents: number; lineItems: LineItemInput[] },
): Promise<OrderRow> {
  const { rows } = await client.query<OrderRow>(
    `INSERT INTO orders (user_id, customer, due_date, total_cents)
     VALUES ($1, $2, $3, $4)
     RETURNING *`,
    [params.userId, params.customer, params.dueDate, params.totalCents],
  );
  const order = rows[0];

  for (const item of params.lineItems) {
    await client.query(
      `INSERT INTO order_line_items (order_id, description, quantity, unit_price_cents, line_total_cents)
       VALUES ($1, $2, $3, $4, $5)`,
      [order.id, item.description, item.quantity, item.unitPriceCents, item.lineTotalCents],
    );
  }

  return order;
}

export async function findOrderForUser(userId: string, orderId: string): Promise<OrderRowWithStatus | null> {
  const { rows } = await pool.query<OrderRowWithStatus>(
    `SELECT *, ${ORDER_STATUS_CASE_SQL} AS status FROM orders WHERE id = $1 AND user_id = $2`,
    [orderId, userId],
  );
  return rows[0] ?? null;
}

export async function findLineItemsForOrder(orderId: string): Promise<LineItemRow[]> {
  const { rows } = await pool.query<LineItemRow>(
    'SELECT * FROM order_line_items WHERE order_id = $1 ORDER BY id',
    [orderId],
  );
  return rows;
}

export interface ListOrdersResult {
  orders: OrderRowWithStatus[];
  total: number;
}

/** Whitelist only — never interpolate raw client column names into ORDER BY. */
const SORT_COLUMNS: Record<ListOrdersQuery['sort'], string> = {
  createdAt_desc: 'created_at DESC',
  createdAt_asc: 'created_at ASC',
  customer_asc: 'customer ASC',
  customer_desc: 'customer DESC',
  status_asc: 'status ASC',
  status_desc: 'status DESC',
  total_asc: 'total_cents ASC',
  total_desc: 'total_cents DESC',
  paid_asc: 'paid_amount_cents ASC',
  paid_desc: 'paid_amount_cents DESC',
  due_asc: '(total_cents - paid_amount_cents) ASC',
  due_desc: '(total_cents - paid_amount_cents) DESC',
  dueDate_asc: 'due_date ASC',
  dueDate_desc: 'due_date DESC',
};

interface OrderListFilters {
  search?: string;
  dueDateFrom?: string;
  dueDateTo?: string;
  status?: string;
  sort: ListOrdersQuery['sort'];
}

function buildOrderListFilter(userId: string, query: OrderListFilters) {
  const conditions: string[] = ['user_id = $1'];
  const params: unknown[] = [userId];

  if (query.search) {
    params.push(`%${query.search}%`);
    conditions.push(`customer ILIKE $${params.length}`);
  }
  if (query.dueDateFrom) {
    params.push(query.dueDateFrom.slice(0, 10));
    conditions.push(`due_date >= $${params.length}`);
  }
  if (query.dueDateTo) {
    params.push(query.dueDateTo.slice(0, 10));
    conditions.push(`due_date <= $${params.length}`);
  }

  // Status is computed, not stored, so it cannot be filtered directly in
  // the outer WHERE clause (Postgres doesn't allow referencing a SELECT
  // alias there) - we wrap the base query in a subquery instead.
  const baseWhere = conditions.join(' AND ');
  let statusFilter = '';
  if (query.status) {
    params.push(query.status);
    statusFilter = `WHERE status = $${params.length}`;
  }

  return {
    baseWhere,
    statusFilter,
    params,
    orderBy: SORT_COLUMNS[query.sort],
  };
}

async function queryOrdersPage(
  userId: string,
  query: OrderListFilters,
  limit: number,
  offset: number,
): Promise<ListOrdersResult> {
  const { baseWhere, statusFilter, params, orderBy } = buildOrderListFilter(userId, query);

  const listParams = [...params, limit, offset];
  const { rows } = await pool.query<OrderRowWithStatus>(
    `SELECT * FROM (
       SELECT *, ${ORDER_STATUS_CASE_SQL} AS status FROM orders WHERE ${baseWhere}
     ) sub
     ${statusFilter}
     ORDER BY ${orderBy}
     LIMIT $${listParams.length - 1} OFFSET $${listParams.length}`,
    listParams,
  );

  const { rows: countRows } = await pool.query<{ count: string }>(
    `SELECT COUNT(*) FROM (
       SELECT *, ${ORDER_STATUS_CASE_SQL} AS status FROM orders WHERE ${baseWhere}
     ) sub
     ${statusFilter}`,
    params,
  );

  return { orders: rows, total: Number(countRows[0]?.count ?? 0) };
}

export async function listOrdersForUser(userId: string, query: ListOrdersQuery): Promise<ListOrdersResult> {
  const offset = (query.page - 1) * query.limit;
  return queryOrdersPage(userId, query, query.limit, offset);
}

/** Same filters as list, but uses explicit offset/limit for CSV export chunks. */
export async function exportOrdersForUser(userId: string, query: ExportOrdersQuery): Promise<ListOrdersResult> {
  return queryOrdersPage(userId, query, query.limit, query.offset);
}

export async function updateOrderMetadata(
  orderId: string,
  patch: { customer?: string; dueDate?: string },
): Promise<OrderRow> {
  const sets: string[] = [];
  const params: unknown[] = [];

  if (patch.customer !== undefined) {
    params.push(patch.customer);
    sets.push(`customer = $${params.length}`);
  }
  if (patch.dueDate !== undefined) {
    params.push(patch.dueDate);
    sets.push(`due_date = $${params.length}`);
  }
  sets.push('updated_at = now()');

  params.push(orderId);
  const { rows } = await pool.query<OrderRow>(
    `UPDATE orders SET ${sets.join(', ')} WHERE id = $${params.length} RETURNING *`,
    params,
  );
  return rows[0];
}

export async function replaceLineItems(
  client: PoolClient,
  orderId: string,
  lineItems: LineItemInput[],
  totalCents: number,
): Promise<OrderRow> {
  await client.query('DELETE FROM order_line_items WHERE order_id = $1', [orderId]);

  for (const item of lineItems) {
    await client.query(
      `INSERT INTO order_line_items (order_id, description, quantity, unit_price_cents, line_total_cents)
       VALUES ($1, $2, $3, $4, $5)`,
      [orderId, item.description, item.quantity, item.unitPriceCents, item.lineTotalCents],
    );
  }

  const { rows } = await client.query<OrderRow>(
    'UPDATE orders SET total_cents = $1, updated_at = now() WHERE id = $2 RETURNING *',
    [totalCents, orderId],
  );
  return rows[0];
}

export async function deleteOrderForUser(userId: string, orderId: string): Promise<boolean> {
  const { rowCount } = await pool.query('DELETE FROM orders WHERE id = $1 AND user_id = $2', [orderId, userId]);
  return (rowCount ?? 0) > 0;
}

export interface OrderSummary {
  totalOutstandingCents: number;
  totalCollectedCents: number;
  overdueCount: number;
  pendingCount: number;
}

export async function getSummaryForUser(userId: string): Promise<OrderSummary> {
  const { rows } = await pool.query<{
    total_outstanding: string;
    total_collected: string;
    overdue_count: string;
    pending_count: string;
  }>(
    `SELECT
       COALESCE(SUM(total_cents - paid_amount_cents), 0) AS total_outstanding,
       COALESCE(SUM(paid_amount_cents), 0) AS total_collected,
       COUNT(*) FILTER (WHERE status = 'overdue') AS overdue_count,
       COUNT(*) FILTER (WHERE status = 'pending') AS pending_count
     FROM (
       SELECT *, ${ORDER_STATUS_CASE_SQL} AS status FROM orders WHERE user_id = $1
     ) sub`,
    [userId],
  );

  const row = rows[0];
  return {
    totalOutstandingCents: Number(row?.total_outstanding ?? 0),
    totalCollectedCents: Number(row?.total_collected ?? 0),
    overdueCount: Number(row?.overdue_count ?? 0),
    pendingCount: Number(row?.pending_count ?? 0),
  };
}
