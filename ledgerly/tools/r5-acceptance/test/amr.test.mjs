import assert from 'node:assert/strict';
import test from 'node:test';
import { selectAmrExecutions } from '../lib/amr.mjs';

test('selects password, OTP and WebAuthn Browser Flow executions', () => {
  const selected = selectAmrExecutions([
    { id: 'pwd', displayName: 'Username Password Form' },
    { id: 'otp', providerId: 'auth-otp-form' },
    { id: 'web', displayName: 'WebAuthn Authenticator' },
  ]);

  assert.equal(selected.pwd.id, 'pwd');
  assert.equal(selected.otp.id, 'otp');
  assert.equal(selected.webauthn.id, 'web');
});
