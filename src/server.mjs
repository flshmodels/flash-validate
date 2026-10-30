import { createApi, fail, fields, method, startFromEnv } from './http.mjs';
import { validate } from './validation.mjs';

export function createService({ token = '' } = {}) {
  return createApi({ name: 'flash-validate', token, handler: async ({ request, path, json }) => {
    if (path !== '/v1/validate') fail(404, 'not_found', 'No endpoint exists at this path.');
    method(request, ['POST']);
    const body = await json();
    fields(body, ['schema', 'data'], ['schema', 'data']);
    return { body: validate(body.schema, body.data) };
  } });
}
startFromEnv(import.meta.url, createService, 4313);
