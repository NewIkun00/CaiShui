import type { AppUser, AuthSession, CustomerRole, ExternalIdentity, TenantMemberStatus } from '@ledgerly/domain';
import type { VerifiedProviderIdentity } from './identity-provider.port.js';

export interface EstablishIdentityRecord {
  readonly userId: string;
  readonly identityId: string;
  readonly sessionId: string;
  readonly principal: VerifiedProviderIdentity;
  readonly traceId: string;
  readonly occurredAt: Date;
}

export interface RevokeIdentitySessionRecord {
  readonly userId: string;
  readonly sessionId: string;
  readonly actorId: string;
  readonly reason: string;
  readonly traceId: string;
  readonly occurredAt: Date;
}

export interface EstablishedIdentity {
  readonly user: AppUser;
  readonly identity: ExternalIdentity;
  readonly session: AuthSession;
  readonly created: boolean;
}

export interface AuthenticatedSession {
  readonly user: AppUser;
  readonly session: AuthSession;
}

export interface LoginStateRecord {
  readonly stateHash: string;
  readonly expiresAt: Date;
  readonly createdAt: Date;
  readonly traceId: string;
}

export interface SavedTenantInvitation {
  readonly id: string;
  readonly tenantId: string;
  readonly identifierHash: string;
  readonly identifierHint: string;
  readonly tokenHash: string;
  readonly roles: readonly CustomerRole[];
  readonly companyIds: readonly string[];
  readonly status: 'pending' | 'accepted' | 'revoked' | 'expired';
  readonly expiresAt: Date;
  readonly createdAt: Date;
  readonly createdBy: string;
  readonly version: number;
}

export interface SavedTenantMember {
  readonly tenantId: string;
  readonly userId: string;
  readonly displayName: string;
  readonly status: TenantMemberStatus;
  readonly roles: readonly CustomerRole[];
  readonly companyIds: readonly string[];
  readonly version: number;
  readonly activatedAt?: Date;
  readonly deactivatedAt?: Date;
}

export interface CreateInvitationRecord {
  readonly invitation: SavedTenantInvitation;
  readonly actorId: string;
  readonly traceId: string;
}

export interface AcceptInvitationRecord {
  readonly invitationId: string;
  readonly expectedVersion: number;
  readonly userId: string;
  readonly actorId: string;
  readonly traceId: string;
  readonly occurredAt: Date;
}

export interface DeactivateMemberRecord {
  readonly tenantId: string;
  readonly userId: string;
  readonly expectedVersion: number;
  readonly actorId: string;
  readonly reason: string;
  readonly traceId: string;
  readonly occurredAt: Date;
}

export const IDENTITY_STORE = Symbol('IDENTITY_STORE');

export interface IdentityStore {
  establish(record: EstablishIdentityRecord): Promise<EstablishedIdentity>;
  findSession(userId: string, sessionId: string): Promise<AuthSession | null>;
  revokeSession(record: RevokeIdentitySessionRecord): Promise<AuthSession | null>;
  findAuthenticatedSession(sessionId: string, now: Date): Promise<AuthenticatedSession | null>;
  listMembershipsForUser(userId: string): Promise<readonly SavedTenantMember[]>;
  createLoginState(record: LoginStateRecord): Promise<void>;
  consumeLoginState(stateHash: string, occurredAt: Date): Promise<boolean>;
  bootstrapOwner(tenantId: string, userId: string, companyId: string, occurredAt: Date): Promise<void>;
  findMember(tenantId: string, userId: string): Promise<SavedTenantMember | null>;
  listMembers(tenantId: string): Promise<readonly SavedTenantMember[]>;
  companyScopeExists(tenantId: string, companyIds: readonly string[]): Promise<boolean>;
  createInvitation(record: CreateInvitationRecord): Promise<SavedTenantInvitation>;
  findInvitationByTokenHash(tokenHash: string): Promise<SavedTenantInvitation | null>;
  acceptInvitation(record: AcceptInvitationRecord): Promise<SavedTenantMember | null>;
  deactivateMember(record: DeactivateMemberRecord): Promise<SavedTenantMember | null>;
}
