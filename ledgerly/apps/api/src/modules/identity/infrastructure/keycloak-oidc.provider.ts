import { Injectable, UnauthorizedException } from '@nestjs/common';
import type { AuthMethod } from '@ledgerly/domain';
import { createPublicKey, createVerify, type JsonWebKey } from 'node:crypto';
import type {
  AuthorizationCodeInput,
  AuthorizationUrlInput,
  IdentityProviderPort,
  VerifiedProviderIdentity,
} from '../application/identity-provider.port.js';

interface JwtClaims {
  iss?: string;
  sub?: string;
  aud?: string | string[];
  exp?: number;
  iat?: number;
  auth_time?: number;
  nonce?: string;
  sid?: string;
  name?: string;
  preferred_username?: string;
  email?: string;
  amr?: string[];
}

@Injectable()
export class KeycloakOidcProvider implements IdentityProviderPort {
  private jwks?: { readonly expiresAt: number; readonly keys: readonly JsonWebKey[] };

  authorizationUrl(input: AuthorizationUrlInput): string {
    const url = new URL(`${this.issuer()}/protocol/openid-connect/auth`);
    url.search = new URLSearchParams({
      client_id: this.clientId(), response_type: 'code', scope: 'openid profile email',
      redirect_uri: input.redirectUri, state: input.state, nonce: input.nonce,
      code_challenge: input.codeChallenge, code_challenge_method: 'S256',
    }).toString();
    return url.toString();
  }

  async exchangeAuthorizationCode(input: AuthorizationCodeInput): Promise<VerifiedProviderIdentity> {
    const body = new URLSearchParams({
      grant_type: 'authorization_code', client_id: this.clientId(), code: input.code,
      code_verifier: input.codeVerifier, redirect_uri: input.redirectUri,
    });
    const secret = process.env['OIDC_CLIENT_SECRET'];
    if (secret) body.set('client_secret', secret);
    const response = await this.fetch(`${this.issuer()}/protocol/openid-connect/token`, {
      method: 'POST', headers: { 'content-type': 'application/x-www-form-urlencoded' }, body,
    });
    if (!response.ok) throw new UnauthorizedException({ code: 'OIDC_CODE_EXCHANGE_FAILED', message: 'Authorization code exchange failed' });
    const tokens = await response.json() as { id_token?: string };
    if (!tokens.id_token) throw new UnauthorizedException({ code: 'OIDC_ID_TOKEN_MISSING', message: 'Provider did not return an ID token' });
    return this.verifyJwt(tokens.id_token, input.expectedNonce);
  }

  verifyAccessToken(token: string): Promise<VerifiedProviderIdentity> {
    return this.verifyJwt(token);
  }

