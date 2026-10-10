import { createServer } from 'node:https';
import { createHash, generateKeyPairSync, randomBytes, randomUUID, sign } from 'node:crypto';
import { readFileSync } from 'node:fs';

const port = Number(process.env.R5_MOCK_OIDC_PORT ?? 58555);
const issuer = `https://127.0.0.1:${port}/realms/ledgerly`;
const clientId = 'ledgerly-web';
const adminClientId = 'ledgerly-session-revoker';
const adminSecret = process.env.R5_OIDC_ADMIN_CLIENT_SECRET ?? 'simulated-admin-secret';
const otp = process.env.R5_MOCK_OTP ?? '123456';
const { privateKey, publicKey } = generateKeyPairSync('rsa', { modulusLength: 2048 });
const keyId = randomUUID();
const jwk = { ...publicKey.export({ format: 'jwk' }), kid: keyId, use: 'sig', alg: 'RS256' };
const transactions = new Map();
const codes = new Map();
const users = new Map();
const actionTokens = new Map();
const messages = [];
const sessions = new Map();

seed(
  process.env.R5_ALICE_EMAIL ?? 'alice@example.test',
  process.env.R5_ALICE_PASSWORD ?? 'alice-password',
  'Alice Acceptance',
);
seed(
  process.env.R5_BOB_EMAIL ?? 'bob@example.test',
  process.env.R5_BOB_PASSWORD ?? 'bob-password',
  'Bob Acceptance',
);

const certificatePath = process.env.R5_MOCK_TLS_CERT;
const keyPath = process.env.R5_MOCK_TLS_KEY;
if (!certificatePath || !keyPath)
  throw new Error('R5_MOCK_TLS_CERT and R5_MOCK_TLS_KEY are required');
const server = createServer(
  { cert: readFileSync(certificatePath), key: readFileSync(keyPath) },
  async (request, response) => {
    try {
      await route(request, response);
    } catch (error) {
      send(response, 500, { error: error instanceof Error ? error.message : String(error) });
    }
  },
);
server.listen(port, '127.0.0.1', () => {
  process.stdout.write(`${JSON.stringify({ ok: true, issuer, mode: 'simulation-only' })}\n`);
});

