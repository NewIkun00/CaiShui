import { resolve } from 'node:path';
import {
  loadAcceptanceEnvironment,
  publicConfiguration,
  validateAcceptanceEnvironment,
} from './lib/environment.mjs';
import { acceptancePaths, waitForHttp, writeJson } from './lib/runtime.mjs';

const rootDirectory = resolve(import.meta.dirname, '../..');
const paths = acceptancePaths(rootDirectory);
const loaded = await loadAcceptanceEnvironment(rootDirectory);
const validation = validateAcceptanceEnvironment(loaded.values);
if (validation.errors.length) throw new Error(validation.errors.join('; '));
const ports = validation.ports;
const issuer = `https://127.0.0.1:${ports.R5_KEYCLOAK_HTTPS_PORT}/realms/ledgerly`;
const api = `http://127.0.0.1:${ports.R5_API_PORT}`;
const checks = [];

await check(
  'keycloak-discovery',
  `${issuer}/.well-known/openid-configuration`,
  (body) => body.issuer === issuer,
);
await check(
  'mailpit-api',
  `http://127.0.0.1:${ports.R5_MAILPIT_HTTP_PORT}/api/v1/messages`,
  (body) => typeof body === 'object',
);
await authStart('login');
await authStart('register');

const report = {
  schemaVersion: 1,
  startedAt: new Date().toISOString(),
  ok: checks.every((item) => item.ok),
  scope: 'R5 acceptance asset readiness and OIDC transaction boundary',
  configuration: publicConfiguration(loaded.values, ports),
  checks,
  remaining: [
    'email-verification registration',
    'OTP step-up and logout revocation',
    'authorization matrix',
    'platform-role governance E2E',
  ],
};
const reportPath = resolve(
  paths.reports,
  `smoke-${new Date().toISOString().replaceAll(':', '-')}.json`,
);
await writeJson(reportPath, report);
console.log(JSON.stringify({ ...report, reportPath }, null, 2));
if (!report.ok) process.exitCode = 1;

async function check(name, url, predicate) {
  try {
    const response = await waitForHttp(url, { timeoutMs: 20_000 });
    const body = await response.json();
    const ok = predicate(body);
    checks.push({ name, ok, status: response.status });
  } catch (error) {
    checks.push({ name, ok: false, error: error instanceof Error ? error.message : String(error) });
  }
}

async function authStart(intent) {
  try {
    const response = await fetch(`${api}/v1/auth/${intent}`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-request-id': `r5-${intent}` },
      body: JSON.stringify({ returnTo: '/dashboard' }),
      signal: AbortSignal.timeout(10_000),
    });
    const body = await response.json();
    const authorization = new URL(body.authorizationUrl);
    const ok =
      response.status === 201 &&
      authorization.origin === new URL(issuer).origin &&
      authorization.searchParams.get('code_challenge_method') === 'S256' &&
      Boolean(authorization.searchParams.get('state')) &&
      Boolean(authorization.searchParams.get('nonce'));
    checks.push({
      name: `api-${intent}-transaction`,
      ok,
      status: response.status,
      authorizationOrigin: authorization.origin,
    });
  } catch (error) {
    checks.push({
      name: `api-${intent}-transaction`,
      ok: false,
      error: error instanceof Error ? error.message : String(error),
    });
  }
}
