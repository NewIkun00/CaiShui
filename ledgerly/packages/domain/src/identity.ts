export const appUserStatuses = ['pending_identity', 'active', 'disabled'] as const;
export type AppUserStatus = (typeof appUserStatuses)[number];

export const tenantMemberStatuses = ['invited', 'active', 'suspended', 'removed'] as const;
export type TenantMemberStatus = (typeof tenantMemberStatuses)[number];

export const customerRoles = ['tenant_owner', 'tenant_admin', 'bookkeeper', 'member'] as const;
export type CustomerRole = (typeof customerRoles)[number];

export const operationsRoles = [
  'support_readonly',
  'accounting_reviewer',
  'tax_reviewer',
  'rule_editor',
  'rule_approver',
  'security_auditor',
  'platform_admin',
] as const;
export type OperationsRole = (typeof operationsRoles)[number];

export type AuthMethod = 'pwd' | 'otp' | 'webauthn' | 'federated';

export interface AppUser {
  readonly id: string;
  readonly status: AppUserStatus;
  readonly displayName: string;
  readonly createdAt: Date;
  readonly updatedAt: Date;
  readonly disabledAt?: Date;
}

export interface ExternalIdentity {
  readonly id: string;
  readonly userId: string;
  readonly issuer: string;
  readonly subject: string;
  readonly identifierHint?: string;
  readonly linkedAt: Date;
  readonly lastAuthenticatedAt?: Date;
}

export interface AuthSession {
  readonly id: string;
  readonly userId: string;
  readonly providerSessionId: string;
  readonly issuer: string;
  readonly authMethods: readonly AuthMethod[];
  readonly authenticatedAt: Date;
  readonly expiresAt: Date;
  readonly lastSeenAt: Date;
  readonly revokedAt?: Date;
  readonly revokedBy?: string;
  readonly revocationReason?: string;
}

export interface TenantMembership {
  readonly tenantId: string;
  readonly userId: string;
  readonly status: TenantMemberStatus;
  readonly roles: readonly CustomerRole[];
  readonly companyIds: readonly string[];
}

export class IdentityError extends Error {}

export function createAppUser(input: { id: string; displayName: string }, now: Date): AppUser {
  const displayName = input.displayName.trim();
  if (!displayName) throw new IdentityError('Display name is required');
  return Object.freeze({ id: input.id, status: 'pending_identity', displayName, createdAt: now, updatedAt: now });
}

export function activateAppUser(user: AppUser, now: Date): AppUser {
  if (user.status === 'disabled') throw new IdentityError('Disabled user cannot be activated by identity linking');
  return Object.freeze({ ...user, status: 'active', updatedAt: now });
}

export function linkExternalIdentity(input: {
  id: string;
  userId: string;
  issuer: string;
  subject: string;
  identifierHint?: string;
}, now: Date): ExternalIdentity {
  const issuer = input.issuer.trim().replace(/\/$/, '');
  const subject = input.subject.trim();
  if (!issuer.startsWith('https://')) throw new IdentityError('Identity issuer must use HTTPS');
  if (!subject) throw new IdentityError('Identity subject is required');
  return Object.freeze({ ...input, issuer, subject, linkedAt: now });
}

export function revokeAuthSession(
  session: AuthSession,
  input: { actorId: string; reason: string },
  now: Date,
): AuthSession {
  if (session.revokedAt) return session;
  const reason = input.reason.trim();
  if (!reason) throw new IdentityError('Session revocation reason is required');
  return Object.freeze({ ...session, revokedAt: now, revokedBy: input.actorId, revocationReason: reason });
}

export function assertRoleDomain(role: CustomerRole | OperationsRole, domain: 'customer' | 'operations'): void {
  const allowed = domain === 'customer' ? customerRoles : operationsRoles;
  if (!(allowed as readonly string[]).includes(role)) throw new IdentityError(`Role is not valid in ${domain} domain`);
}
