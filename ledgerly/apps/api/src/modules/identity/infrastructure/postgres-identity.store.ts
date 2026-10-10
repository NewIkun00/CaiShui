import { Inject, Injectable } from '@nestjs/common';
import { activateAppUser, createAppUser, type AppUser, type AuthMethod, type AuthSession, type ExternalIdentity, type OperationsRole } from '@ledgerly/domain';
import { and, eq, gt, inArray, isNull, sql } from 'drizzle-orm';
import { randomUUID } from 'node:crypto';
import { DATABASE, type Database } from '../../../infrastructure/database/database.provider.js';
import {
  appUsers,
  auditEvents,
  authSessions,
  companies,
  externalIdentities,
  outboxEvents,
  oidcLoginStates,
  platformRoleAssignments,
  tenantInvitations,
  tenantMemberRoles,
  tenantMembers,
} from '../../../infrastructure/database/schema.js';
import type {
  AcceptInvitationRecord,
  AssignOperationsRoleRecord,
  AuthenticatedSession,
  CreateInvitationRecord,
  DeactivateMemberRecord,
  EstablishedIdentity,
  EstablishIdentityRecord,
  IdentityStore,
  LoginStateRecord,
  RevokeIdentitySessionRecord,
  RevokeOperationsRoleRecord,
  RevokeOperationsRoleResult,
  SavedOperationsRoleAssignment,
  SavedTenantInvitation,
  SavedTenantMember,
} from '../application/identity-store.js';

@Injectable()
export class PostgresIdentityStore implements IdentityStore {
  constructor(@Inject(DATABASE) private readonly db: Database) {}

  async listOperationsRoles(userId: string): Promise<readonly OperationsRole[]> {
    const rows = await this.db.select({ role: platformRoleAssignments.role }).from(platformRoleAssignments).where(and(
      eq(platformRoleAssignments.userId, userId), eq(platformRoleAssignments.status, 'active'),
    ));
    return rows.map((row) => row.role as OperationsRole);
  }

  async listOperationsRoleAssignments(): Promise<readonly SavedOperationsRoleAssignment[]> {
    const rows = await this.db.select().from(platformRoleAssignments);
    return Promise.all(rows.map(async (row) => {
      const [user] = await this.db.select().from(appUsers).where(eq(appUsers.id, row.userId)).limit(1);
      if (!user) throw new Error('Operations role user is unavailable');
      return this.operationsAssignment(row, user.displayName);
    }));
  }

  assignOperationsRole(record: AssignOperationsRoleRecord): Promise<SavedOperationsRoleAssignment | null> {
    return this.db.transaction(async (tx) => {
      await tx.execute(sql`select pg_advisory_xact_lock(hashtext('ledgerly.platform-role-governance'))`);
      const [user] = await tx.select().from(appUsers).where(and(eq(appUsers.id, record.userId), eq(appUsers.status, 'active'))).limit(1);
      if (!user) return null;
      const [current] = await tx.select().from(platformRoleAssignments).where(and(
        eq(platformRoleAssignments.userId, record.userId), eq(platformRoleAssignments.role, record.role),
      )).limit(1);
      if (current?.status === 'active') return this.operationsAssignment(current, user.displayName);
      const [assignment] = current
        ? await tx.update(platformRoleAssignments).set({
          status: 'active', version: current.version + 1, updatedAt: record.occurredAt, updatedBy: record.actorId,
        }).where(and(
          eq(platformRoleAssignments.userId, record.userId), eq(platformRoleAssignments.role, record.role),
          eq(platformRoleAssignments.version, current.version),
        )).returning()
        : await tx.insert(platformRoleAssignments).values({
          userId: record.userId, role: record.role, status: 'active', version: 1,
          createdAt: record.occurredAt, createdBy: record.actorId, updatedAt: record.occurredAt, updatedBy: record.actorId,
        }).returning();
      if (!assignment) return null;
      await this.platformRoleSideEffects(tx, record, 'assigned', { role: record.role });
      return this.operationsAssignment(assignment, user.displayName);
    });
  }

