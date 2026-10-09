import { Injectable } from '@nestjs/common';
import {
  activateAppUser,
  createAppUser,
  linkExternalIdentity,
  revokeAuthSession,
  type AppUser,
  type AuthSession,
  type ExternalIdentity,
} from '@ledgerly/domain';
import type {
  EstablishedIdentity,
  AcceptInvitationRecord,
  AuthenticatedSession,
  CreateInvitationRecord,
  DeactivateMemberRecord,
  EstablishIdentityRecord,
  IdentityStore,
  LoginStateRecord,
  RevokeIdentitySessionRecord,
  SavedTenantInvitation,
  SavedTenantMember,
} from '../application/identity-store.js';

@Injectable()
export class MemoryIdentityStore implements IdentityStore {
  private readonly users = new Map<string, AppUser>();
  private readonly identities = new Map<string, ExternalIdentity>();
  private readonly sessions = new Map<string, AuthSession>();
  private readonly invitations = new Map<string, SavedTenantInvitation>();
  private readonly members = new Map<string, SavedTenantMember>();
  private readonly companies = new Map<string, Set<string>>();
  private readonly loginStates = new Map<string, LoginStateRecord & { consumedAt?: Date }>();

  establish(record: EstablishIdentityRecord): Promise<EstablishedIdentity> {
    const identityKey = this.identityKey(record.principal.issuer, record.principal.subject);
    const existingIdentity = this.identities.get(identityKey);
    const existingUser = existingIdentity ? this.users.get(existingIdentity.userId) : undefined;
    const created = !existingIdentity;
    const user = existingUser ?? activateAppUser(
      createAppUser({ id: record.userId, displayName: record.principal.displayName }, record.occurredAt),
      record.occurredAt,
    );
    const identity = existingIdentity ?? linkExternalIdentity({
      id: record.identityId,
      userId: user.id,
      issuer: record.principal.issuer,
      subject: record.principal.subject,
      ...(record.principal.identifierHint ? { identifierHint: record.principal.identifierHint } : {}),
    }, record.occurredAt);
    const session: AuthSession = Object.freeze({
      id: record.sessionId,
      userId: user.id,
      providerSessionId: record.principal.providerSessionId,
      issuer: identity.issuer,
      authMethods: [...record.principal.authMethods],
      authenticatedAt: record.principal.authenticatedAt,
      expiresAt: record.principal.expiresAt,
      lastSeenAt: record.occurredAt,
    });
    this.users.set(user.id, user);
    this.identities.set(identityKey, { ...identity, lastAuthenticatedAt: record.occurredAt });
    this.sessions.set(session.id, session);
    return Promise.resolve({ user, identity: this.identities.get(identityKey)!, session, created });
  }

  findSession(userId: string, sessionId: string): Promise<AuthSession | null> {
    const session = this.sessions.get(sessionId);
    return Promise.resolve(session?.userId === userId ? session : null);
  }

  revokeSession(record: RevokeIdentitySessionRecord): Promise<AuthSession | null> {
    const current = this.sessions.get(record.sessionId);
    if (!current || current.userId !== record.userId) return Promise.resolve(null);
    const revoked = revokeAuthSession(current, { actorId: record.actorId, reason: record.reason }, record.occurredAt);
    this.sessions.set(record.sessionId, revoked);
    return Promise.resolve(revoked);
  }

  findAuthenticatedSession(sessionId: string, now: Date): Promise<AuthenticatedSession | null> {
    const session = this.sessions.get(sessionId);
    if (!session || session.revokedAt || session.expiresAt <= now) return Promise.resolve(null);
    const user = this.users.get(session.userId);
    if (!user || user.status !== 'active') return Promise.resolve(null);
    return Promise.resolve({ user, session });
  }

  listMembershipsForUser(userId: string): Promise<readonly SavedTenantMember[]> {
    return Promise.resolve([...this.members.values()].filter((member) => member.userId === userId && member.status === 'active'));
  }

  createLoginState(record: LoginStateRecord): Promise<void> {
    this.loginStates.set(record.stateHash, Object.freeze({ ...record }));
    return Promise.resolve();
  }

