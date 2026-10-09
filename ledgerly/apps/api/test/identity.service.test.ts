import { beforeEach, describe, expect, it, vi } from 'vitest';
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
  beforeEach(() => vi.stubEnv('STORAGE_MODE', 'memory'));

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

  it('invites, accepts, lists and deactivates a company-scoped tenant member', async () => {
    const service = new IdentityService(new MemoryIdentityStore());
    const tenantId = '10000000-0000-4000-8000-000000000001';
    const companyId = '20000000-0000-4000-8000-000000000001';
    const ownerId = '30000000-0000-4000-8000-000000000001';
    await service.bootstrapOwner(tenantId, ownerId, companyId);
    const invitee = await service.establishVerifiedIdentity({
      ...principal,
      subject: 'invitee-subject',
      providerSessionId: 'invitee-session',
      displayName: '受邀成员',
    }, 'trace-login');
    const invited = await service.inviteMember(tenantId, {
      identifier: 'member@example.com',
      roles: ['bookkeeper'],
      companyIds: [companyId],
      expiresInHours: 48,
    }, { actorId: ownerId, tenantId, traceId: 'trace-invite' });
    expect(invited.invitation.identifierHint).toBe('m***@example.com');
    expect(invited.developmentToken).toBeDefined();
    const accepted = await service.acceptInvitation(invited.developmentToken!, {
      actorId: invitee.user.id,
      traceId: 'trace-accept',
    });
    expect(accepted).toMatchObject({ roles: ['bookkeeper'], companyIds: [companyId], status: 'active' });
    expect(await service.listMembers(tenantId, { actorId: ownerId, tenantId, traceId: 'trace-list' })).toHaveLength(2);
    const deactivated = await service.deactivateMember(tenantId, invitee.user.id, {
      expectedVersion: accepted.version,
      reason: '成员已离开企业',
    }, { actorId: ownerId, tenantId, traceId: 'trace-deactivate' });
    expect(deactivated.status).toBe('suspended');
  });

  it('enforces tenant administration and company scope boundaries', async () => {
    const service = new IdentityService(new MemoryIdentityStore());
    const tenantId = '10000000-0000-4000-8000-000000000002';
    const companyId = '20000000-0000-4000-8000-000000000002';
    const ownerId = '30000000-0000-4000-8000-000000000002';
    await service.bootstrapOwner(tenantId, ownerId, companyId);
    await expect(service.inviteMember(tenantId, {
      identifier: 'member@example.com', roles: ['member'],
      companyIds: ['20000000-0000-4000-8000-000000000099'], expiresInHours: 24,
    }, { actorId: ownerId, tenantId, traceId: 'trace-scope' })).rejects.toThrow('Company scope must belong to the tenant');
    await expect(service.listMembers(tenantId, {
      actorId: '30000000-0000-4000-8000-000000000099', tenantId, traceId: 'trace-denied',
    })).rejects.toThrow('Tenant not found');
    const administrator = await service.establishVerifiedIdentity({
      ...principal,
      subject: 'administrator-subject',
      providerSessionId: 'administrator-session',
      displayName: '租户管理员',
    }, 'trace-admin-login');
    const administratorInvitation = await service.inviteMember(tenantId, {
      identifier: 'admin@example.com', roles: ['tenant_admin'], companyIds: [companyId], expiresInHours: 24,
    }, { actorId: ownerId, tenantId, traceId: 'trace-admin-invite' });
    await service.acceptInvitation(administratorInvitation.developmentToken!, {
      actorId: administrator.user.id, traceId: 'trace-admin-accept',
    });
    await expect(service.deactivateMember(tenantId, ownerId, {
      expectedVersion: 1, reason: '不能停用最后所有者',
    }, { actorId: administrator.user.id, tenantId, traceId: 'trace-last-owner' })).rejects.toThrow('The last tenant owner cannot be deactivated');
    await expect(service.deactivateMember(tenantId, ownerId, {
      expectedVersion: 1, reason: '不允许停用自己',
    }, { actorId: ownerId, tenantId, traceId: 'trace-self' })).rejects.toThrow('Administrators cannot deactivate themselves');
  });

  it('governs platform roles with administrator separation and optimistic revocation', async () => {
    const store = new MemoryIdentityStore();
    const service = new IdentityService(store);
    const administrator = await service.establishVerifiedIdentity({
      ...principal, subject: 'platform-admin', providerSessionId: 'platform-admin-session', displayName: '平台管理员',
    }, 'trace-admin');
    const target = await service.establishVerifiedIdentity({
      ...principal, subject: 'operations-user', providerSessionId: 'operations-session', displayName: '运营用户',
    }, 'trace-target');
    store.setOperationsRoles(administrator.user.id, ['platform_admin']);
    const assigned = await service.assignOperationsRole({ userId: target.user.id, role: 'rule_editor' }, {
      actorId: administrator.user.id, traceId: 'trace-assign',
    });
    expect(assigned).toMatchObject({ role: 'rule_editor', status: 'active', version: 1 });
    expect(await service.listOperationsRoleAssignments({ actorId: administrator.user.id, traceId: 'trace-list' })).toHaveLength(1);
    await expect(service.assignOperationsRole({ userId: administrator.user.id, role: 'security_auditor' }, {
      actorId: administrator.user.id, traceId: 'trace-self',
    })).rejects.toThrow('cannot grant roles to themselves');
    const revoked = await service.revokeOperationsRole(target.user.id, 'rule_editor', {
      expectedVersion: assigned.version, reason: '职责调整，撤销规则编辑权限',
    }, { actorId: administrator.user.id, traceId: 'trace-revoke' });
    expect(revoked).toMatchObject({ status: 'removed', version: 2 });
    expect(await store.listOperationsRoles(target.user.id)).not.toContain('rule_editor');
  });

  it('does not revoke the final tracked platform administrator', async () => {
    const store = new MemoryIdentityStore();
    const service = new IdentityService(store);
    const actor = await service.establishVerifiedIdentity({
      ...principal, subject: 'seed-admin', providerSessionId: 'seed-admin-session', displayName: '种子管理员',
    }, 'trace-seed');
    const target = await service.establishVerifiedIdentity({
      ...principal, subject: 'last-admin', providerSessionId: 'last-admin-session', displayName: '最后管理员',
    }, 'trace-target');
    store.setOperationsRoles(actor.user.id, ['platform_admin']);
    const tracked = await store.assignOperationsRole({
      userId: target.user.id, role: 'platform_admin', actorId: actor.user.id,
      traceId: 'trace-bootstrap', occurredAt: new Date(),
    });
    await expect(service.revokeOperationsRole(target.user.id, 'platform_admin', {
      expectedVersion: tracked!.version, reason: '尝试撤销最后管理员',
    }, { actorId: actor.user.id, traceId: 'trace-last-admin' })).rejects.toThrow('last active platform administrator');
  });
});