  revokeOperationsRole(record: RevokeOperationsRoleRecord): Promise<RevokeOperationsRoleResult> {
    return this.db.transaction(async (tx) => {
      await tx.execute(sql`select pg_advisory_xact_lock(hashtext('ledgerly.platform-role-governance'))`);
      const [current] = await tx.select().from(platformRoleAssignments).where(and(
        eq(platformRoleAssignments.userId, record.userId), eq(platformRoleAssignments.role, record.role),
        eq(platformRoleAssignments.status, 'active'), eq(platformRoleAssignments.version, record.expectedVersion),
      )).limit(1);
      if (!current) return { kind: 'conflict' } as const;
      if (record.role === 'platform_admin') {
        const admins = await tx.select({ userId: platformRoleAssignments.userId }).from(platformRoleAssignments)
          .innerJoin(appUsers, eq(appUsers.id, platformRoleAssignments.userId)).where(and(
            eq(platformRoleAssignments.role, 'platform_admin'), eq(platformRoleAssignments.status, 'active'),
            eq(appUsers.status, 'active'),
          ));
        if (admins.length <= 1) return { kind: 'last-platform-admin' } as const;
      }
      const [assignment] = await tx.update(platformRoleAssignments).set({
        status: 'removed', version: record.expectedVersion + 1,
        updatedAt: record.occurredAt, updatedBy: record.actorId,
      }).where(and(
        eq(platformRoleAssignments.userId, record.userId), eq(platformRoleAssignments.role, record.role),
        eq(platformRoleAssignments.status, 'active'), eq(platformRoleAssignments.version, record.expectedVersion),
      )).returning();
      if (!assignment) return { kind: 'conflict' } as const;
      const [user] = await tx.select().from(appUsers).where(eq(appUsers.id, record.userId)).limit(1);
      if (!user) throw new Error('Operations role user is unavailable');
      await this.platformRoleSideEffects(tx, record, 'revoked', { role: record.role, reason: record.reason });
      return { kind: 'revoked', assignment: this.operationsAssignment(assignment, user.displayName) } as const;
    });
  }

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
        set: {
          lastSeenAt: record.occurredAt,
          authenticatedAt: record.principal.authenticatedAt,
          expiresAt: record.principal.expiresAt,
          authMethods: [...record.principal.authMethods],
        },
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

  async findAuthenticatedSession(sessionId: string, now: Date): Promise<AuthenticatedSession | null> {
    const [sessionRow] = await this.db.select().from(authSessions).where(and(
      eq(authSessions.id, sessionId),
      isNull(authSessions.revokedAt),
      gt(authSessions.expiresAt, now),
    )).limit(1);
    if (!sessionRow) return null;
    const [userRow] = await this.db.select().from(appUsers).where(and(
      eq(appUsers.id, sessionRow.userId),
      eq(appUsers.status, 'active'),
    )).limit(1);
    return userRow ? { user: this.user(userRow), session: this.session(sessionRow) } : null;
  }

  async listMembershipsForUser(userId: string): Promise<readonly SavedTenantMember[]> {
    const rows = await this.db.select().from(tenantMembers).where(and(
      eq(tenantMembers.userId, userId),
      eq(tenantMembers.status, 'active'),
    ));
    const [user] = await this.db.select().from(appUsers).where(eq(appUsers.id, userId)).limit(1);
    if (!user) return [];
    return rows.map((row) => this.member(row, user.displayName));
  }

  async createLoginState(record: LoginStateRecord): Promise<void> {
    await this.db.insert(oidcLoginStates).values(record);
  }

  async consumeLoginState(stateHash: string, occurredAt: Date): Promise<boolean> {
    const [row] = await this.db.update(oidcLoginStates).set({ consumedAt: occurredAt }).where(and(
      eq(oidcLoginStates.stateHash, stateHash),
      isNull(oidcLoginStates.consumedAt),
      gt(oidcLoginStates.expiresAt, occurredAt),
    )).returning({ stateHash: oidcLoginStates.stateHash });
    return Boolean(row);
  }

  bootstrapOwner(tenantId: string, userId: string, companyId: string, occurredAt: Date): Promise<void> {
    return this.db.transaction(async (tx) => {
      await tx.insert(appUsers).values({
        id: userId, status: 'active', displayName: '初始所有者',
        createdAt: occurredAt, createdBy: userId, updatedAt: occurredAt, updatedBy: userId,
      }).onConflictDoNothing();
      await tx.insert(tenantMembers).values({
        tenantId, userId, role: 'owner', status: 'active', roles: ['tenant_owner'], companyIds: [companyId],
        activatedAt: occurredAt, createdAt: occurredAt, createdBy: userId, updatedAt: occurredAt, updatedBy: userId,
      }).onConflictDoNothing();
      await tx.insert(tenantMemberRoles).values({
        tenantId, userId, role: 'tenant_owner', createdAt: occurredAt, createdBy: userId, updatedAt: occurredAt, updatedBy: userId,
      }).onConflictDoNothing();
    });
  }

  async findMember(tenantId: string, userId: string): Promise<SavedTenantMember | null> {
    const [row] = await this.db.select().from(tenantMembers).where(and(eq(tenantMembers.tenantId, tenantId), eq(tenantMembers.userId, userId))).limit(1);
    if (!row) return null;
    const [user] = await this.db.select().from(appUsers).where(eq(appUsers.id, userId)).limit(1);
    return user ? this.member(row, user.displayName) : null;
  }

