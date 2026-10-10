import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createSign, generateKeyPairSync } from 'node:crypto';
import { KeycloakOidcProvider } from '../src/modules/identity/infrastructure/keycloak-oidc.provider.js';

const issuer = 'https://identity.example.com/realms/ledgerly';
const clientId = 'ledgerly-web';

describe('Keycloak OIDC adapter', () => {
  const { privateKey, publicKey } = generateKeyPairSync('rsa', { modulusLength: 2048 });
  const jwk = { ...publicKey.export({ format: 'jwk' }), kid: 'test-key', use: 'sig', alg: 'RS256' };
  let returnedToken = '';

  beforeEach(() => {
    vi.stubEnv('OIDC_ISSUER', issuer);
    vi.stubEnv('OIDC_CLIENT_ID', clientId);
    vi.stubGlobal('fetch', vi.fn((input: string | URL | Request) => {
      const url = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url;
      if (url.endsWith('/token')) return Promise.resolve(new Response(JSON.stringify({ id_token: returnedToken }), { status: 200 }));
      if (url.endsWith('/certs')) return Promise.resolve(new Response(JSON.stringify({ keys: [jwk] }), { status: 200 }));
      return Promise.resolve(new Response('', { status: 404 }));
    }));
  });
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
  });

  function token(nonce: string) {
    const now = Math.floor(Date.now() / 1000);
    const header = Buffer.from(JSON.stringify({ alg: 'RS256', kid: 'test-key', typ: 'JWT' })).toString('base64url');
    const claims = Buffer.from(JSON.stringify({
      iss: issuer, sub: 'provider-subject', aud: clientId, iat: now, exp: now + 3600,
      auth_time: now - 10, nonce, sid: 'provider-session', name: 'OIDC 用户',
      email: 'user@example.com', amr: ['pwd', 'otp'],
    })).toString('base64url');
    const signer = createSign('RSA-SHA256');
    signer.update(`${header}.${claims}`);
    signer.end();
    return `${header}.${claims}.${signer.sign(privateKey).toString('base64url')}`;
  }

  it('uses the provider registration endpoint without weakening PKCE parameters', () => {
    const url = new URL(new KeycloakOidcProvider().authorizationUrl({
      state: 'state', nonce: 'nonce', codeChallenge: 'challenge',
      redirectUri: 'https://app.example.com/auth/callback', intent: 'register',
    }));
    expect(url.pathname).toBe('/realms/ledgerly/protocol/openid-connect/registrations');
    expect(url.searchParams.get('code_challenge_method')).toBe('S256');
  });

  it('forces fresh provider authentication for step-up', () => {
    vi.stubEnv('OIDC_STEP_UP_ACR_VALUES', 'urn:ledgerly:mfa');
    const url = new URL(new KeycloakOidcProvider().authorizationUrl({
      state: 'state', nonce: 'nonce', codeChallenge: 'challenge',
      redirectUri: 'https://app.example.com/auth/callback', intent: 'step-up',
    }));
    expect(url.pathname).toMatch(/\/auth$/);
    expect(url.searchParams.get('prompt')).toBe('login');
    expect(url.searchParams.get('max_age')).toBe('0');
    expect(url.searchParams.get('acr_values')).toBe('urn:ledgerly:mfa');
  });

  it('verifies signature, issuer, audience, nonce, time and authentication methods', async () => {
    returnedToken = token('expected-nonce');
    const provider = new KeycloakOidcProvider();
    const principal = await provider.exchangeAuthorizationCode({
      code: 'authorization-code', codeVerifier: 'verifier',
      redirectUri: 'https://app.example.com/auth/callback', expectedNonce: 'expected-nonce',
    });
    expect(principal).toMatchObject({
      issuer, subject: 'provider-subject', providerSessionId: 'provider-session',
      identifierHint: 'u***@example.com', authMethods: ['pwd', 'otp'],
    });
  });

  it('rejects a signed token issued for a different login nonce', async () => {
    returnedToken = token('wrong-nonce');
    await expect(new KeycloakOidcProvider().exchangeAuthorizationCode({
      code: 'authorization-code', codeVerifier: 'verifier',
      redirectUri: 'https://app.example.com/auth/callback', expectedNonce: 'expected-nonce',
    })).rejects.toThrow('Provider token validation failed');
  });
});
