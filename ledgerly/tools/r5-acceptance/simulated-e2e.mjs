import assert from 'node:assert/strict';
import { resolve } from 'node:path';
import { CookieClient, jsonRequest } from './lib/http-client.mjs';
import { acceptancePaths, writeJson } from './lib/runtime.mjs';

const rootDirectory = resolve(import.meta.dirname, '../..');
const paths = acceptancePaths(rootDirectory);
const api = `http://127.0.0.1:${process.env.R5_API_PORT ?? 3001}`;
const provider = `https://127.0.0.1:${process.env.R5_MOCK_OIDC_PORT ?? 58555}`;
const aliceEmail = process.env.R5_ALICE_EMAIL ?? 'alice@example.test';
const alicePassword = process.env.R5_ALICE_PASSWORD ?? 'alice-password';
const bobEmail = process.env.R5_BOB_EMAIL ?? 'bob@example.test';
const bobPassword = process.env.R5_BOB_PASSWORD ?? 'bob-password';
const otp = process.env.R5_MOCK_OTP ?? '123456';
const checks = [];

try {
  await registrationAndEmailVerification();
  const alice = await login(aliceEmail, alicePassword);
  const bob = await login(bobEmail, bobPassword);
  const scope = await authorizationMatrix(alice, bob);
  await stepUpAndLogout(alice, bob, scope);
} catch (error) {
  checks.push({
    name: 'suite',
    ok: false,
    error: error instanceof Error ? error.message : String(error),
  });
}

const report = {
  schemaVersion: 1,
  kind: 'R5_SIMULATED_EXTERNAL_SERVICES',
  productionEvidence: false,
  startedAt: new Date().toISOString(),
  ok: checks.every((item) => item.ok),
  checks,
  simulated: ['OIDC provider', 'email delivery', 'email action token', 'OTP challenge'],
  notCovered: [
    'real Keycloak HTML/theme behavior',
    'real SMTP provider',
    'SMS provider',
    'PostgreSQL platform-role bootstrap and audit/outbox E2E',
  ],
};
const reportPath = resolve(
  paths.reports,
  `simulated-${new Date().toISOString().replaceAll(':', '-')}.json`,
);
await writeJson(reportPath, report);
console.log(JSON.stringify({ ...report, reportPath }, null, 2));
if (!report.ok) process.exitCode = 1;

async function registrationAndEmailVerification() {
  const suffix = Date.now();
  const email = `r5-${suffix}@example.test`;
  const password = `Simulated-${suffix}-Password`;
  const registration = await begin('register', new CookieClient(), '/onboarding');
  await jsonRequest(new CookieClient(), `${provider}/__test/register`, {
    method: 'POST',
    expected: 201,
    body: {
      transactionId: registration.providerTransactionId,
      email,
      password,
      displayName: '注册验收用户',
    },
  });

  const unverified = await begin('login', new CookieClient(), '/dashboard');
  const unverifiedAttempt = await jsonRequest(new CookieClient(), `${provider}/__test/login`, {
    method: 'POST',
    body: { transactionId: unverified.providerTransactionId, email, password },
  });
  assert.equal(unverifiedAttempt.response.status, 403);
  assert.equal(unverifiedAttempt.document.error, 'email_not_verified');

  const inbox = await jsonRequest(
    new CookieClient(),
    `${provider}/__test/messages?recipient=${encodeURIComponent(email)}`,
    { expected: 200 },
  );
  assert.equal(inbox.document.messages.length, 1);
  const verificationUrl = inbox.document.messages[0].verificationUrl;
  const verification = await fetch(verificationUrl, { redirect: 'manual' });
  assert.equal(verification.status, 302);
  const completed = await callback(registration.apiClient, verification.headers.get('location'));
  assert.equal(completed.returnTo, '/onboarding');
  assert.equal(completed.memberships.length, 0);

  const duplicate = await begin('register', new CookieClient(), '/onboarding');
  const duplicateAttempt = await jsonRequest(new CookieClient(), `${provider}/__test/register`, {
    method: 'POST',
    body: { transactionId: duplicate.providerTransactionId, email, password },
  });
  assert.equal(duplicateAttempt.response.status, 409);
  assert.equal(duplicateAttempt.document.error, 'email_exists');

  const expiredEmail = `expired-${suffix}@example.test`;
  const expired = await begin('register', new CookieClient(), '/onboarding');
  await jsonRequest(new CookieClient(), `${provider}/__test/register`, {
    method: 'POST',
    expected: 201,
    body: { transactionId: expired.providerTransactionId, email: expiredEmail, password },
  });
  const expiredInbox = await jsonRequest(
    new CookieClient(),
    `${provider}/__test/messages?recipient=${encodeURIComponent(expiredEmail)}`,
    { expected: 200 },
  );
  const expiredUrl = new URL(expiredInbox.document.messages[0].verificationUrl);
  await jsonRequest(new CookieClient(), `${provider}/__test/expire-action-token`, {
    method: 'POST',
    expected: 200,
    body: { token: expiredUrl.searchParams.get('key') },
  });
  const expiredAttempt = await fetch(expiredUrl, { redirect: 'manual' });
  assert.equal(expiredAttempt.status, 410);
  pass('registration-email-verification', {
    duplicateRejected: true,
    unverifiedRejected: true,
    expiredTokenRejected: true,
  });
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
  pass(`login-${email === aliceEmail ? 'alice' : 'bob'}`, { userId: current.user.id });
  return { client: transaction.apiClient, current, email, password };
}

