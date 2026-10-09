export type AuthMode = 'development-headers' | 'oidc';

export function authMode(): AuthMode {
  const configured = process.env['AUTH_MODE'];
  if (configured === 'development-headers' || configured === 'oidc') return configured;
  return process.env['STORAGE_MODE'] === 'memory' && process.env['NODE_ENV'] !== 'production'
    ? 'development-headers'
    : 'oidc';
}

export function validateAuthConfiguration(): void {
  const mode = authMode();
  if (mode === 'development-headers') {
    if (process.env['NODE_ENV'] === 'production' || process.env['STORAGE_MODE'] !== 'memory') {
      throw new Error('development-headers requires non-production memory storage');
    }
    return;
  }
  for (const name of ['OIDC_ISSUER', 'OIDC_CLIENT_ID', 'OIDC_REDIRECT_URI', 'AUTH_COOKIE_KEY']) {
    if (!process.env[name]) throw new Error(`${name} is required when AUTH_MODE=oidc`);
  }
  const issuer = new URL(process.env['OIDC_ISSUER']!);
  if (issuer.protocol !== 'https:' && !(process.env['NODE_ENV'] !== 'production' && ['localhost', '127.0.0.1'].includes(issuer.hostname))) {
    throw new Error('OIDC_ISSUER must use HTTPS');
  }
  const key = Buffer.from(process.env['AUTH_COOKIE_KEY']!, 'base64');
  if (key.length !== 32) throw new Error('AUTH_COOKIE_KEY must be a base64 encoded 32-byte key');
}

export function oidcRedirectUri(): string {
  const value = process.env['OIDC_REDIRECT_URI'];
  if (!value) throw new Error('OIDC_REDIRECT_URI is required');
  return value;
}
