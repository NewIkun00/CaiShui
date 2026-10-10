import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import { resolve } from 'node:path';
import { renderRealm } from '../lib/realm.mjs';

const templatePath = resolve(import.meta.dirname, '../keycloak/realm.template.json');

test('renders a valid realm without unresolved placeholders', async () => {
  const values = {
    R5_OIDC_ADMIN_CLIENT_SECRET: 'secret-value',
    R5_ALICE_EMAIL: 'alice@example.test',
    R5_ALICE_PASSWORD: 'alice-password',
    R5_BOB_EMAIL: 'bob@example.test',
    R5_BOB_PASSWORD: 'bob-password',
  };
  const result = renderRealm(await readFile(templatePath, 'utf8'), values, { R5_WEB_PORT: 3020 });
  assert.equal(result.document.realm, 'ledgerly');
  assert.equal(result.document.clients[0].redirectUris[0], 'http://localhost:3020/auth/callback');
  assert.equal(result.rendered.includes('__R5_'), false);
  assert.equal(result.document.clients[1].secret, 'secret-value');
});

test('fails closed when a required realm value is absent', async () => {
  assert.throws(() => renderRealm(awaitValue(), {}, { R5_WEB_PORT: 3020 }), /required/u);
});

function awaitValue() {
  return '{"realm":"ledgerly","secret":"__R5_OIDC_ADMIN_CLIENT_SECRET__"}';
}