async function authorizationMatrix(alice, bob) {
  const aliceTenant = await bootstrap(
    alice.client,
    'R5 Alice Tenant',
    'R5 Alice Company',
    '913200001234567890',
  );
  const bobTenant = await bootstrap(
    bob.client,
    'R5 Bob Tenant',
    'R5 Bob Company',
    '913200001234567891',
  );

  const crossTenant = await jsonRequest(
    alice.client,
    `${api}/v1/tenants/${bobTenant.tenantId}/members`,
    {
      headers: { 'x-tenant-id': bobTenant.tenantId },
    },
  );
  assert.equal(crossTenant.response.status, 404);

  const invitation = await jsonRequest(
    alice.client,
    `${api}/v1/tenants/${aliceTenant.tenantId}/invitations`,
    {
      method: 'POST',
      expected: 201,
      headers: { 'x-tenant-id': aliceTenant.tenantId },
      body: {
        identifier: bobEmail,
        roles: ['member'],
        companyIds: [aliceTenant.company.id],
        expiresInHours: 24,
      },
    },
  );
  assert.ok(invitation.document.developmentToken);
  const membership = await jsonRequest(bob.client, `${api}/v1/tenant-invitations/accept`, {
    method: 'POST',
    expected: 200,
    body: { token: invitation.document.developmentToken },
  });

  const lowRoleWrite = await jsonRequest(
    bob.client,
    `${api}/v1/companies/${aliceTenant.company.id}/scope-evaluations`,
    {
      method: 'POST',
      headers: { 'x-tenant-id': aliceTenant.tenantId },
      body: {},
    },
  );
  assert.equal(lowRoleWrite.response.status, 403);
  assert.equal(lowRoleWrite.document.error.code, 'CUSTOMER_PERMISSION_DENIED');

  const crossCompany = await jsonRequest(
    bob.client,
    `${api}/v1/companies/${bobTenant.company.id}/scope-evaluations/latest`,
    {
      headers: { 'x-tenant-id': aliceTenant.tenantId },
    },
  );
  assert.equal(crossCompany.response.status, 403);
  assert.equal(crossCompany.document.error.code, 'COMPANY_SCOPE_DENIED');

  const devHeader = await jsonRequest(alice.client, `${api}/v1/auth/me`, {
    headers: { 'x-user-id': alice.current.user.id },
  });
  assert.equal(devHeader.response.status, 401);

  pass('authorization-matrix', {
    crossTenant: 404,
    lowRoleWrite: 403,
    crossCompany: 403,
    developmentHeader: 401,
  });
  return { aliceTenant, bobTenant, bobMembership: membership.document };
}

