import { afterEach, describe, expect, it, vi } from 'vitest';
import { validateAuthConfiguration } from '../src/modules/identity/infrastructure/auth-mode.js';
import { requestContext } from '../src/shared/request-context.js';
import type { AuthenticatedFastifyRequest } from '../src/shared/authenticated-request.js';

describe('authentication mode boundaries', () => {
  afterEach(() => vi.unstubAllEnvs());

  it('allows development headers only with non-production memory storage', () => {
    vi.stubEnv('AUTH_MODE', 'development-headers');
    vi.stubEnv('STORAGE_MODE', 'postgres');
    vi.stubEnv('NODE_ENV', 'development');
    expect(() => validateAuthConfiguration()).toThrow('requires non-production memory storage');
  });

  it('requires complete secure OIDC configuration', () => {
    vi.stubEnv('AUTH_MODE', 'oidc');
    vi.stubEnv('OIDC_ISSUER', 'https://identity.example.com/realms/ledgerly');
    vi.stubEnv('OIDC_CLIENT_ID', 'ledgerly-web');
    vi.stubEnv('OIDC_REDIRECT_URI', 'https://app.example.com/auth/callback');
    vi.stubEnv('AUTH_COOKIE_KEY', Buffer.alloc(32, 1).toString('base64'));
    expect(() => validateAuthConfiguration()).not.toThrow();
    vi.stubEnv('AUTH_COOKIE_KEY', 'weak');
    expect(() => validateAuthConfiguration()).toThrow('32-byte key');
  });

  it('takes actor identity from a verified session and ignores spoofed user headers in OIDC mode', () => {
    vi.stubEnv('AUTH_MODE', 'oidc');
    const request = {
      headers: {
        'x-user-id': '90000000-0000-4000-8000-000000000099',
        'x-tenant-id': '20000000-0000-4000-8000-000000000001',
        'x-request-id': 'trace-1',
      },
      authentication: {
        userId: '30000000-0000-4000-8000-000000000001', sessionId: '40000000-0000-4000-8000-000000000001',
        issuer: 'https://identity.example.com', providerSessionId: 'sid', authMethods: ['pwd'],
        authenticatedAt: new Date(), expiresAt: new Date(Date.now() + 60_000),
      },
    } as unknown as AuthenticatedFastifyRequest;
    expect(requestContext(request, true)).toMatchObject({ actorId: request.authentication!.userId, tenantId: request.headers['x-tenant-id'] });
  });
});
