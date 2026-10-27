import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createApp } from '../src/http/app.js';

async function listen(server) {
  await new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', resolve);
  });
  return `http://127.0.0.1:${server.address().port}`;
}

async function close(server) {
  await new Promise((resolve, reject) => {
    server.close((error) => error ? reject(error) : resolve());
  });
}

test('GET /health returns the expected JSON from a real HTTP request', async (t) => {
  const server = createApp();
  const baseUrl = await listen(server);
  t.after(() => close(server));

  const response = await fetch(`${baseUrl}/health`);
  assert.equal(response.status, 200);
  assert.match(response.headers.get('content-type'), /application\/json/);
  assert.deepEqual(await response.json(), { status: 'ok' });
});

test('unknown API paths and malformed JSON return the common JSON error shape', async (t) => {
  const server = createApp();
  const baseUrl = await listen(server);
  t.after(() => close(server));

  const unknown = await fetch(`${baseUrl}/api/not-implemented`);
  assert.equal(unknown.status, 404);
  assert.deepEqual(await unknown.json(), {
    error: { code: 'NOT_FOUND', message: 'API route not found' }
  });

  const badJson = await fetch(`${baseUrl}/api/anything`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: '{"unfinished":'
  });
  assert.equal(badJson.status, 400);
  assert.deepEqual(await badJson.json(), {
    error: { code: 'BAD_JSON', message: 'Request body must contain valid JSON' }
  });
});

test('static file paths cannot escape the configured public directory', async (t) => {
  const server = createApp({ publicDir: new URL('../src/domain/', import.meta.url) });
  const baseUrl = await listen(server);
  t.after(() => close(server));

  const allowed = await fetch(`${baseUrl}/errors.js`);
  assert.equal(allowed.status, 200);
  assert.match(await allowed.text(), /DomainError/);

  const traversal = await fetch(`${baseUrl}/%2e%2e%2fREADME.md`);
  assert.equal(traversal.status, 404);
  assert.deepEqual(await traversal.json(), {
    error: { code: 'NOT_FOUND', message: 'Resource not found' }
  });
});