  async revokeSession(issuer: string, providerSessionId: string): Promise<void> {
    if (issuer.replace(/\/$/, '') !== this.issuer()) throw new Error('Provider issuer mismatch');
    const adminClientId = process.env['OIDC_ADMIN_CLIENT_ID'];
    const adminClientSecret = process.env['OIDC_ADMIN_CLIENT_SECRET'];
    if (!adminClientId || !adminClientSecret) throw new Error('Provider session revocation credentials are not configured');
    const tokenResponse = await this.fetch(`${this.issuer()}/protocol/openid-connect/token`, {
      method: 'POST', headers: { 'content-type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({ grant_type: 'client_credentials', client_id: adminClientId, client_secret: adminClientSecret }),
    });
    if (!tokenResponse.ok) throw new Error('Provider administration token request failed');
    const token = await tokenResponse.json() as { access_token?: string };
    if (!token.access_token) throw new Error('Provider administration token is missing');
    const issuerUrl = new URL(this.issuer());
    const segments = issuerUrl.pathname.split('/').filter(Boolean);
    const realmIndex = segments.lastIndexOf('realms');
    const realm = realmIndex >= 0 ? segments[realmIndex + 1] : undefined;
    if (!realm) throw new Error('Keycloak issuer does not contain a realm');
    const basePath = segments.slice(0, realmIndex).join('/');
    const endpoint = `${issuerUrl.origin}/${basePath ? `${basePath}/` : ''}admin/realms/${encodeURIComponent(realm)}/sessions/${encodeURIComponent(providerSessionId)}`;
    const response = await this.fetch(endpoint, { method: 'DELETE', headers: { authorization: `Bearer ${token.access_token}` } });
    if (!response.ok && response.status !== 404) throw new Error('Provider session revocation failed');
  }

  private async verifyJwt(token: string, expectedNonce?: string): Promise<VerifiedProviderIdentity> {
    try {
      const [encodedHeader, encodedClaims, encodedSignature] = token.split('.');
      if (!encodedHeader || !encodedClaims || !encodedSignature) throw new Error('Malformed JWT');
      const header = JSON.parse(Buffer.from(encodedHeader, 'base64url').toString('utf8')) as { alg?: string; kid?: string };
      if (header.alg !== 'RS256' || !header.kid) throw new Error('Unsupported JWT algorithm');
      const claims = JSON.parse(Buffer.from(encodedClaims, 'base64url').toString('utf8')) as JwtClaims;
      const key = (await this.keys()).find((candidate) => candidate.kid === header.kid && candidate.kty === 'RSA');
      if (!key) throw new Error('JWT signing key not found');
      const verifier = createVerify('RSA-SHA256');
      verifier.update(`${encodedHeader}.${encodedClaims}`);
      verifier.end();
      if (!verifier.verify(createPublicKey({ key, format: 'jwk' }), Buffer.from(encodedSignature, 'base64url'))) throw new Error('JWT signature invalid');
      const now = Math.floor(Date.now() / 1000);
      const issuer = this.issuer();
      const audiences = Array.isArray(claims.aud) ? claims.aud : claims.aud ? [claims.aud] : [];
      if (claims.iss?.replace(/\/$/, '') !== issuer || !audiences.includes(this.clientId())) throw new Error('JWT issuer or audience invalid');
      if (!claims.sub || !claims.sid || !claims.exp || claims.exp <= now - 30 || !claims.iat || claims.iat > now + 60) throw new Error('JWT time or subject claims invalid');
      if (expectedNonce !== undefined && claims.nonce !== expectedNonce) throw new Error('JWT nonce invalid');
      const methods = this.authMethods(claims.amr);
      return {
        issuer, subject: claims.sub, providerSessionId: claims.sid,
        displayName: claims.name ?? claims.preferred_username ?? '已验证用户',
        ...(claims.email ? { identifierHint: this.emailHint(claims.email) } : {}),
        authMethods: methods,
        authenticatedAt: new Date((claims.auth_time ?? claims.iat) * 1000),
        expiresAt: new Date(claims.exp * 1000),
      };
    } catch (error) {
      if (error instanceof UnauthorizedException) throw error;
      throw new UnauthorizedException({ code: 'OIDC_TOKEN_INVALID', message: 'Provider token validation failed' });
    }
  }

  private async keys(): Promise<readonly JsonWebKey[]> {
    if (this.jwks && this.jwks.expiresAt > Date.now()) return this.jwks.keys;
    const response = await this.fetch(`${this.issuer()}/protocol/openid-connect/certs`);
    if (!response.ok) throw new Error('Provider signing keys unavailable');
    const document = await response.json() as { keys?: JsonWebKey[] };
    if (!document.keys?.length) throw new Error('Provider signing keys are empty');
    this.jwks = { keys: document.keys, expiresAt: Date.now() + 5 * 60_000 };
    return document.keys;
  }

  private authMethods(amr: readonly string[] | undefined): readonly AuthMethod[] {
    const mapped = (amr ?? []).flatMap((value): AuthMethod[] => {
      if (value === 'pwd') return ['pwd'];
      if (value === 'otp' || value === 'mfa') return ['otp'];
      if (value === 'webauthn' || value === 'hwk') return ['webauthn'];
      return [];
    });
    return [...new Set<AuthMethod>(mapped.length ? mapped : ['federated'])];
  }

  private emailHint(email: string): string {
    const normalized = email.trim().toLowerCase();
    const at = normalized.indexOf('@');
    return at > 0 ? `${normalized.slice(0, 1)}***${normalized.slice(at)}` : '***';
  }

  private issuer(): string {
    const value = process.env['OIDC_ISSUER'];
    if (!value) throw new Error('OIDC_ISSUER is required');
    return value.replace(/\/$/, '');
  }
  private clientId(): string {
    const value = process.env['OIDC_CLIENT_ID'];
    if (!value) throw new Error('OIDC_CLIENT_ID is required');
    return value;
  }
  private fetch(url: string, init?: RequestInit): Promise<Response> {
    return fetch(url, { ...init, signal: AbortSignal.timeout(5_000) });
  }
}
