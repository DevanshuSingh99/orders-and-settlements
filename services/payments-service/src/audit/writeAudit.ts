/** Append-only audit log writer for payments-service. See auth-service's equivalent for the full rationale. */
import type { PoolClient } from 'pg';
import type { AuditActionType, AuditEntityType } from '@oas/shared-domain';
import { pool } from '../db/pool';

export interface WriteAuditParams {
  actorId: string | null;
  action: AuditActionType;
  entityType: AuditEntityType;
  entityId: string | null;
  requestId?: string;
  metadata?: Record<string, unknown>;
  ip?: string;
  userAgent?: string;
}

export async function writeAudit(params: WriteAuditParams, client: PoolClient | typeof pool = pool): Promise<void> {
  await client.query(
    `INSERT INTO audit_logs (actor_id, action, entity_type, entity_id, request_id, metadata, ip, user_agent)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
    [
      params.actorId,
      params.action,
      params.entityType,
      params.entityId,
      params.requestId ?? null,
      JSON.stringify(params.metadata ?? {}),
      params.ip ?? null,
      params.userAgent ?? null,
    ],
  );
}
