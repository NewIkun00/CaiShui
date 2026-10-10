import { resolve } from 'node:path';
import { loadAcceptanceEnvironment, validateAcceptanceEnvironment } from './lib/environment.mjs';
import { selectAmrExecutions } from './lib/amr.mjs';

const rootDirectory = resolve(import.meta.dirname, '../..');
const loaded = await loadAcceptanceEnvironment(rootDirectory);
const validation = validateAcceptanceEnvironment(loaded.values);
if (validation.errors.length) throw new Error(validation.errors.join('; '));
const base = `https://127.0.0.1:${validation.ports.R5_KEYCLOAK_HTTPS_PORT}`;

const tokenResponse = await fetch(`${base}/realms/master/protocol/openid-connect/token`, {
  method: 'POST',
  headers: { 'content-type': 'application/x-www-form-urlencoded' },
  body: new URLSearchParams({
    grant_type: 'password',
    client_id: 'admin-cli',
    username: loaded.values.R5_KEYCLOAK_ADMIN,
    password: loaded.values.R5_KEYCLOAK_ADMIN_PASSWORD,
  }),
  signal: AbortSignal.timeout(10_000),
});
if (!tokenResponse.ok)
  throw new Error(
    `Keycloak bootstrap administrator token request failed (${tokenResponse.status})`,
  );
const token = (await tokenResponse.json()).access_token;
if (!token) throw new Error('Keycloak bootstrap administrator token is missing');

const executionsResponse = await admin(
  '/admin/realms/ledgerly/authentication/flows/browser/executions',
);
if (!executionsResponse.ok)
  throw new Error(`Keycloak Browser Flow lookup failed (${executionsResponse.status})`);
const executions = await executionsResponse.json();
const selected = selectAmrExecutions(executions);
if (!selected.pwd) throw new Error('Username Password Form execution was not found');
if (!selected.otp) throw new Error('OTP Form execution was not found');

const configured = [];
for (const [reference, execution] of Object.entries(selected)) {
  if (!execution) continue;
  const body = {
    alias: `ledgerly-amr-${reference}`,
    config: {
      'default.reference.value': reference,
      'default.reference.maxAge': reference === 'pwd' ? '0' : '900',
    },
  };
  const response = execution.authenticationConfig
    ? await admin(
        `/admin/realms/ledgerly/authentication/config/${encodeURIComponent(execution.authenticationConfig)}`,
        'PUT',
        body,
      )
    : await admin(
        `/admin/realms/ledgerly/authentication/executions/${encodeURIComponent(execution.id)}/config`,
        'POST',
        body,
      );
  if (!response.ok) throw new Error(`AMR ${reference} configuration failed (${response.status})`);
  configured.push(reference);
}
console.log(
  JSON.stringify({ ok: true, configured, webauthnAvailable: Boolean(selected.webauthn) }, null, 2),
);

async function admin(path, method = 'GET', body) {
  return fetch(`${base}${path}`, {
    method,
    headers: {
      authorization: `Bearer ${token}`,
      ...(body ? { 'content-type': 'application/json' } : {}),
    },
    ...(body ? { body: JSON.stringify(body) } : {}),
    signal: AbortSignal.timeout(10_000),
  });
}