  consumeLoginState(stateHash: string, occurredAt: Date): Promise<boolean> {
    const current = this.loginStates.get(stateHash);
    if (!current || current.consumedAt || current.expiresAt <= occurredAt) return Promise.resolve(false);
    this.loginStates.set(stateHash, Object.freeze({ ...current, consumedAt: occurredAt }));
    return Promise.resolve(true);
  }

  bootstrapOwner(tenantId: string, userId: string, companyId: string, occurredAt: Date): Promise<void> {
    if (!this.users.has(userId)) {
      this.users.set(userId, activateAppUser(createAppUser({ id: userId, displayName: '初始所有者' }, occurredAt), occurredAt));
    }
    const key = this.memberKey(tenantId, userId);
    const current = this.members.get(key);
    this.members.set(key, current ?? {
      tenantId, userId, displayName: this.users.get(userId)!.displayName, status: 'active',
      roles: ['tenant_owner'], companyIds: [companyId], version: 1, activatedAt: occurredAt,
    });
    const companyIds = this.companies.get(tenantId) ?? new Set<string>();
    companyIds.add(companyId);
    this.companies.set(tenantId, companyIds);
    return Promise.resolve();
  }

  findMember(tenantId: string, userId: string): Promise<SavedTenantMember | null> {
    return Promise.resolve(this.members.get(this.memberKey(tenantId, userId)) ?? null);
  }

  listMembers(tenantId: string): Promise<readonly SavedTenantMember[]> {
    return Promise.resolve([...this.members.values()].filter((member) => member.tenantId === tenantId));
  }

  companyScopeExists(tenantId: string, companyIds: readonly string[]): Promise<boolean> {
    const known = this.companies.get(tenantId) ?? new Set<string>();
    return Promise.resolve(companyIds.every((companyId) => known.has(companyId)));
  }

  createInvitation(record: CreateInvitationRecord): Promise<SavedTenantInvitation> {
    this.invitations.set(record.invitation.id, Object.freeze({ ...record.invitation }));
    return Promise.resolve(record.invitation);
  }

  findInvitationByTokenHash(tokenHash: string): Promise<SavedTenantInvitation | null> {
    return Promise.resolve([...this.invitations.values()].find((invitation) => invitation.tokenHash === tokenHash) ?? null);
  }

  acceptInvitation(record: AcceptInvitationRecord): Promise<SavedTenantMember | null> {
    const invitation = this.invitations.get(record.invitationId);
    const user = this.users.get(record.userId);
    if (!invitation || invitation.status !== 'pending' || invitation.version !== record.expectedVersion || !user || user.status !== 'active') {
      return Promise.resolve(null);
    }
    if (this.members.has(this.memberKey(invitation.tenantId, record.userId))) return Promise.resolve(null);
    const member: SavedTenantMember = Object.freeze({
      tenantId: invitation.tenantId, userId: record.userId, displayName: user.displayName, status: 'active',
      roles: [...invitation.roles], companyIds: [...invitation.companyIds], version: 1, activatedAt: record.occurredAt,
    });
    this.members.set(this.memberKey(member.tenantId, member.userId), member);
    this.invitations.set(invitation.id, Object.freeze({ ...invitation, status: 'accepted', version: invitation.version + 1 }));
    return Promise.resolve(member);
  }

  deactivateMember(record: DeactivateMemberRecord): Promise<SavedTenantMember | null> {
    const key = this.memberKey(record.tenantId, record.userId);
    const current = this.members.get(key);
    if (!current || current.status !== 'active' || current.version !== record.expectedVersion) return Promise.resolve(null);
    const changed: SavedTenantMember = Object.freeze({
      ...current, status: 'suspended', version: current.version + 1, deactivatedAt: record.occurredAt,
    });
    this.members.set(key, changed);
    return Promise.resolve(changed);
  }

  private identityKey(issuer: string, subject: string) {
    return `${issuer.replace(/\/$/, '')}:${subject}`;
  }

  private memberKey(tenantId: string, userId: string) {
    return `${tenantId}:${userId}`;
  }
}