async function route(request, response) {
  const url = new URL(request.url, issuer);
  if (
    request.method === 'GET' &&
    url.pathname === '/realms/ledgerly/.well-known/openid-configuration'
  ) {
    return send(response, 200, {
      issuer,
      authorization_endpoint: `${issuer}/protocol/openid-connect/auth`,
      registration_endpoint: `${issuer}/protocol/openid-connect/registrations`,
      token_endpoint: `${issuer}/protocol/openid-connect/token`,
      jwks_uri: `${issuer}/protocol/openid-connect/certs`,
    });
  }
  if (
    request.method === 'GET' &&
    url.pathname === '/realms/ledgerly/protocol/openid-connect/certs'
  ) {
    return send(response, 200, { keys: [jwk] });
  }
  if (
    request.method === 'GET' &&
    [
      '/realms/ledgerly/protocol/openid-connect/auth',
      '/realms/ledgerly/protocol/openid-connect/registrations',
    ].includes(url.pathname)
  ) {
    const transactionId = randomUUID();
    const transaction = Object.fromEntries(url.searchParams);
    assertAuthorization(transaction);
    transactions.set(transactionId, {
      ...transaction,
      intent: url.pathname.endsWith('registrations')
        ? 'register'
        : transaction.prompt === 'login'
          ? 'step-up'
          : 'login',
    });
    return send(response, 200, { transactionId, intent: transactions.get(transactionId).intent });
  }
  if (request.method === 'POST' && url.pathname === '/__test/register') {
    const body = await jsonBody(request);
    const transaction = transactions.get(body.transactionId);
    if (!transaction || transaction.intent !== 'register')
      return send(response, 400, { error: 'invalid_transaction' });
    const email = normalize(body.email);
    if (users.has(email)) return send(response, 409, { error: 'email_exists' });
    if (String(body.password ?? '').length < 12)
      return send(response, 400, { error: 'weak_password' });
    users.set(email, {
      email,
      password: body.password,
      displayName: body.displayName ?? 'Registered User',
      subject: randomUUID(),
      verified: false,
    });
    const token = randomBytes(32).toString('base64url');
    actionTokens.set(token, {
      email,
      transactionId: body.transactionId,
      expiresAt: Date.now() + 10 * 60_000,
    });
    const verificationUrl = `${issuer}/login-actions/action-token?key=${encodeURIComponent(token)}`;
    messages.push({
      id: randomUUID(),
      recipient: email,
      kind: 'verify-email',
      verificationUrl,
      createdAt: new Date().toISOString(),
    });
    return send(response, 201, { status: 'verification_required' });
  }
  if (request.method === 'POST' && url.pathname === '/__test/login') {
    const body = await jsonBody(request);
    const transaction = transactions.get(body.transactionId);
    if (!transaction || transaction.intent === 'register')
      return send(response, 400, { error: 'invalid_transaction' });
    const user = users.get(normalize(body.email));
    if (!user || user.password !== body.password)
      return send(response, 401, { error: 'invalid_credentials' });
    if (!user.verified) return send(response, 403, { error: 'email_not_verified' });
    if (transaction.intent === 'step-up' && body.otp !== otp)
      return send(response, 401, { error: 'otp_invalid' });
    return redirect(
      response,
      authorize(transaction, user, transaction.intent === 'step-up' ? ['pwd', 'otp'] : ['pwd']),
    );
  }
  if (request.method === 'GET' && url.pathname === '/realms/ledgerly/login-actions/action-token') {
    const token = url.searchParams.get('key');
    const action = token ? actionTokens.get(token) : undefined;
    if (!action || action.expiresAt <= Date.now())
      return send(response, 410, { error: 'action_token_expired' });
    const user = users.get(action.email);
    const transaction = transactions.get(action.transactionId);
    if (!user || !transaction) return send(response, 400, { error: 'action_token_invalid' });
    user.verified = true;
    actionTokens.delete(token);
    return redirect(response, authorize(transaction, user, ['pwd']));
  }
  if (request.method === 'POST' && url.pathname === '/__test/expire-action-token') {
    const body = await jsonBody(request);
    const action = actionTokens.get(body.token);
    if (!action) return send(response, 404, { error: 'action_token_not_found' });
    action.expiresAt = 0;
    return send(response, 200, { expired: true });
  }
  if (request.method === 'GET' && url.pathname === '/__test/messages') {
    const recipient = normalize(url.searchParams.get('recipient') ?? '');
    return send(response, 200, {
      messages: messages.filter((item) => item.recipient === recipient),
    });
  }
  if (request.method === 'GET' && url.pathname === '/__test/sessions') {
    const recipient = normalize(url.searchParams.get('recipient') ?? '');
    const active = [...sessions.values()].filter((item) => item.user === recipient).length;
    return send(response, 200, { active });
  }
  if (request.method === 'GET' && url.pathname.startsWith('/__test/sessions/')) {
    const id = decodeURIComponent(url.pathname.slice('/__test/sessions/'.length));
    return send(response, sessions.has(id) ? 200 : 404, { active: sessions.has(id) });
  }
  if (
    request.method === 'POST' &&
    url.pathname === '/realms/ledgerly/protocol/openid-connect/token'
  ) {
    const body = new URLSearchParams(await bodyText(request));
    if (body.get('grant_type') === 'client_credentials') {
      if (body.get('client_id') !== adminClientId || body.get('client_secret') !== adminSecret)
        return send(response, 401, { error: 'invalid_client' });
      return send(response, 200, {
        access_token: 'simulated-admin-token',
        token_type: 'Bearer',
        expires_in: 60,
      });
    }
    const record = codes.get(body.get('code'));
    if (!record || record.used) return send(response, 400, { error: 'invalid_grant' });
    const challenge = createHash('sha256')
      .update(body.get('code_verifier') ?? '')
      .digest('base64url');
    if (
      challenge !== record.codeChallenge ||
      body.get('redirect_uri') !== record.redirectUri ||
      body.get('client_id') !== clientId
    )
      return send(response, 400, { error: 'invalid_grant' });
    record.used = true;
    return send(response, 200, {
      id_token: idToken(record),
      token_type: 'Bearer',
      expires_in: 3600,
    });
  }
  if (request.method === 'DELETE' && url.pathname.startsWith('/admin/realms/ledgerly/sessions/')) {
    if (request.headers.authorization !== 'Bearer simulated-admin-token')
      return send(response, 401, { error: 'unauthorized' });
    sessions.delete(
      decodeURIComponent(url.pathname.slice('/admin/realms/ledgerly/sessions/'.length)),
    );
    response.writeHead(204).end();
    return;
  }
  return send(response, 404, { error: 'not_found' });
}

