import assert from 'node:assert/strict';
import test from 'node:test';
import { validatePostgresSimulationEnvironment } from '../lib/storage-mode.mjs';

test('requires an explicit disposable-database confirmation and PostgreSQL URL', () => {
  assert.throws(
    () => validatePostgresSimulationEnvironment({ DATABASE_URL: 'postgresql://localhost/r5' }),
    /CONFIRM_ISOLATED_DATABASE/u,
  );
  assert.throws(
    () =>
      validatePostgresSimulationEnvironment({
        R5_ACCEPTANCE_CONFIRM_ISOLATED_DATABASE: 'true',
      }),
    /DATABASE_URL is required/u,
  );
  assert.throws(
    () =>
      validatePostgresSimulationEnvironment({
        R5_ACCEPTANCE_CONFIRM_ISOLATED_DATABASE: 'true',
        DATABASE_URL: 'https://localhost/r5',
      }),
    /postgres or postgresql/u,
  );
});

test('accepts an explicitly confirmed named PostgreSQL database', () => {
  assert.deepEqual(
    validatePostgresSimulationEnvironment({
      R5_ACCEPTANCE_CONFIRM_ISOLATED_DATABASE: 'true',
      DATABASE_URL: 'postgresql://ledgerly:secret@127.0.0.1:55432/ledgerly_r5',
    }),
    { databaseUrl: 'postgresql://ledgerly:secret@127.0.0.1:55432/ledgerly_r5' },
  );
});
