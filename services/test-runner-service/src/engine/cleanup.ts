import { query } from '../db/pool';
import { logger } from '../config/logger';

/**
 * Deletes ephemeral run data by user id (and optional email prefix match).
 * Order: refunds/payments → line items/orders → audit logs → auth.users.
 */
export async function cleanupUsers(params: {
  userIds: string[];
  emailPrefixes?: string[];
}): Promise<void> {
  const userIds = [...new Set(params.userIds.filter(Boolean))];
  const emailPrefixes = params.emailPrefixes ?? [];

  try {
    if (emailPrefixes.length > 0) {
      const likePatterns = emailPrefixes.map((p) => `${p}%`);
      const found = await query<{ id: string }>(
        `SELECT id::text AS id FROM auth.users WHERE email LIKE ANY($1::text[])`,
        [likePatterns],
      );
      for (const row of found.rows) {
        userIds.push(row.id);
      }
    }

    const ids = [...new Set(userIds)];
    if (ids.length === 0) return;

    await query(`DELETE FROM payments.refunds WHERE user_id = ANY($1::uuid[])`, [ids]);
    await query(`DELETE FROM payments.payments WHERE user_id = ANY($1::uuid[])`, [ids]);
    await query(`DELETE FROM payments.audit_logs WHERE actor_id = ANY($1::uuid[])`, [ids]);

    await query(
      `DELETE FROM orders.order_line_items
       WHERE order_id IN (SELECT id FROM orders.orders WHERE user_id = ANY($1::uuid[]))`,
      [ids],
    );
    await query(`DELETE FROM orders.orders WHERE user_id = ANY($1::uuid[])`, [ids]);
    await query(`DELETE FROM orders.audit_logs WHERE actor_id = ANY($1::uuid[])`, [ids]);

    await query(`DELETE FROM auth.audit_logs WHERE actor_id = ANY($1::uuid[])`, [ids]);
    await query(`DELETE FROM auth.users WHERE id = ANY($1::uuid[])`, [ids]);
  } catch (err) {
    logger.error({ err, userIds, emailPrefixes }, 'Cleanup failed');
  }
}
