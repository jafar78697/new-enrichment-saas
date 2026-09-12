type Queryable = {
  query: (sql: string, params?: unknown[]) => Promise<unknown>;
};

type AuditLogEvent = {
  tenantId: string;
  actorUserId?: string | null;
  actorRole?: string | null;
  action: string;
  resource: string;
  targetId?: string | null;
  details?: Record<string, unknown> | null;
};

/**
 * Production has the legacy audit_logs shape while fresh SaaS installs use the
 * newer shape. Keep audit logging compatible with both outside business
 * transactions, so an optional audit write can never roll back a customer.
 */
export async function recordAuditLog(db: Queryable, event: AuditLogEvent): Promise<void> {
  const metadata = JSON.stringify({
    actor_role: event.actorRole ?? null,
    target_id: event.targetId ?? null,
    details: event.details ?? null,
  });

  try {
    await db.query(
      `INSERT INTO audit_logs (tenant_id, user_id, action, resource, metadata)
       VALUES ($1, $2, $3, $4, $5)`,
      [event.tenantId, event.actorUserId ?? null, event.action, event.resource, metadata]
    );
  } catch (error: any) {
    // SQLSTATE 42703 means this is a fresh SaaS audit_logs table.
    if (error?.code !== '42703') throw error;

    await db.query(
      `INSERT INTO audit_logs (tenant_id, actor_user_id, actor_role, action, target_type, target_id, details)
       VALUES ($1, $2, $3, $4, $5, $6, $7)`,
      [
        event.tenantId,
        event.actorUserId ?? null,
        event.actorRole ?? null,
        event.action,
        event.resource,
        event.targetId ?? null,
        event.details ? JSON.stringify(event.details) : null,
      ]
    );
  }
}
