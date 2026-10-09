import { describe, expect, it } from 'vitest';
import {
  activateAppUser,
  assertRoleDomain,
  createAppUser,
  IdentityError,
  linkExternalIdentity,
  revokeAuthSession,
  type AuthSession,
} from '../src/index.js';

const now = new Date('2026-10-09T00:00:00.000Z');

describe('identity domain', () => {
  it('creates a pending user and activates it after identity linking', () => {
    const user = createAppUser({ id: 'user-1', displayName: ' 财务用户 ' }, now);
    expect(user).toMatchObject({ status: 'pending_identity', displayName: '财务用户' });
    expect(activateAppUser(user, new Date('2026-10-09T00:01:00.000Z')).status).toBe('active');
  });

  it('normalizes HTTPS provider identities and rejects insecure issuers', () => {
    expect(linkExternalIdentity({ id: 'identity-1', userId: 'user-1', issuer: 'https://id.example.com/', subject: 'subject-1' }, now).issuer).toBe('https://id.example.com');
    expect(() => linkExternalIdentity({ id: 'identity-2', userId: 'user-1', issuer: 'http://id.example.com', subject: 'subject-2' }, now)).toThrow(IdentityError);
  });

  it('separates customer and operations role domains', () => {
    expect(() => assertRoleDomain('platform_admin', 'customer')).toThrow('customer');
    expect(() => assertRoleDomain('bookkeeper', 'operations')).toThrow('operations');
    expect(() => assertRoleDomain('tenant_owner', 'customer')).not.toThrow();
  });

  it('revokes a session once and preserves the first revocation evidence', () => {
    const session: AuthSession = {
      id: 'session-1', userId: 'user-1', providerSessionId: 'provider-session-1', issuer: 'https://id.example.com',
      authMethods: ['pwd', 'otp'], authenticatedAt: now, expiresAt: new Date('2026-10-09T01:00:00.000Z'), lastSeenAt: now,
    };
    const revoked = revokeAuthSession(session, { actorId: 'user-1', reason: 'user logout' }, new Date('2026-10-09T00:10:00.000Z'));
    expect(revoked).toMatchObject({ revokedBy: 'user-1', revocationReason: 'user logout' });
    expect(revokeAuthSession(revoked, { actorId: 'admin', reason: 'replace' }, new Date('2026-10-09T00:20:00.000Z'))).toBe(revoked);
  });
});
