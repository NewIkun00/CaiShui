import type { AuthMethod } from '@ledgerly/domain';

export interface VerifiedProviderIdentity {
  readonly issuer: string;
  readonly subject: string;
  readonly providerSessionId: string;
  readonly displayName: string;
  readonly identifierHint?: string;
  readonly authMethods: readonly AuthMethod[];
  readonly authenticatedAt: Date;
  readonly expiresAt: Date;
}

export const IDENTITY_PROVIDER = Symbol('IDENTITY_PROVIDER');

export interface IdentityProviderPort {
  verifyAccessToken(token: string): Promise<VerifiedProviderIdentity>;
  revokeSession(issuer: string, providerSessionId: string): Promise<void>;
}
