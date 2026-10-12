import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { createRequire } from 'node:module';
import { resolve } from 'node:path';
import { CookieClient, jsonRequest } from './lib/http-client.mjs';
import { acceptancePaths, commandInvocation, writeJson } from './lib/runtime.mjs';
import { validatePostgresSimulationEnvironment } from './lib/storage-mode.mjs';

const rootDirectory = resolve(import.meta.dirname, '../..');
const paths = acceptancePaths(rootDirectory);
const requireFromApi = createRequire(resolve(rootDirectory, 'apps/api/package.json'));
const { Pool } = requireFromApi('pg');
const api = `http://127.0.0.1:${process.env.R5_API_PORT ?? 3001}`;
const provider = `https://127.0.0.1:${process.env.R5_MOCK_OIDC_PORT ?? 58555}`;
const databaseUrl = process.env.DATABASE_URL;
const aliceEmail = process.env.R5_ALICE_EMAIL ?? 'alice@example.test';
const alicePassword = process.env.R5_ALICE_PASSWORD ?? 'alice-password';
const bobEmail = process.env.R5_BOB_EMAIL ?? 'bob@example.test';
const bobPassword = process.env.R5_BOB_PASSWORD ?? 'bob-password';
const otp = process.env.R5_MOCK_OTP ?? '123456';
const checks = [];
const startedAt = new Date().toISOString();

validatePostgresSimulationEnvironment(process.env);
if (!databaseUrl) throw new Error('DATABASE_URL is required');
if (process.env.STORAGE_MODE !== 'postgres') throw new Error('STORAGE_MODE=postgres is required');
if (process.env.R5_ACCEPTANCE_CONFIRM_ISOLATED_DATABASE !== 'true') {
  throw new Error('Disposable database confirmation is required');
}

const pool = new Pool({ connectionString: databaseUrl, max: 2 });
try {
  await assertIsolatedDatabase();
  const alice = await login(aliceEmail, alicePassword);
  const bob = await login(bobEmail, bobPassword);
  const scopes = await createIsolatedScopes(alice, bob);
  await platformGovernance(alice, bob, scopes);
  await verifyDatabaseEvidence(alice, bob);
} catch (error) {
  checks.push({
    name: 'suite',
    ok: false,
    error: error instanceof Error ? error.message : String(error),
  });
} finally {
  await pool.end();
}

const report = {
  schemaVersion: 1,
  kind: 'R5_POSTGRES_WITH_SIMULATED_EXTERNAL_SERVICES',
  productionEvidence: false,
  externalServicesEvidence: 'simulated',
  databaseEvidence: 'postgresql',
  startedAt,
  finishedAt: new Date().toISOString(),
  ok: checks.every((item) => item.ok),
  checks,
  simulated: ['OIDC provider', 'OTP challenge'],
  verified: [
    'PostgreSQL migrations and identity persistence',
    'one-time platform administrator bootstrap',
    'platform role assignment and revocation over HTTP',
    'immediate RBAC changes and tenant isolation',
    'tenantless platform audit and outbox evidence',
  ],
  notCovered: [
    'real Keycloak HTML/theme behavior',
    'real SMTP provider',
    'SMS provider',
    'PostgreSQL invitation delivery token retrieval (covered by the memory simulation without weakening production token boundaries)',
  ],
};
const reportPath = resolve(
  paths.reports,
  `postgres-simulated-${new Date().toISOString().replaceAll(':', '-')}.json`,
);
await writeJson(reportPath, report);
console.log(JSON.stringify({ ...report, reportPath }, null, 2));
if (!report.ok) process.exitCode = 1;

async function assertIsolatedDatabase() {
  const result = await pool.query(`select
    (select count(*)::int from app_users) as users,
    (select count(*)::int from platform_role_assignments) as roles,
    (select count(*)::int from audit_events) as audits`);
  const row = result.rows[0];
  assert.deepEqual(row, { users: 0, roles: 0, audits: 0 });
  pass('isolated-postgresql-database', { emptyAfterMigrations: true });
}

async function login(email, password) {
  const transaction = await begin('login', new CookieClient(), '/dashboard');
  const authorized = await jsonRequest(new CookieClient(), `${provider}/__test/login`, {
    method: 'POST',
    body: { transactionId: transaction.providerTransactionId, email, password },
  });
  assert.equal(authorized.response.status, 302);
  const current = await callback(
    transaction.apiClient,
    authorized.response.headers.get('location'),
  );
  assert.deepEqual(current.session.authMethods, ['pwd']);
  return { client: transaction.apiClient, current, email, password };
}

