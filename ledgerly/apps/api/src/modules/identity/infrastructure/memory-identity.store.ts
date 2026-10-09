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
  EstablishIdentityRecord,
  IdentityStore,
  RevokeIdentitySessionRecord,
} from '../application/identity-store.js';

@Injectable()
export class MemoryIdentityStore implements IdentityStore {
  private readonly users = new Map<string, AppUser>();
  private readonly identities = new Map<string, ExternalIdentity>();
  private readonly sessions = new Map<string, AuthSession>();

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

  private identityKey(issuer: string, subject: string) {
    return `${issuer.replace(/\/$/, '')}:${subject}`;
  }
}
