export function apiFetch(input: RequestInfo | URL, init: RequestInit = {}): Promise<Response> {
  const headers = new Headers(init.headers);
  if (process.env.NEXT_PUBLIC_AUTH_MODE === 'oidc') headers.delete('x-user-id');
  return fetch(input, { ...init, headers, credentials: 'include' });
}
