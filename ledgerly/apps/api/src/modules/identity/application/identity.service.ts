import { BadRequestException, ConflictException, ForbiddenException, Inject, Injectable, NotFoundException } from '@nestjs/common';
import type { TenantInvitationInput, TenantMemberDeactivateInput } from '@ledgerly/contracts';
import type { CustomerRole } from '@ledgerly/domain';
import { createHash, randomBytes, randomUUID } from 'node:crypto';
import type { VerifiedProviderIdentity } from './identity-provider.port.js';
import {
  IDENTITY_STORE,
  type EstablishedIdentity,
  type IdentityStore,
  type SavedTenantInvitation,
  type SavedTenantMember,
} from './identity-store.js';

interface ActorContext {
  readonly actorId: string;
  readonly tenantId?: string;
  readonly traceId: string;
}

@Injectable()
export class IdentityService {
  constructor(@Inject(IDENTITY_STORE) private readonly store: IdentityStore) {}

  establishVerifiedIdentity(principal: VerifiedProviderIdentity, traceId: string): Promise<EstablishedIdentity> {
    if (principal.expiresAt <= principal.authenticatedAt) {
      throw new ConflictException({ code: 'IDENTITY_TOKEN_INVALID', message: 'Identity token expiry is invalid' });
    }
    const now = new Date();
    return this.store.establish({
      userId: randomUUID(),
      identityId: randomUUID(),
      sessionId: randomUUID(),
      principal,
      traceId,
      occurredAt: now,
    });
  }

  async revokeOwnSession(userId: string, sessionId: string, reason: string, traceId: string) {
    const current = await this.store.findSession(userId, sessionId);
    if (!current) throw new NotFoundException('Session not found');
    if (current.revokedAt) return current;
    const revoked = await this.store.revokeSession({
      userId,
      sessionId,
      actorId: userId,
      reason,
      traceId,
      occurredAt: new Date(),
    });
    if (!revoked) throw new ConflictException({ code: 'SESSION_REVOCATION_CONFLICT', message: 'Session changed concurrently' });
    return revoked;
  }

  bootstrapOwner(tenantId: string, userId: string, companyId: string): Promise<void> {
    return this.store.bootstrapOwner(tenantId, userId, companyId, new Date());
  }

  async inviteMember(
    tenantId: string,
    input: TenantInvitationInput,
    context: ActorContext,
  ): Promise<{ invitation: SavedTenantInvitation; developmentToken?: string }> {
    await this.requireTenantAdministrator(tenantId, context);
    if (!await this.store.companyScopeExists(tenantId, input.companyIds)) {
      throw new BadRequestException({ code: 'MEMBER_COMPANY_SCOPE_INVALID', message: 'Company scope must belong to the tenant' });
    }
    const identifier = input.identifier.trim().toLowerCase();
    const token = randomBytes(32).toString('base64url');
    const now = new Date();
    const invitation = await this.store.createInvitation({
      invitation: {
        id: randomUUID(),
        tenantId,
        identifierHash: this.hash(identifier),
        identifierHint: this.hint(identifier),
        tokenHash: this.hash(token),
        roles: [...new Set(input.roles)] as CustomerRole[],
        companyIds: [...new Set(input.companyIds)],
        status: 'pending',
        expiresAt: new Date(now.getTime() + input.expiresInHours * 60 * 60 * 1000),
        createdAt: now,
        createdBy: context.actorId,
        version: 1,
      },
      actorId: context.actorId,
      traceId: context.traceId,
    });
    return process.env['STORAGE_MODE'] === 'memory'
      ? { invitation, developmentToken: token }
      : { invitation };
  }

  async acceptInvitation(token: string, context: ActorContext): Promise<SavedTenantMember> {
    const invitation = await this.store.findInvitationByTokenHash(this.hash(token));
    if (!invitation) throw new NotFoundException('Invitation not found');
    if (invitation.status !== 'pending') throw new ConflictException({ code: 'INVITATION_NOT_PENDING', message: 'Invitation is no longer pending' });
    if (invitation.expiresAt <= new Date()) throw new ConflictException({ code: 'INVITATION_EXPIRED', message: 'Invitation has expired' });
    const member = await this.store.acceptInvitation({
      invitationId: invitation.id,
      expectedVersion: invitation.version,
      userId: context.actorId,
      actorId: context.actorId,
      traceId: context.traceId,
      occurredAt: new Date(),
    });
    if (!member) throw new ConflictException({ code: 'INVITATION_ACCEPT_CONFLICT', message: 'Invitation changed concurrently or identity is unavailable' });
    return member;
  }

  async listMembers(tenantId: string, context: ActorContext): Promise<readonly SavedTenantMember[]> {
    await this.requireTenantAdministrator(tenantId, context);
    return this.store.listMembers(tenantId);
  }

  async deactivateMember(
    tenantId: string,
    userId: string,
    input: TenantMemberDeactivateInput,
    context: ActorContext,
  ): Promise<SavedTenantMember> {
    await this.requireTenantAdministrator(tenantId, context);
    if (userId === context.actorId) throw new ForbiddenException('Administrators cannot deactivate themselves');
    const target = await this.store.findMember(tenantId, userId);
    if (!target) throw new NotFoundException('Tenant member not found');
    if (target.roles.includes('tenant_owner')) {
      const activeOwners = (await this.store.listMembers(tenantId)).filter(
        (member) => member.status === 'active' && member.roles.includes('tenant_owner'),
      );
      if (activeOwners.length <= 1) throw new ConflictException({ code: 'LAST_TENANT_OWNER', message: 'The last tenant owner cannot be deactivated' });
    }
    const member = await this.store.deactivateMember({
      tenantId,
      userId,
      expectedVersion: input.expectedVersion,
      actorId: context.actorId,
      reason: input.reason,
      traceId: context.traceId,
      occurredAt: new Date(),
    });
    if (!member) throw new ConflictException({ code: 'MEMBER_VERSION_CONFLICT', message: 'Tenant member changed concurrently' });
    return member;
  }

  private async requireTenantAdministrator(tenantId: string, context: ActorContext): Promise<SavedTenantMember> {
    if (context.tenantId !== tenantId) throw new NotFoundException('Tenant not found');
    const member = await this.store.findMember(tenantId, context.actorId);
    if (!member || member.status !== 'active') throw new NotFoundException('Tenant not found');
    if (!member.roles.some((role) => role === 'tenant_owner' || role === 'tenant_admin')) {
      throw new ForbiddenException('Tenant administrator role required');
    }
    return member;
  }

  private hash(value: string): string {
    return createHash('sha256').update(value).digest('hex');
  }

  private hint(identifier: string): string {
    const at = identifier.indexOf('@');
    if (at > 0) return `${identifier.slice(0, 1)}***${identifier.slice(at)}`;
    return `***${identifier.slice(-4)}`;
  }
}
