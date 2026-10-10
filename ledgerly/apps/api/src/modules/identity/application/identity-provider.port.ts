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

export interface AuthorizationUrlInput {
  readonly state: string;
  readonly nonce: string;
  readonly codeChallenge: string;
  readonly redirectUri: string;
  readonly intent: 'login' | 'register' | 'step-up';
}

export interface AuthorizationCodeInput {
  readonly code: string;
  readonly codeVerifier: string;
  readonly redirectUri: string;
  readonly expectedNonce: string;
}

export const IDENTITY_PROVIDER = Symbol('IDENTITY_PROVIDER');

export interface IdentityProviderPort {
  authorizationUrl(input: AuthorizationUrlInput): string;
  exchangeAuthorizationCode(input: AuthorizationCodeInput): Promise<VerifiedProviderIdentity>;
  verifyAccessToken(token: string): Promise<VerifiedProviderIdentity>;
  revokeSession(issuer: string, providerSessionId: string): Promise<void>;
}