async function createIsolatedScopes(alice, bob) {
  const aliceScope = await bootstrap(
    alice.client,
    'R5 PostgreSQL Alice Tenant',
    'R5 PostgreSQL Alice Company',
    '913200009999999901',
  );
  const bobScope = await bootstrap(
    bob.client,
    'R5 PostgreSQL Bob Tenant',
    'R5 PostgreSQL Bob Company',
    '913200009999999902',
  );
  const crossTenant = await jsonRequest(
    bob.client,
    `${api}/v1/tenants/${aliceScope.tenantId}/members`,
    { headers: { 'x-tenant-id': aliceScope.tenantId } },
  );
  assert.equal(crossTenant.response.status, 404);
  pass('postgresql-identities-and-tenant-isolation', {
    aliceUserId: alice.current.user.id,
    bobUserId: bob.current.user.id,
    crossTenant: 404,
  });
  return { aliceScope, bobScope };
}

async function platformGovernance(alice, bob, scopes) {
  const beforeAssignment = await jsonRequest(bob.client, `${api}/v1/policy-sources`);
  assert.equal(beforeAssignment.response.status, 403);
  assert.equal(beforeAssignment.document.error.code, 'OPERATIONS_PERMISSION_DENIED');

  await seedAdministrator(alice.current.user.id, true);

  const notElevated = await jsonRequest(alice.client, `${api}/v1/operations/role-assignments`, {
    method: 'POST',
    body: { userId: bob.current.user.id, role: 'rule_editor' },
  });
  assert.equal(notElevated.response.status, 403);
  assert.equal(notElevated.document.error.code, 'STEP_UP_REQUIRED');

  const elevated = await stepUp(alice);
  await seedAdministrator(alice.current.user.id, false);

  const selfGrant = await jsonRequest(elevated.client, `${api}/v1/operations/role-assignments`, {
    method: 'POST',
    body: { userId: alice.current.user.id, role: 'security_auditor' },
  });
  assert.equal(selfGrant.response.status, 403);
  assert.equal(selfGrant.document.error.code, 'OPERATIONS_SELF_GRANT_DENIED');

  const nonAdministrator = await jsonRequest(bob.client, `${api}/v1/operations/role-assignments`, {
    method: 'POST',
    body: { userId: alice.current.user.id, role: 'rule_editor' },
  });
  assert.equal(nonAdministrator.response.status, 403);

  const assignmentTrace = `r5-postgres-assign-${Date.now()}`;
  const assigned = await jsonRequest(elevated.client, `${api}/v1/operations/role-assignments`, {
    method: 'POST',
    expected: 201,
    headers: { 'x-request-id': assignmentTrace },
    body: { userId: bob.current.user.id, role: 'rule_editor' },
  });
  assert.deepEqual(
    {
      userId: assigned.document.userId,
      role: assigned.document.role,
      status: assigned.document.status,
      version: assigned.document.version,
    },
    { userId: bob.current.user.id, role: 'rule_editor', status: 'active', version: 1 },
  );
  const granted = await jsonRequest(bob.client, `${api}/v1/policy-sources`, { expected: 200 });
  assert.ok(Array.isArray(granted.document.items));
  const enterpriseBoundary = await jsonRequest(
    bob.client,
    `${api}/v1/tenants/${scopes.aliceScope.tenantId}/members`,
    { headers: { 'x-tenant-id': scopes.aliceScope.tenantId } },
  );
  assert.equal(enterpriseBoundary.response.status, 404);

  const revokeTrace = `r5-postgres-revoke-${Date.now()}`;
  const revoked = await jsonRequest(
    elevated.client,
    `${api}/v1/operations/role-assignments/${bob.current.user.id}/rule_editor/revoke`,
    {
      method: 'POST',
      expected: 200,
      headers: { 'x-request-id': revokeTrace },
      body: { expectedVersion: 1, reason: 'R5 PostgreSQL acceptance revocation' },
    },
  );
  assert.equal(revoked.document.status, 'removed');
  assert.equal(revoked.document.version, 2);
  const afterRevocation = await jsonRequest(bob.client, `${api}/v1/policy-sources`);
  assert.equal(afterRevocation.response.status, 403);

  pass('postgresql-platform-role-http-governance', {
    stepUpRequired: true,
    selfGrantRejected: true,
    nonAdministratorRejected: true,
    assignmentAppliedImmediately: true,
    revocationAppliedImmediately: true,
    tenantBoundaryPreserved: true,
    assignmentTrace,
    revokeTrace,
  });
}

