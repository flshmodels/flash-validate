import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { createApi, fail, method } from '../src/http.mjs';
import { fixture } from './fixture.mjs';
const create = options => createApi({ name: 'fixture', ...options, handler: async ({ request, path, json }) => {
  if (path !== '/echo') fail(404, 'not_found', 'Unknown route.');
  method(request, ['POST']); return { body: await json() };
} });

test('health and successful JSON responses have explicit no-store headers', async t => {
  const { call } = await fixture(t, create());
  assert.equal((await call('/health')).body.status, 'ok');
  const result = await call('/echo', { method: 'POST', body: { sample: true } });
  assert.deepEqual(result.body, { sample: true });
  assert.equal(result.headers.get('cache-control'), 'no-store');
});
test('bearer authentication protects routes while health stays public', async t => {
  const token = 'x'.repeat(32);
  const { call } = await fixture(t, create({ token }));
  assert.equal((await call('/health')).status, 200);
  assert.equal((await call('/echo', { method: 'POST', body: {} })).status, 401);
  assert.equal((await call('/echo', { method: 'POST', body: {}, headers: { authorization: `Bearer ${'y'.repeat(32)}` } })).status, 401);
  assert.equal((await call('/echo', { method: 'POST', body: {}, headers: { authorization: `Bearer ${token}` } })).status, 200);
  assert.throws(() => create({ token: 'short' }));
});
test('malformed JSON, non-finite numbers, invalid UTF-8 and deeply nested bodies are rejected', async t => {
  const { call } = await fixture(t, create());
  for (const raw of ['{broken', '1e999', '['.repeat(34) + '0' + ']'.repeat(34), new Uint8Array([0xff])]) {
    assert.equal((await call('/echo', { method: 'POST', raw, headers: { 'content-type': 'application/json' } })).status, 400);
  }
});
test('wrong media type and compressed bodies are refused', async t => {
  const { call } = await fixture(t, create());
  assert.equal((await call('/echo', { method: 'POST', raw: '{}' })).status, 415);
  assert.equal((await call('/echo', { method: 'POST', body: {}, headers: { 'content-encoding': 'gzip' } })).status, 415);
});
test('oversized bodies produce a JSON error and the server remains usable', async t => {
  const { call } = await fixture(t, create());
  const result = await call('/echo', { method: 'POST', body: 'x'.repeat(65536) });
  assert.equal(result.status, 413);
  assert.equal(result.body.error.code, 'body_too_large');
  assert.equal((await call('/echo', { method: 'POST', body: null })).status, 200);
});
test('unknown routes, wrong methods, and unsupported queries are distinguished', async t => {
  const { call } = await fixture(t, create());
  assert.equal((await call('/missing')).status, 404);
  assert.equal((await call('/echo')).status, 405);
  assert.equal((await call('/echo?unexpected=true', { method: 'POST', body: {} })).status, 400);
});
test('entrypoint refuses invalid ports and unauthenticated external binding', () => {
  for (const env of [{ PORT: 'nope' }, { HOST: '0.0.0.0', API_TOKEN: '', PORT: '4319' }]) {
    const result = spawnSync(process.execPath, ['src/server.mjs'], { env: { ...process.env, ...env }, encoding: 'utf8', timeout: 5000 });
    assert.equal(result.status, 1, result.stderr);
  }
});
