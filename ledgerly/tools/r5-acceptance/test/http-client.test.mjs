import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import test from 'node:test';
import { CookieClient, jsonRequest } from '../lib/http-client.mjs';

test('keeps HttpOnly cookies between requests and removes cleared cookies', async (context) => {
  const received = [];
  const server = createServer((request, response) => {
    received.push(request.headers.cookie ?? '');
    if (request.url === '/set') {
      response.writeHead(200, {
        'content-type': 'application/json',
        'set-cookie': 'ledgerly_session=session-1; Path=/; HttpOnly; SameSite=Lax',
      });
      response.end('{"ok":true}');
    } else {
      response.writeHead(200, {
        'content-type': 'application/json',
        'set-cookie': 'ledgerly_session=; Path=/; Max-Age=0',
      });
      response.end('{"ok":true}');
    }
  });
  await new Promise((accept) => server.listen(0, '127.0.0.1', accept));
  context.after(() => server.close());
  const address = server.address();
  assert.equal(typeof address, 'object');
  const origin = `http://127.0.0.1:${address.port}`;
  const client = new CookieClient();
  await jsonRequest(client, `${origin}/set`, { expected: 200 });
  assert.equal(client.value('ledgerly_session'), 'session-1');
  await jsonRequest(client, `${origin}/clear`, { expected: 200 });
  assert.equal(received[1], 'ledgerly_session=session-1');
  assert.equal(client.value('ledgerly_session'), undefined);
});

test('preserves structured error bodies for status assertions', async (context) => {
  const server = createServer((_request, response) => {
    response.writeHead(403, { 'content-type': 'application/json' });
    response.end('{"error":{"code":"STEP_UP_REQUIRED"}}');
  });
  await new Promise((accept) => server.listen(0, '127.0.0.1', accept));
  context.after(() => server.close());
  const address = server.address();
  assert.equal(typeof address, 'object');
  const result = await jsonRequest(new CookieClient(), `http://127.0.0.1:${address.port}/`);
  assert.equal(result.response.status, 403);
  assert.equal(result.document.error.code, 'STEP_UP_REQUIRED');
});
