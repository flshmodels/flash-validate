import test from 'node:test';
import assert from 'node:assert/strict';
import { createService } from '../src/server.mjs';
import { fixture } from './fixture.mjs';
const schema = { type: 'object', properties: { name: { type: 'string', minLength: 2, maxLength: 20 }, level: { type: 'integer', minimum: 1, maximum: 10 } }, required: ['name', 'level'] };
const request = (schema, data) => ({ method: 'POST', body: { schema, data } });

test('valid objects pass and missing, extra and incorrect values produce useful paths', async t => {
  const { call } = await fixture(t, createService());
  assert.equal((await call('/v1/validate', request(schema, { name: 'Noah', level: 3 }))).body.valid, true);
  const result = await call('/v1/validate', request(schema, { name: 'a', level: 11, admin: true }));
  assert.equal(result.status, 200);
  assert.equal(result.body.valid, false);
  assert.deepEqual(result.body.errors.map(e => e.path), ['/name', '/level', '/admin']);
  assert.equal((await call('/v1/validate', request(schema, {}))).body.errors[0].code, 'required');
});
test('arrays, enums, booleans, nulls and safe integers are checked without coercion', async t => {
  const { call } = await fixture(t, createService());
  for (const [s, data, valid] of [
    [{ type: 'array', items: { type: 'integer' }, minItems: 1, maxItems: 2 }, [1, '2'], false],
    [{ type: 'string', enum: ['available', 'busy'] }, 'busy', true],
    [{ type: 'boolean' }, 'true', false], [{ type: 'null' }, null, true],
    [{ type: 'integer' }, 1.5, false], [{ type: 'integer' }, 9007199254740992, false],
    [{ type: 'number', minimum: -1, maximum: 1 }, 0.5, true],
  ]) assert.equal((await call('/v1/validate', request(s, data))).body.valid, valid);
});
test('Unicode lengths count code points and JSON pointers escape property names', async t => {
  const { call } = await fixture(t, createService());
  assert.equal((await call('/v1/validate', request({ type: 'string', maxLength: 1 }, '😀'))).body.valid, true);
  const s = { type: 'object', properties: { 'a/b~c': { type: 'number' } } };
  assert.equal((await call('/v1/validate', request(s, { 'a/b~c': 'bad' }))).body.errors[0].path, '/a~1b~0c');
});
test('prototype-like keys are validated as own properties without changing prototypes', async t => {
  const { call } = await fixture(t, createService());
  const body = JSON.parse('{"schema":{"type":"object","properties":{"__proto__":{"type":"boolean"}},"required":["__proto__"]},"data":{"__proto__":true}}');
  assert.equal((await call('/v1/validate', { method: 'POST', body })).body.valid, true);
  assert.equal({}.polluted, undefined);
});
test('unknown or malformed schema rules fail explicitly', async t => {
  const { call } = await fixture(t, createService());
  const schemas = [null, {}, { type: 'mystery' }, { type: 'string', pattern: '.*' }, { type: 'string', minLength: -1 }, { type: 'array' }, { type: 'object', properties: [] }, { type: 'object', required: ['undeclared'] }, { type: 'string', enum: [] }, { type: 'number', minimum: 2, maximum: 1 }];
  for (const s of schemas) assert.equal((await call('/v1/validate', request(s, null))).status, 422);
});
test('additional properties are optional and schema depth and error lists are bounded', async t => {
  const { call } = await fixture(t, createService());
  assert.equal((await call('/v1/validate', request({ type: 'object', additionalProperties: true }, { any: 'value' }))).body.valid, true);
  let deep = { type: 'null' }; for (let i = 0; i < 9; i++) deep = { type: 'array', items: deep };
  assert.equal((await call('/v1/validate', request(deep, null))).status, 422);
  const result = await call('/v1/validate', request({ type: 'array', items: { type: 'number' } }, Array(150).fill('bad')));
  assert.equal(result.body.errors.length, 100);
  assert.equal(result.body.errorLimitReached, true);
});
test('request fields are mandatory and root-level errors use an empty pointer', async t => {
  const { call } = await fixture(t, createService());
  assert.equal((await call('/v1/validate', { method: 'POST', body: { schema } })).status, 400);
  assert.equal((await call('/v1/validate', request({ type: 'boolean' }, 1))).body.errors[0].path, '');
});
