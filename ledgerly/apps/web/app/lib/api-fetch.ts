export async function apiFetch(input: RequestInfo | URL, init: RequestInit = {}): Promise<Response> {
  const headers = new Headers(init.headers);
  if (process.env.NEXT_PUBLIC_AUTH_MODE === 'oidc') headers.delete('x-user-id');
  const response = await fetch(input, { ...init, headers, credentials: 'include' });
  if (process.env.NEXT_PUBLIC_AUTH_MODE === 'oidc' && response.status === 403 && typeof window !== 'undefined') {
    const error = await response.clone().json().catch(() => null) as { code?: string } | null;
    if (error?.code === 'STEP_UP_REQUIRED') {
      const returnTo = `${window.location.pathname}${window.location.search}`.slice(0, 500);
      const stepUp = await fetch(`${process.env.NEXT_PUBLIC_API_URL ?? '/api'}/v1/auth/step-up`, {
        method: 'POST', credentials: 'include', headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ returnTo }),
      });
      if (stepUp.ok) {
        const result = await stepUp.json() as { authorizationUrl?: string };
        if (result.authorizationUrl) window.location.assign(result.authorizationUrl);
      }
    }
  }
  return response;
}
