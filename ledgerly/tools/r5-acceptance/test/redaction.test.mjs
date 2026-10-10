import assert from 'node:assert/strict';
import test from 'node:test';
import { redact } from '../lib/redaction.mjs';

test('redacts nested secrets, cookies, tokens and authorization headers', () => {
  const result = redact({
    password: 'visible',
    nested: { authorization: 'Bearer abc.def', safe: 'ok' },
    cookies: ['a=b'],
    url: 'https://example.test/cb?code=abc&state=def',
  });
  assert.equal(result.password, '[REDACTED]');
  assert.equal(result.nested.authorization, '[REDACTED]');
  assert.equal(result.nested.safe, 'ok');
  assert.equal(result.cookies, '[REDACTED]');
  assert.match(result.url, /code=\[REDACTED\]/u);
  assert.match(result.url, /state=\[REDACTED\]/u);
});