  async listMembers(tenantId: string): Promise<readonly SavedTenantMember[]> {
    const rows = await this.db.select().from(tenantMembers).where(eq(tenantMembers.tenantId, tenantId));
    return Promise.all(rows.map(async (row) => {
      const [user] = await this.db.select().from(appUsers).where(eq(appUsers.id, row.userId)).limit(1);
      if (!user) throw new Error('Tenant member user is unavailable');
      return this.member(row, user.displayName);
    }));
  }

  async companyScopeExists(tenantId: string, companyIds: readonly string[]): Promise<boolean> {
    if (companyIds.length === 0) return true;
    const unique = [...new Set(companyIds)];
    const rows = await this.db.select({ id: companies.id }).from(companies).where(and(
      eq(companies.tenantId, tenantId),
      inArray(companies.id, unique),
    ));
    return rows.length === unique.length;
  }

  createInvitation(record: CreateInvitationRecord): Promise<SavedTenantInvitation> {
    return this.db.transaction(async (tx) => {
      const invitation = record.invitation;
      const [row] = await tx.insert(tenantInvitations).values({
        id: invitation.id, tenantId: invitation.tenantId, identifierHash: invitation.identifierHash,
        identifierHint: invitation.identifierHint,
        tokenHash: invitation.tokenHash, roles: [...invitation.roles], companyIds: [...invitation.companyIds],
        status: invitation.status, expiresAt: invitation.expiresAt, version: invitation.version,
        createdAt: invitation.createdAt, createdBy: record.actorId, updatedAt: invitation.createdAt, updatedBy: record.actorId,
      }).returning();
      if (!row) throw new Error('Invitation was not persisted');
      await this.sideEffects(tx, invitation.tenantId, invitation.id, 'created', record.actorId, record.traceId, invitation.createdAt, {
        identifierHint: invitation.identifierHint, roles: invitation.roles, companyIds: invitation.companyIds,
      });
      return invitation;
    });
  }

  async findInvitationByTokenHash(tokenHash: string): Promise<SavedTenantInvitation | null> {
    const [row] = await this.db.select().from(tenantInvitations).where(eq(tenantInvitations.tokenHash, tokenHash)).limit(1);
    return row ? this.invitation(row) : null;
  }

  acceptInvitation(record: AcceptInvitationRecord): Promise<SavedTenantMember | null> {
    return this.db.transaction(async (tx) => {
      const [current] = await tx.select().from(tenantInvitations).where(and(
        eq(tenantInvitations.id, record.invitationId),
        eq(tenantInvitations.status, 'pending'),
        eq(tenantInvitations.version, record.expectedVersion),
      )).limit(1);
      if (!current) return null;
      const [user] = await tx.select().from(appUsers).where(and(eq(appUsers.id, record.userId), eq(appUsers.status, 'active'))).limit(1);
      if (!user) return null;
      const [existingMember] = await tx.select({ userId: tenantMembers.userId }).from(tenantMembers).where(and(
        eq(tenantMembers.tenantId, current.tenantId),
        eq(tenantMembers.userId, record.userId),
      )).limit(1);
      if (existingMember) return null;
      const [invitation] = await tx.update(tenantInvitations).set({
        status: 'accepted', acceptedAt: record.occurredAt, acceptedBy: record.userId,
        version: record.expectedVersion + 1, updatedAt: record.occurredAt, updatedBy: record.actorId,
      }).where(and(
        eq(tenantInvitations.id, record.invitationId),
        eq(tenantInvitations.status, 'pending'),
        eq(tenantInvitations.version, record.expectedVersion),
      )).returning();
      if (!invitation) return null;
      const roles = invitation.roles as SavedTenantMember['roles'];
      const companyIds = invitation.companyIds as readonly string[];
      const [member] = await tx.insert(tenantMembers).values({
        tenantId: invitation.tenantId, userId: record.userId, role: this.legacyRole(roles),
        status: 'active', roles: [...roles], companyIds: [...companyIds], invitedBy: invitation.createdBy,
        activatedAt: record.occurredAt, createdAt: record.occurredAt, createdBy: record.actorId,
        updatedAt: record.occurredAt, updatedBy: record.actorId,
      }).onConflictDoNothing().returning();
      if (!member) return null;
      await tx.insert(tenantMemberRoles).values(roles.map((role) => ({
        tenantId: invitation.tenantId, userId: record.userId, role,
        createdAt: record.occurredAt, createdBy: record.actorId, updatedAt: record.occurredAt, updatedBy: record.actorId,
      })));
      await this.sideEffects(tx, invitation.tenantId, invitation.id, 'accepted', record.actorId, record.traceId, record.occurredAt, {
        userId: record.userId, roles, companyIds,
      });
      return this.member(member, user.displayName);
    });
  }

