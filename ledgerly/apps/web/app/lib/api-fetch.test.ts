import { afterEach, describe, expect, it, vi } from 'vitest';
import { apiFetch } from './api-fetch';

describe('authenticated API fetch', () => {
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
  });

  it('sends cookies and strips development actor headers in OIDC builds', async () => {
    vi.stubEnv('NEXT_PUBLIC_AUTH_MODE', 'oidc');
    let seen: RequestInit | undefined;
    const fetchMock = vi.fn((input: RequestInfo | URL, init?: RequestInit) => {
      void input;
      seen = init;
      return Promise.resolve(new Response('{}'));
    });
    vi.stubGlobal('fetch', fetchMock);
    await apiFetch('https://api.example.com/v1/items', { headers: { 'x-user-id': 'spoofed', 'x-tenant-id': 'tenant' } });
    const init = seen!;
    expect(init.credentials).toBe('include');
    expect(new Headers(init.headers).has('x-user-id')).toBe(false);
    expect(new Headers(init.headers).get('x-tenant-id')).toBe('tenant');
  });

  it('retains explicit development identity headers outside OIDC builds', async () => {
    vi.stubEnv('NEXT_PUBLIC_AUTH_MODE', 'development-headers');
    let seen: RequestInit | undefined;
    const fetchMock = vi.fn((input: RequestInfo | URL, init?: RequestInit) => {
      void input;
      seen = init;
      return Promise.resolve(new Response('{}'));
    });
    vi.stubGlobal('fetch', fetchMock);
    await apiFetch('/v1/items', { headers: { 'x-user-id': 'development-user' } });
    const init = seen!;
    expect(new Headers(init.headers).get('x-user-id')).toBe('development-user');
  });

  it('starts provider step-up after a protected high-risk operation asks for MFA', async () => {
    vi.stubEnv('NEXT_PUBLIC_AUTH_MODE', 'oidc');
    const assign = vi.fn();
    vi.stubGlobal('window', { location: { pathname: '/filings', search: '?period=2026-09', assign } });
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(new Response(JSON.stringify({ code: 'STEP_UP_REQUIRED' }), { status: 403, headers: { 'content-type': 'application/json' } }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ authorizationUrl: 'https://identity.example.com/step-up' }), { status: 201, headers: { 'content-type': 'application/json' } }));
    vi.stubGlobal('fetch', fetchMock);
    await apiFetch('/api/v1/companies/company/filing-packages/package/freeze', { method: 'POST' });
    expect(fetchMock).toHaveBeenNthCalledWith(2, '/api/v1/auth/step-up', expect.objectContaining({ method: 'POST', credentials: 'include' }));
    expect(assign).toHaveBeenCalledWith('https://identity.example.com/step-up');
  });
});
