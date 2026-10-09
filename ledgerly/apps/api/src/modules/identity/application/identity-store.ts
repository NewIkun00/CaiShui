import type { AppUser, AuthSession, ExternalIdentity } from '@ledgerly/domain';
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

export const IDENTITY_STORE = Symbol('IDENTITY_STORE');

export interface IdentityStore {
  establish(record: EstablishIdentityRecord): Promise<EstablishedIdentity>;
  findSession(userId: string, sessionId: string): Promise<AuthSession | null>;
  revokeSession(record: RevokeIdentitySessionRecord): Promise<AuthSession | null>;
}
