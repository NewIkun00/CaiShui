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
});