async function stepUpAndLogout(alice, bob, scope) {
  const highRiskPath = `${api}/v1/companies/${scope.aliceTenant.company.id}/filing-packages/30000000-0000-4000-8000-000000000001/freeze`;
  const blocked = await jsonRequest(alice.client, highRiskPath, {
    method: 'POST',
    headers: { 'x-tenant-id': scope.aliceTenant.tenantId },
    body: { expectedVersion: 1 },
  });
  assert.equal(blocked.response.status, 403);
  assert.equal(blocked.document.error.code, 'STEP_UP_REQUIRED');

  const mismatch = await begin('step-up', alice.client, '/filings');
  const mismatchAuthorization = await jsonRequest(new CookieClient(), `${provider}/__test/login`, {
    method: 'POST',
    body: {
      transactionId: mismatch.providerTransactionId,
      email: bob.email,
      password: bob.password,
      otp,
    },
  });
  assert.equal(mismatchAuthorization.response.status, 302);
  const mismatchCallback = await jsonRequest(alice.client, `${api}/v1/auth/callback`, {
    method: 'POST',
    body: callbackBody(mismatchAuthorization.response.headers.get('location')),
  });
  assert.equal(mismatchCallback.response.status, 403);
  assert.equal(mismatchCallback.document.error.code, 'STEP_UP_IDENTITY_MISMATCH');

  const oldSessionId = alice.client.value('ledgerly_session');
  const stepUp = await begin('step-up', alice.client, '/filings');
  const authorized = await jsonRequest(new CookieClient(), `${provider}/__test/login`, {
    method: 'POST',
    body: {
      transactionId: stepUp.providerTransactionId,
      email: alice.email,
      password: alice.password,
      otp,
    },
  });
  const elevated = await callback(alice.client, authorized.response.headers.get('location'));
  assert.deepEqual(elevated.session.authMethods, ['pwd', 'otp']);
  assert.notEqual(elevated.session.id, oldSessionId);
  const oldClient = new CookieClient();
  oldClient.set('ledgerly_session', oldSessionId);
  const oldSession = await jsonRequest(oldClient, `${api}/v1/auth/me`);
  assert.equal(oldSession.response.status, 401);

  const afterStepUp = await jsonRequest(alice.client, highRiskPath, {
    method: 'POST',
    headers: { 'x-tenant-id': scope.aliceTenant.tenantId },
    body: { expectedVersion: 1 },
  });
  assert.notEqual(afterStepUp.document?.error?.code, 'STEP_UP_REQUIRED');

  const deactivated = await jsonRequest(
    alice.client,
    `${api}/v1/tenants/${scope.aliceTenant.tenantId}/members/${bob.current.user.id}/deactivate`,
    {
      method: 'POST',
      expected: 200,
      headers: { 'x-tenant-id': scope.aliceTenant.tenantId },
      body: { expectedVersion: scope.bobMembership.version, reason: 'R5 模拟验收停用成员' },
    },
  );
  assert.equal(deactivated.document.status, 'suspended');
  const suspended = await jsonRequest(
    bob.client,
    `${api}/v1/companies/${scope.aliceTenant.company.id}/scope-evaluations/latest`,
    {
      headers: { 'x-tenant-id': scope.aliceTenant.tenantId },
    },
  );
  assert.equal(suspended.response.status, 404);

  const beforeLogout = await providerSessions(alice.email);
  const logout = await jsonRequest(alice.client, `${api}/v1/auth/logout`, {
    method: 'POST',
    expected: 200,
    body: {},
  });
  assert.equal(logout.document.providerRevoked, true);
  const afterLogout = await providerSessions(alice.email);
  assert.equal(afterLogout, beforeLogout - 1);
  const loggedOut = await jsonRequest(alice.client, `${api}/v1/auth/me`);
  assert.equal(loggedOut.response.status, 401);
  pass('step-up-logout-membership-revocation', {
    mismatchRejected: true,
    oldSessionRevoked: true,
    providerRevoked: true,
    suspendedMemberDenied: true,
  });
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
  const result = await jsonRequest(apiClient, `${api}/v1/auth/callback`, {
    method: 'POST',
    expected: 200,
    body: callbackBody(location),
  });
  return result.document;
}

function callbackBody(location) {
  assert.ok(location);
  const url = new URL(location);
  return { code: url.searchParams.get('code'), state: url.searchParams.get('state') };
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

async function providerSessions(email) {
  const result = await jsonRequest(
    new CookieClient(),
    `${provider}/__test/sessions?recipient=${encodeURIComponent(email)}`,
    { expected: 200 },
  );
  return result.document.active;
}

function pass(name, evidence) {
  checks.push({ name, ok: true, evidence });
}
