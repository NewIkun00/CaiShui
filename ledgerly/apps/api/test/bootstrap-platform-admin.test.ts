import { describe, expect, it } from 'vitest';
import {
  bootstrapPlatformAdministrator,
  platformAdminBootstrapConfiguration,
  type PlatformAdminBootstrapClient,
} from '../src/infrastructure/database/bootstrap-platform-admin.js';

const userId = '30000000-0000-4000-8000-000000000001';
const occurredAt = new Date('2026-10-10T08:00:00.000Z');

class FakeClient implements PlatformAdminBootstrapClient {
  readonly queries: { text: string; values?: readonly unknown[] }[] = [];
  administrators = 0;
  userExists = true;
  failOn = '';

  query<T extends Record<string, unknown> = Record<string, unknown>>(
    text: string,
    values?: readonly unknown[],
  ): Promise<{ readonly rows: readonly T[] }> {
    this.queries.push({ text, ...(values ? { values } : {}) });
    if (this.failOn && text.includes(this.failOn))
      return Promise.reject(new Error('database failure'));
    if (text.includes('select count(*)')) {
      return Promise.resolve({ rows: [{ count: String(this.administrators) } as T] });
    }
    if (text.includes('select id from app_users')) {
      return Promise.resolve({ rows: this.userExists ? ([{ id: userId } as T] as const) : [] });
    }
    return Promise.resolve({ rows: [] });
  }
}

describe('platform administrator bootstrap', () => {
  it('requires the explicit one-time switch, a UUID and the database URL', () => {
    expect(() => platformAdminBootstrapConfiguration({}, userId)).toThrow(
      'ALLOW_PLATFORM_ADMIN_BOOTSTRAP=true',
    );
    expect(() =>
      platformAdminBootstrapConfiguration(
        { ALLOW_PLATFORM_ADMIN_BOOTSTRAP: 'true', DATABASE_URL: 'postgres://test' },
        'not-a-uuid',
      ),
    ).toThrow('active-user-uuid');
    expect(() =>
      platformAdminBootstrapConfiguration({ ALLOW_PLATFORM_ADMIN_BOOTSTRAP: 'true' }, userId),
    ).toThrow('DATABASE_URL is required');
  });

  it('rejects a second bootstrap and rolls back the transaction', async () => {
    const client = new FakeClient();
    client.administrators = 1;
    await expect(bootstrapPlatformAdministrator(client, userId)).rejects.toThrow('already exists');
    expect(client.queries.at(-1)?.text).toBe('rollback');
    expect(
      client.queries.some((query) => query.text.includes('insert into platform_role_assignments')),
    ).toBe(false);
  });

  it('rejects an inactive or missing target and rolls back', async () => {
    const client = new FakeClient();
    client.userExists = false;
    await expect(bootstrapPlatformAdministrator(client, userId)).rejects.toThrow(
      'existing active app user',
    );
    expect(client.queries.at(-1)?.text).toBe('rollback');
  });

  it('atomically writes the role, global audit event and tenantless outbox event', async () => {
    const client = new FakeClient();
    const ids = ['trace-id', 'audit-id', 'outbox-id'];
    const result = await bootstrapPlatformAdministrator(client, userId, {
      now: () => occurredAt,
      randomId: () => ids.shift()!,
    });
    expect(result).toEqual({ userId, traceId: 'bootstrap-trace-id', occurredAt });
    expect(client.queries[0]?.text).toBe('begin');
    expect(client.queries.at(-1)?.text).toBe('commit');
    const audit = client.queries.find((query) => query.text.includes('insert into audit_events'));
    const outbox = client.queries.find((query) => query.text.includes('insert into outbox_events'));
    expect(audit?.text).toContain('(id, tenant_id, actor_id');
    expect(audit?.text).toContain('values ($1, null, $2');
    expect(audit?.values).toContain('bootstrap-trace-id');
    expect(outbox?.text).toContain("values ($1, null, 'platform_role.bootstrapped.v1'");
    expect(outbox?.values).toEqual([
      'outbox-id',
      userId,
      JSON.stringify({ targetUserId: userId, role: 'platform_admin' }),
      occurredAt,
    ]);
  });

  it('rolls back every write when an audit or outbox insert fails', async () => {
    const client = new FakeClient();
    client.failOn = 'insert into outbox_events';
    await expect(
      bootstrapPlatformAdministrator(client, userId, {
        now: () => occurredAt,
        randomId: () => 'fixed-id',
      }),
    ).rejects.toThrow('database failure');
    expect(client.queries.at(-1)?.text).toBe('rollback');
    expect(client.queries.some((query) => query.text === 'commit')).toBe(false);
  });
});
