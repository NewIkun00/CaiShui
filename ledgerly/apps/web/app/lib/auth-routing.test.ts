import { NextRequest } from 'next/server';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { proxy } from '../../proxy';

describe('formal authentication routing', () => {
  afterEach(() => vi.unstubAllEnvs());

  it('redirects an unauthenticated product route to login and preserves its destination', () => {
    vi.stubEnv('NEXT_PUBLIC_AUTH_MODE', 'oidc');
    const response = proxy(new NextRequest('http://app.example.com/documents?view=pending'));
    const location = new URL(response.headers.get('location')!);
    expect(location.pathname).toBe('/login');
    expect(location.searchParams.get('returnTo')).toBe('/documents?view=pending');
  });

  it('keeps auth pages public and sends an existing session away from login', () => {
    vi.stubEnv('NEXT_PUBLIC_AUTH_MODE', 'oidc');
    const publicResponse = proxy(new NextRequest('http://app.example.com/register'));
    expect(publicResponse.headers.get('x-middleware-next')).toBe('1');
    const request = new NextRequest('http://app.example.com/login', { headers: { cookie: 'ledgerly_session=session-id' } });
    expect(new URL(proxy(request).headers.get('location')!).pathname).toBe('/dashboard');
  });
});
