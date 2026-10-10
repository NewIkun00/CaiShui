import assert from 'node:assert/strict';
import test from 'node:test';
import { parseEnv, validateAcceptanceEnvironment } from '../lib/environment.mjs';
import { commandInvocation, commandName } from '../lib/runtime.mjs';

const valid = {
  R5_POSTGRES_PASSWORD: 'postgres-password',
  R5_KEYCLOAK_DB_PASSWORD: 'keycloak-db-password',
  R5_KEYCLOAK_ADMIN: 'admin',
  R5_KEYCLOAK_ADMIN_PASSWORD: 'admin-password',
  R5_OIDC_ADMIN_CLIENT_SECRET: 'client-secret-value',
  R5_ALICE_EMAIL: 'alice@example.test',
  R5_ALICE_PASSWORD: 'alice-password',
  R5_BOB_EMAIL: 'bob@example.test',
  R5_BOB_PASSWORD: 'bob-password',
  R5_AUTH_COOKIE_KEY: Buffer.alloc(32, 7).toString('base64'),
};

test('uses a non-shell Windows wrapper only for package-manager command files', () => {
  assert.equal(commandName('pnpm'), process.platform === 'win32' ? 'pnpm.cmd' : 'pnpm');
  const docker = commandInvocation('docker', ['version']);
  assert.equal(docker.command, 'docker');
  if (process.platform === 'win32') {
    const pnpm = commandInvocation('pnpm', ['--filter', '@ledgerly/api', 'build']);
    assert.equal(pnpm.command, process.env.ComSpec ?? 'cmd.exe');
    assert.deepEqual(pnpm.args.slice(0, 3), ['/d', '/s', '/c']);
    assert.match(pnpm.args[3], /pnpm\.cmd"/iu);
    assert.equal(pnpm.windowsVerbatimArguments, true);
  }
});

test('parses comments and quoted values without shell evaluation', () => {
  assert.deepEqual(parseEnv('# comment\nFOO="hello world"\nBAR=$(unsafe)\n'), {
    FOO: 'hello world',
    BAR: '$(unsafe)',
  });
});

test('accepts a complete isolated configuration', () => {
  assert.deepEqual(validateAcceptanceEnvironment(valid).errors, []);
});

test('rejects missing secrets, invalid keys, duplicate users and ports', () => {
  const result = validateAcceptanceEnvironment({
    ...valid,
    R5_AUTH_COOKIE_KEY: 'bad',
    R5_BOB_EMAIL: valid.R5_ALICE_EMAIL,
    R5_WEB_PORT: '3001',
  });
  assert.ok(result.errors.some((item) => item.includes('Base64')));
  assert.ok(result.errors.some((item) => item.includes('must be different')));
  assert.ok(result.errors.some((item) => item.includes('ports must be unique')));
});