function authorize(transaction, user, amr) {
  const code = randomBytes(32).toString('base64url');
  const providerSessionId = randomUUID();
  sessions.set(providerSessionId, { user: user.email });
  codes.set(code, {
    user,
    nonce: transaction.nonce,
    codeChallenge: transaction.code_challenge,
    redirectUri: transaction.redirect_uri,
    amr,
    providerSessionId,
    used: false,
  });
  const callback = new URL(transaction.redirect_uri);
  callback.searchParams.set('code', code);
  callback.searchParams.set('state', transaction.state);
  return callback.toString();
}

function idToken(record) {
  const now = Math.floor(Date.now() / 1000);
  const header = Buffer.from(JSON.stringify({ alg: 'RS256', kid: keyId, typ: 'JWT' })).toString(
    'base64url',
  );
  const claims = Buffer.from(
    JSON.stringify({
      iss: issuer,
      sub: record.user.subject,
      aud: clientId,
      exp: now + 3600,
      iat: now,
      auth_time: now,
      nonce: record.nonce,
      sid: record.providerSessionId,
      name: record.user.displayName,
      email: record.user.email,
      amr: record.amr,
    }),
  ).toString('base64url');
  const signature = sign('RSA-SHA256', Buffer.from(`${header}.${claims}`), privateKey).toString(
    'base64url',
  );
  return `${header}.${claims}.${signature}`;
}

function assertAuthorization(transaction) {
  if (
    transaction.client_id !== clientId ||
    transaction.response_type !== 'code' ||
    transaction.code_challenge_method !== 'S256' ||
    !transaction.state ||
    !transaction.nonce ||
    !transaction.code_challenge ||
    !transaction.redirect_uri
  )
    throw new Error('Invalid simulated authorization request');
}

function seed(email, password, displayName) {
  const normalized = normalize(email);
  users.set(normalized, {
    email: normalized,
    password,
    displayName,
    subject: randomUUID(),
    verified: true,
  });
}

function normalize(value) {
  return String(value).trim().toLowerCase();
}
function redirect(response, location) {
  response.writeHead(302, { location }).end();
}
function send(response, status, body) {
  response
    .writeHead(status, {
      'content-type': 'application/json; charset=utf-8',
      'cache-control': 'no-store',
    })
    .end(JSON.stringify(body));
}
async function jsonBody(request) {
  return JSON.parse((await bodyText(request)) || '{}');
}
async function bodyText(request) {
  const chunks = [];
  for await (const chunk of request) chunks.push(chunk);
  return Buffer.concat(chunks).toString('utf8');
}

for (const signal of ['SIGINT', 'SIGTERM'])
  process.on(signal, () => server.close(() => process.exit(0)));
