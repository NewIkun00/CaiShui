import { randomUUID } from 'node:crypto';
import { Pool } from 'pg';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

async function main() {
  const userId = process.argv[2];
  const connectionString = process.env['DATABASE_URL'];
  if (process.env['ALLOW_PLATFORM_ADMIN_BOOTSTRAP'] !== 'true') {
    throw new Error('Set ALLOW_PLATFORM_ADMIN_BOOTSTRAP=true for this one-time controlled operation');
  }
  if (!userId || !UUID.test(userId)) throw new Error('Usage: pnpm identity:seed-admin <active-user-uuid>');
  if (!connectionString) throw new Error('DATABASE_URL is required');
  const pool = new Pool({ connectionString, max: 1 });
  const client = await pool.connect();
  try {
    await client.query('begin');
    await client.query("select pg_advisory_xact_lock(hashtext('ledgerly.platform-role-governance'))");
    const administrators = await client.query<{ count: string }>(
      `select count(*)::text as count
       from platform_role_assignments pra
       join app_users au on au.id = pra.user_id
       where pra.role = 'platform_admin' and pra.status = 'active' and au.status = 'active'`,
    );
    if (Number(administrators.rows[0]?.count ?? '0') > 0) {
      throw new Error('An active platform administrator already exists; use the governed API instead');
    }
    const user = await client.query<{ id: string }>("select id from app_users where id = $1 and status = 'active'", [userId]);
    if (!user.rows[0]) throw new Error('Target must be an existing active app user');
    const occurredAt = new Date();
    await client.query(
      `insert into platform_role_assignments
       (user_id, role, status, version, created_at, created_by, updated_at, updated_by)
       values ($1, 'platform_admin', 'active', 1, $2, $1, $2, $1)
       on conflict (user_id, role) do update set
         status = 'active', version = platform_role_assignments.version + 1, updated_at = $2, updated_by = $1`,
      [userId, occurredAt],
    );
    const traceId = `bootstrap-${randomUUID()}`;
    await client.query(
      `insert into audit_events
       (id, actor_id, action, resource_type, resource_id, outcome, trace_id, metadata, occurred_at)
       values ($1, $2, 'platform_role.bootstrap', 'platform_role_assignment', $2, 'success', $3, $4::jsonb, $5)`,
      [randomUUID(), userId, traceId, JSON.stringify({ targetUserId: userId, role: 'platform_admin' }), occurredAt],
    );
    await client.query(
      `insert into outbox_events
       (id, tenant_id, event_type, aggregate_type, aggregate_id, payload, occurred_at)
       values ($1, null, 'platform_role.bootstrapped.v1', 'platform_role_assignment', $2, $3::jsonb, $4)`,
      [randomUUID(), userId, JSON.stringify({ targetUserId: userId, role: 'platform_admin' }), occurredAt],
    );
    await client.query('commit');
    process.stdout.write(`Platform administrator bootstrapped for ${userId}\n`);
  } catch (error) {
    await client.query('rollback');
    throw error;
  } finally {
    client.release();
    await pool.end();
  }
}

void main().catch((error: unknown) => {
  process.stderr.write(`${error instanceof Error ? error.message : 'Platform administrator bootstrap failed'}\n`);
  process.exitCode = 1;
});
