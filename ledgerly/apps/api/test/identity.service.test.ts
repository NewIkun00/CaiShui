import { describe, expect, it } from 'vitest';
import { IdentityService } from '../src/modules/identity/application/identity.service.js';
import { MemoryIdentityStore } from '../src/modules/identity/infrastructure/memory-identity.store.js';

const principal = {
  issuer: 'https://identity.example.com',
  subject: 'subject-1',
  providerSessionId: 'provider-session-1',
  displayName: '测试用户',
  authMethods: ['pwd', 'otp'] as const,
  authenticatedAt: new Date('2026-10-09T00:00:00.000Z'),
  expiresAt: new Date('2026-10-09T01:00:00.000Z'),
};

describe('identity service', () => {
  it('links repeated provider subjects to one local user and opens sessions', async () => {
    const service = new IdentityService(new MemoryIdentityStore());
    const first = await service.establishVerifiedIdentity(principal, 'trace-1');
    const second = await service.establishVerifiedIdentity({ ...principal, providerSessionId: 'provider-session-2' }, 'trace-2');
    expect(first.created).toBe(true);
    expect(second.created).toBe(false);
    expect(second.user.id).toBe(first.user.id);
  });

  it('revokes only the current user session and keeps revocation idempotent', async () => {
    const service = new IdentityService(new MemoryIdentityStore());
    const established = await service.establishVerifiedIdentity(principal, 'trace-1');
    const revoked = await service.revokeOwnSession(established.user.id, established.session.id, 'logout', 'trace-2');
    expect(revoked.revocationReason).toBe('logout');
    await expect(service.revokeOwnSession('00000000-0000-4000-8000-000000000001', established.session.id, 'logout', 'trace-3')).rejects.toThrow('Session not found');
  });
});
