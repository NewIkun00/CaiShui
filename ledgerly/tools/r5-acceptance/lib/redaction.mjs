const secretKey =
  /(authorization|cookie|password|secret|token|verifier|private|credential|auth_cookie_key)/iu;

export function redact(value, key = '') {
  if (secretKey.test(key)) return '[REDACTED]';
  if (Array.isArray(value)) return value.map((item) => redact(item));
  if (value && typeof value === 'object') {
    return Object.fromEntries(
      Object.entries(value).map(([childKey, child]) => [childKey, redact(child, childKey)]),
    );
  }
  if (typeof value === 'string') return redactString(value);
  return value;
}

function redactString(value) {
  return value
    .replace(/Bearer\s+[A-Za-z0-9._~-]+/giu, 'Bearer [REDACTED]')
    .replace(
      /(code|state|session_state|access_token|id_token|refresh_token)=([^&\s]+)/giu,
      '$1=[REDACTED]',
    );
}
