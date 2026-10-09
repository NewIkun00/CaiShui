import { Inject, Injectable } from '@nestjs/common';
import { activateAppUser, createAppUser, type AppUser, type AuthMethod, type AuthSession, type ExternalIdentity } from '@ledgerly/domain';
import { and, eq } from 'drizzle-orm';
import { randomUUID } from 'node:crypto';
import { DATABASE, type Database } from '../../../infrastructure/database/database.provider.js';
import { appUsers, auditEvents, authSessions, externalIdentities } from '../../../infrastructure/database/schema.js';
import type {
  EstablishedIdentity,
  EstablishIdentityRecord,
  IdentityStore,
  RevokeIdentitySessionRecord,
} from '../application/identity-store.js';

@Injectable()
export class PostgresIdentityStore implements IdentityStore {
  constructor(@Inject(DATABASE) private readonly db: Database) {}

  establish(record: EstablishIdentityRecord): Promise<EstablishedIdentity> {
    return this.db.transaction(async (tx) => {
      const [existingIdentity] = await tx.select().from(externalIdentities).where(and(
        eq(externalIdentities.issuer, record.principal.issuer.replace(/\/$/, '')),
        eq(externalIdentities.subject, record.principal.subject),
      )).limit(1);
      let created = false;
      let userId: string;
      if (!existingIdentity) {
        created = true;
        userId = record.userId;
        const user = activateAppUser(createAppUser({ id: userId, displayName: record.principal.displayName }, record.occurredAt), record.occurredAt);
        await tx.insert(appUsers).values({
          id: user.id, status: user.status, displayName: user.displayName,
          createdAt: user.createdAt, createdBy: user.id, updatedAt: user.updatedAt, updatedBy: user.id,
        });
        await tx.insert(externalIdentities).values({
          id: record.identityId, userId, issuer: record.principal.issuer.replace(/\/$/, ''), subject: record.principal.subject,
          ...(record.principal.identifierHint ? { identifierHint: record.principal.identifierHint } : {}),
          linkedAt: record.occurredAt, lastAuthenticatedAt: record.occurredAt,
        });
      } else {
        userId = existingIdentity.userId;
        await tx.update(externalIdentities).set({ lastAuthenticatedAt: record.occurredAt }).where(eq(externalIdentities.id, existingIdentity.id));
      }
      const [userRow] = await tx.select().from(appUsers).where(eq(appUsers.id, userId)).limit(1);
      if (!userRow || userRow.status !== 'active') throw new Error('Authenticated user is not active');
      const [sessionRow] = await tx.insert(authSessions).values({
        id: record.sessionId, userId, issuer: record.principal.issuer.replace(/\/$/, ''),
        providerSessionId: record.principal.providerSessionId, authMethods: [...record.principal.authMethods],
        authenticatedAt: record.principal.authenticatedAt, expiresAt: record.principal.expiresAt, lastSeenAt: record.occurredAt,
      }).onConflictDoUpdate({
        target: [authSessions.issuer, authSessions.providerSessionId],
        set: { lastSeenAt: record.occurredAt, expiresAt: record.principal.expiresAt, authMethods: [...record.principal.authMethods] },
      }).returning();
      if (!sessionRow) throw new Error('Identity session was not persisted');
      await tx.insert(auditEvents).values({
        id: randomUUID(), actorId: userId, action: created ? 'identity.first_login' : 'identity.login',
        resourceType: 'auth_session', resourceId: sessionRow.id, outcome: 'success', traceId: record.traceId,
        metadata: { issuer: record.principal.issuer, authMethods: record.principal.authMethods },
      });
      const [identityRow] = await tx.select().from(externalIdentities).where(and(
        eq(externalIdentities.issuer, record.principal.issuer.replace(/\/$/, '')),
        eq(externalIdentities.subject, record.principal.subject),
      )).limit(1);
      if (!identityRow) throw new Error('Identity was not persisted');
      return { user: this.user(userRow), identity: this.identity(identityRow), session: this.session(sessionRow), created };
    });
  }

  async findSession(userId: string, sessionId: string): Promise<AuthSession | null> {
    const [row] = await this.db.select().from(authSessions).where(and(eq(authSessions.id, sessionId), eq(authSessions.userId, userId))).limit(1);
    return row ? this.session(row) : null;
  }

  revokeSession(record: RevokeIdentitySessionRecord): Promise<AuthSession | null> {
    return this.db.transaction(async (tx) => {
      const [row] = await tx.update(authSessions).set({
        revokedAt: record.occurredAt, revokedBy: record.actorId, revocationReason: record.reason,
      }).where(and(eq(authSessions.id, record.sessionId), eq(authSessions.userId, record.userId))).returning();
      if (!row) return null;
      await tx.insert(auditEvents).values({
        id: randomUUID(), actorId: record.actorId, action: 'identity.session.revoke', resourceType: 'auth_session',
        resourceId: record.sessionId, outcome: 'success', traceId: record.traceId, metadata: { reason: record.reason },
      });
      return this.session(row);
    });
  }

  private user(row: typeof appUsers.$inferSelect): AppUser {
    return { id: row.id, status: row.status as AppUser['status'], displayName: row.displayName, createdAt: row.createdAt, updatedAt: row.updatedAt, ...(row.disabledAt ? { disabledAt: row.disabledAt } : {}) };
  }
  private identity(row: typeof externalIdentities.$inferSelect): ExternalIdentity {
    return { id: row.id, userId: row.userId, issuer: row.issuer, subject: row.subject, linkedAt: row.linkedAt, ...(row.identifierHint ? { identifierHint: row.identifierHint } : {}), ...(row.lastAuthenticatedAt ? { lastAuthenticatedAt: row.lastAuthenticatedAt } : {}) };
  }
  private session(row: typeof authSessions.$inferSelect): AuthSession {
    return { id: row.id, userId: row.userId, issuer: row.issuer, providerSessionId: row.providerSessionId, authMethods: row.authMethods as readonly AuthMethod[], authenticatedAt: row.authenticatedAt, expiresAt: row.expiresAt, lastSeenAt: row.lastSeenAt, ...(row.revokedAt ? { revokedAt: row.revokedAt } : {}), ...(row.revokedBy ? { revokedBy: row.revokedBy } : {}), ...(row.revocationReason ? { revocationReason: row.revocationReason } : {}) };
  }
}