  deactivateMember(record: DeactivateMemberRecord): Promise<SavedTenantMember | null> {
    return this.db.transaction(async (tx) => {
      const [member] = await tx.update(tenantMembers).set({
        status: 'suspended', deactivatedAt: record.occurredAt, version: record.expectedVersion + 1,
        updatedAt: record.occurredAt, updatedBy: record.actorId,
      }).where(and(
        eq(tenantMembers.tenantId, record.tenantId), eq(tenantMembers.userId, record.userId),
        eq(tenantMembers.status, 'active'), eq(tenantMembers.version, record.expectedVersion),
      )).returning();
      if (!member) return null;
      await this.sideEffects(tx, record.tenantId, record.userId, 'deactivated', record.actorId, record.traceId, record.occurredAt, {
        targetUserId: record.userId, reason: record.reason,
      });
      const [user] = await tx.select().from(appUsers).where(eq(appUsers.id, record.userId)).limit(1);
      if (!user) throw new Error('Tenant member user is unavailable');
      return this.member(member, user.displayName);
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

  private invitation(row: typeof tenantInvitations.$inferSelect): SavedTenantInvitation {
    return {
      id: row.id, tenantId: row.tenantId, identifierHash: row.identifierHash, identifierHint: row.identifierHint,
      tokenHash: row.tokenHash, roles: row.roles as SavedTenantInvitation['roles'],
      companyIds: row.companyIds as readonly string[], status: row.status as SavedTenantInvitation['status'],
      expiresAt: row.expiresAt, createdAt: row.createdAt, createdBy: row.createdBy, version: row.version,
    };
  }

  private member(row: typeof tenantMembers.$inferSelect, displayName: string): SavedTenantMember {
    return {
      tenantId: row.tenantId, userId: row.userId, displayName, status: row.status as SavedTenantMember['status'],
      roles: row.roles as SavedTenantMember['roles'], companyIds: row.companyIds as readonly string[], version: row.version,
      ...(row.activatedAt ? { activatedAt: row.activatedAt } : {}),
      ...(row.deactivatedAt ? { deactivatedAt: row.deactivatedAt } : {}),
    };
  }

  private operationsAssignment(
    row: typeof platformRoleAssignments.$inferSelect,
    displayName: string,
  ): SavedOperationsRoleAssignment {
    return {
      userId: row.userId, displayName, role: row.role as OperationsRole,
      status: row.status as SavedOperationsRoleAssignment['status'], version: row.version,
      createdAt: row.createdAt, createdBy: row.createdBy, updatedAt: row.updatedAt, updatedBy: row.updatedBy,
    };
  }

  private legacyRole(roles: SavedTenantMember['roles']): string {
    if (roles.includes('tenant_owner') || roles.includes('tenant_admin')) return 'owner';
    if (roles.includes('bookkeeper')) return 'accountant';
    return 'operator';
  }

  private async sideEffects(
    tx: Parameters<Parameters<Database['transaction']>[0]>[0],
    tenantId: string,
    resourceId: string,
    action: string,
    actorId: string,
    traceId: string,
    occurredAt: Date,
    metadata: Record<string, unknown>,
  ) {
    await tx.insert(auditEvents).values({
      id: randomUUID(), tenantId, actorId, action: `tenant_member.${action}`, resourceType: 'tenant_member',
      resourceId, outcome: 'success', traceId, metadata, occurredAt,
    });
    await tx.insert(outboxEvents).values({
      id: randomUUID(), tenantId, eventType: `tenant_member.${action}.v1`, aggregateType: 'tenant_member',
      aggregateId: resourceId, payload: metadata, occurredAt,
    });
  }

  private async platformRoleSideEffects(
    tx: Parameters<Parameters<Database['transaction']>[0]>[0],
    record: AssignOperationsRoleRecord,
    action: 'assigned' | 'revoked',
    metadata: Record<string, unknown>,
  ) {
    await tx.insert(auditEvents).values({
      id: randomUUID(), actorId: record.actorId, action: `platform_role.${action}`,
      resourceType: 'platform_role_assignment', resourceId: record.userId,
      outcome: 'success', traceId: record.traceId, metadata: { targetUserId: record.userId, ...metadata },
      occurredAt: record.occurredAt,
    });
    await tx.insert(outboxEvents).values({
      id: randomUUID(), tenantId: null, eventType: `platform_role.${action}.v1`,
      aggregateType: 'platform_role_assignment', aggregateId: record.userId,
      payload: { targetUserId: record.userId, ...metadata }, occurredAt: record.occurredAt,
    });
  }
}