async function verifyDatabaseEvidence(alice, bob) {
  const assignments = await pool.query(
    `select user_id, role, status, version from platform_role_assignments
     where (user_id = $1 and role = 'platform_admin') or (user_id = $2 and role = 'rule_editor')
     order by role`,
    [alice.current.user.id, bob.current.user.id],
  );
  assert.equal(assignments.rows.length, 2);
  assert.deepEqual(
    assignments.rows.map((row) => ({ role: row.role, status: row.status, version: row.version })),
    [
      { role: 'platform_admin', status: 'active', version: 1 },
      { role: 'rule_editor', status: 'removed', version: 2 },
    ],
  );

  const audits = await pool.query(
    `select tenant_id, actor_id, action, resource_id, trace_id, metadata
     from audit_events where action in
     ('platform_role.bootstrap', 'platform_role.assigned', 'platform_role.revoked')
     order by occurred_at`,
  );
  const outbox = await pool.query(
    `select tenant_id, event_type, aggregate_id, payload
     from outbox_events where event_type in
     ('platform_role.bootstrapped.v1', 'platform_role.assigned.v1', 'platform_role.revoked.v1')
     order by occurred_at`,
  );
  assert.deepEqual(
    audits.rows.map((row) => row.action),
    ['platform_role.bootstrap', 'platform_role.assigned', 'platform_role.revoked'],
  );
  assert.deepEqual(
    outbox.rows.map((row) => row.event_type),
    ['platform_role.bootstrapped.v1', 'platform_role.assigned.v1', 'platform_role.revoked.v1'],
  );
  for (const row of [...audits.rows, ...outbox.rows]) {
    assert.equal(row.tenant_id, null);
    assertNoSensitiveEvidence(row);
  }
  assert.equal(audits.rows[1].resource_id, bob.current.user.id);
  assert.equal(outbox.rows[1].aggregate_id, bob.current.user.id);
  assert.equal(audits.rows[1].metadata.targetUserId, bob.current.user.id);
  assert.equal(outbox.rows[2].payload.targetUserId, bob.current.user.id);
  pass('postgresql-global-audit-and-outbox', {
    auditActions: audits.rows.map((row) => row.action),
    outboxEvents: outbox.rows.map((row) => row.event_type),
    tenantIdsAreNull: true,
    sensitiveEvidenceAbsent: true,
  });
}

async function stepUp(identity) {
  const transaction = await begin('step-up', identity.client, '/operations/roles');
  const authorized = await jsonRequest(new CookieClient(), `${provider}/__test/login`, {
    method: 'POST',
    body: {
      transactionId: transaction.providerTransactionId,
      email: identity.email,
      password: identity.password,
      otp,
    },
  });
  assert.equal(authorized.response.status, 302);
  const current = await callback(
    transaction.apiClient,
    authorized.response.headers.get('location'),
  );
  assert.deepEqual(current.session.authMethods, ['pwd', 'otp']);
  return { ...identity, client: transaction.apiClient, current };
}

async function seedAdministrator(userId, expectSuccess) {
  const invocation = commandInvocation('pnpm', ['identity:seed-admin', userId]);
  const result = spawnSync(invocation.command, invocation.args, {
    cwd: rootDirectory,
    env: { ...process.env, ALLOW_PLATFORM_ADMIN_BOOTSTRAP: 'true' },
    encoding: 'utf8',
    shell: false,
    windowsVerbatimArguments: invocation.windowsVerbatimArguments,
  });
  if (expectSuccess) {
    assert.equal(result.status, 0, result.stderr || result.stdout);
    assert.match(result.stdout, /bootstrapped/u);
  } else {
    assert.notEqual(result.status, 0);
    assert.match(result.stderr, /already exists/u);
  }
}

async function begin(intent, apiClient, returnTo) {
  const result = await jsonRequest(apiClient, `${api}/v1/auth/${intent}`, {
    method: 'POST',
    expected: 201,
    body: { returnTo },
  });
  const providerStart = await jsonRequest(new CookieClient(), result.document.authorizationUrl, {
    expected: 200,
  });
  return { apiClient, providerTransactionId: providerStart.document.transactionId };
}

async function callback(apiClient, location) {
  assert.ok(location);
  const url = new URL(location);
  const result = await jsonRequest(apiClient, `${api}/v1/auth/callback`, {
    method: 'POST',
    expected: 200,
    body: { code: url.searchParams.get('code'), state: url.searchParams.get('state') },
  });
  return result.document;
}

async function bootstrap(client, tenantName, companyName, unifiedSocialCreditCode) {
  const result = await jsonRequest(client, `${api}/v1/tenants/bootstrap`, {
    method: 'POST',
    expected: 201,
    body: {
      tenantName,
      company: { name: companyName, unifiedSocialCreditCode, provinceCode: '32', cityCode: '3201' },
    },
  });
  return result.document;
}

function assertNoSensitiveEvidence(value) {
  const serialized = JSON.stringify(value);
  assert.doesNotMatch(
    serialized,
    /password|passcode|otp|cookie|authorization|client[_-]?secret|access[_-]?token|refresh[_-]?token/iu,
  );
}

function pass(name, evidence) {
  checks.push({ name, ok: true, evidence });
}
