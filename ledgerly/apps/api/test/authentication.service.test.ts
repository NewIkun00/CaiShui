import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { AuthenticationService } from '../src/modules/identity/application/authentication.service.js';
import type {
  AuthorizationCodeInput,
  AuthorizationUrlInput,
  IdentityProviderPort,
  VerifiedProviderIdentity,
} from '../src/modules/identity/application/identity-provider.port.js';
import { IdentityService } from '../src/modules/identity/application/identity.service.js';
import { AuthTransactionCodec } from '../src/modules/identity/infrastructure/auth-transaction.codec.js';
import { MemoryIdentityStore } from '../src/modules/identity/infrastructure/memory-identity.store.js';

class FakeProvider implements IdentityProviderPort {
  revoked: string[] = [];
  failRevocation = false;
  lastAuthorization?: AuthorizationUrlInput;

  authorizationUrl(input: AuthorizationUrlInput): string {
    this.lastAuthorization = input;
    return `https://identity.example.com/authorize?state=${encodeURIComponent(input.state)}`;
  }
  exchangeAuthorizationCode(input: AuthorizationCodeInput): Promise<VerifiedProviderIdentity> {
    void input;
    return Promise.resolve({
      issuer: 'https://identity.example.com', subject: 'subject-1', providerSessionId: 'provider-session-1',
      displayName: '正式用户', identifierHint: 'u***@example.com', authMethods: ['pwd', 'otp'],
      authenticatedAt: new Date(), expiresAt: new Date(Date.now() + 60 * 60_000),
    });
  }
  verifyAccessToken(token: string): Promise<VerifiedProviderIdentity> {
    void token;
    return this.exchangeAuthorizationCode({ code: 'token', codeVerifier: 'verifier', redirectUri: 'https://app.example.com/callback', expectedNonce: 'nonce' });
  }
  revokeSession(_issuer: string, providerSessionId: string): Promise<void> {
    if (this.failRevocation) return Promise.reject(new Error('provider unavailable'));
    this.revoked.push(providerSessionId);
    return Promise.resolve();
  }
}

describe('OIDC BFF authentication service', () => {
  beforeEach(() => {
    vi.stubEnv('OIDC_REDIRECT_URI', 'https://app.example.com/auth/callback');
    vi.stubEnv('AUTH_COOKIE_KEY', Buffer.alloc(32, 7).toString('base64'));
  });
  afterEach(() => vi.unstubAllEnvs());

  function fixture() {
    const store = new MemoryIdentityStore();
    const provider = new FakeProvider();
    const identities = new IdentityService(store);
    const service = new AuthenticationService(provider, store, identities, new AuthTransactionCodec());
    return { service, provider };
  }

  it('uses one-time state, PKCE and an opaque revocable local session', async () => {
    const { service, provider } = fixture();
    const started = await service.beginLogin('/dashboard', 'trace-start');
    expect(started.authorizationUrl).toContain('https://identity.example.com/authorize');
    expect(provider.lastAuthorization?.codeChallenge).toMatch(/^[A-Za-z0-9_-]{43}$/);
    await expect(service.completeLogin('code-1', 'wrong-state-value-that-is-long-enough', started.transaction, 'trace-wrong')).rejects.toThrow('Login state is invalid or expired');
    const completed = await service.completeLogin('code-1', provider.lastAuthorization!.state, started.transaction, 'trace-callback');
    expect(completed.returnTo).toBe('/dashboard');
    expect(await service.authenticate(completed.established.session.id)).toMatchObject({ userId: completed.established.user.id });
    await expect(service.completeLogin('code-1', provider.lastAuthorization!.state, started.transaction, 'trace-replay')).rejects.toThrow('already been used');
    expect(await service.logout(completed.established.session.id, 'trace-logout')).toEqual({ providerRevoked: true });
    expect(provider.revoked).toEqual(['provider-session-1']);
    expect(await service.authenticate(completed.established.session.id)).toBeNull();
  });

  it('enforces active tenant membership and company scope centrally', async () => {
    const store = new MemoryIdentityStore();
    const provider = new FakeProvider();
    const identities = new IdentityService(store);
    const service = new AuthenticationService(provider, store, identities, new AuthTransactionCodec());
    const tenantId = '10000000-0000-4000-8000-000000000001';
    const companyId = '20000000-0000-4000-8000-000000000001';
    const userId = '30000000-0000-4000-8000-000000000001';
    await identities.bootstrapOwner(tenantId, userId, companyId);
    await expect(service.authorizeTenant(userId, tenantId, companyId)).resolves.toMatchObject({ roles: ['tenant_owner'] });
    await expect(service.authorizeTenant(userId, tenantId, '20000000-0000-4000-8000-000000000099')).rejects.toThrow('outside the member scope');
    await expect(service.authorizeTenant('30000000-0000-4000-8000-000000000099', tenantId)).rejects.toThrow('Tenant not found');
  });

  it('revokes locally even when provider revocation is temporarily unavailable', async () => {
    const { service, provider } = fixture();
    const started = await service.beginLogin('/documents', 'trace-start');
    const completed = await service.completeLogin('code-2', provider.lastAuthorization!.state, started.transaction, 'trace-callback');
    provider.failRevocation = true;
    expect(await service.logout(completed.established.session.id, 'trace-logout')).toEqual({ providerRevoked: false });
    expect(await service.authenticate(completed.established.session.id)).toBeNull();
  });

  it('rejects tampered encrypted transaction cookies', async () => {
    const { service, provider } = fixture();
    const started = await service.beginLogin('/dashboard', 'trace-start');
    await expect(service.completeLogin('code', provider.lastAuthorization!.state, `${started.transaction}x`, 'trace-tamper')).rejects.toThrow('Login transaction is invalid');
  });
});
