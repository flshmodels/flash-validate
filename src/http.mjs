import http from 'node:http';
import { timingSafeEqual } from 'node:crypto';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

export class HttpError extends Error {
  constructor(status, code, message) { super(message); this.status = status; this.code = code; }
}
export function fail(status, code, message) { throw new HttpError(status, code, message); }
export function record(value) { return value !== null && typeof value === 'object' && !Array.isArray(value); }
export function fields(value, allowed, required = []) {
  if (!record(value)) fail(400, 'invalid_body', 'Expected a JSON object.');
  if (Object.keys(value).some(key => !allowed.includes(key))) fail(400, 'unknown_field', 'The request contains an unsupported field.');
  if (required.some(key => !Object.hasOwn(value, key))) fail(400, 'missing_field', `Required fields: ${required.join(', ')}.`);
}
export function keyFrom(segment) {
  let key;
  try { key = decodeURIComponent(segment); } catch { fail(400, 'invalid_key', 'The key is not valid URL encoding.'); }
  if (!/^[A-Za-z0-9][A-Za-z0-9_-]{0,63}$/.test(key)) fail(400, 'invalid_key', 'Use 1–64 letters, numbers, underscores or hyphens; start with a letter or number.');
  return key;
}
export function method(request, allowed) {
  if (!allowed.includes(request.method)) fail(405, 'method_not_allowed', `Allowed methods: ${allowed.join(', ')}.`);
}
function readJson(request, limit) {
  if ((request.headers['content-type'] ?? '').split(';')[0].trim().toLowerCase() !== 'application/json') {
    request.resume(); fail(415, 'unsupported_media_type', 'Use Content-Type: application/json.');
  }
  if (request.headers['content-encoding'] && request.headers['content-encoding'] !== 'identity') {
    request.resume(); fail(415, 'unsupported_encoding', 'Compressed request bodies are not supported.');
  }
  return new Promise((resolveBody, reject) => {
    const chunks = []; let size = 0; let stopped = false;
    request.on('data', chunk => {
      if (stopped) return;
      size += chunk.length;
      if (size > limit) { stopped = true; chunks.length = 0; reject(new HttpError(413, 'body_too_large', `JSON body exceeds ${limit} bytes.`)); }
      else chunks.push(chunk);
    });
    request.on('end', () => {
      if (stopped) return;
      try {
        // Reject malformed UTF-8 instead of silently replacing invalid bytes.
        const source = new TextDecoder('utf-8', { fatal: true }).decode(Buffer.concat(chunks));
        const value = JSON.parse(source);
        const stack = [[value, 0]]; let nodes = 0;
        while (stack.length) {
          const [item, depth] = stack.pop();
          if (++nodes > 10000 || depth > 32) throw new Error('JSON is too complex.');
          if (typeof item === 'number' && !Number.isFinite(item)) throw new Error('Non-finite number.');
          if (item && typeof item === 'object') for (const child of Object.values(item)) stack.push([child, depth + 1]);
        }
        resolveBody(value);
      } catch { reject(new HttpError(400, 'invalid_json', 'Use finite UTF-8 JSON within 32 levels of nesting and 10000 values.')); }
    });
    request.on('aborted', () => reject(new HttpError(400, 'aborted', 'The request was interrupted.')));
    request.on('error', reject);
  });
}

export function createApi({ name, token = '', handler, bodyLimit = 65_536 }) {
  if (typeof token !== 'string' || (token && (token.length < 32 || token.length > 256 || /[\r\n]/.test(token)))) {
    throw new Error('API_TOKEN must be 32–256 characters without line breaks.');
  }
  const secret = Buffer.from(`Bearer ${token}`);
  let inFlight = 0;
  const server = http.createServer({ maxHeaderSize: 16_384 }, async (request, response) => {
    response.setHeader('Cache-Control', 'no-store');
    response.setHeader('X-Content-Type-Options', 'nosniff');
    const send = (status, value) => {
      if (response.destroyed || response.writableEnded) return;
      if (status === 204) { response.writeHead(status); response.end(); return; }
      response.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8' });
      response.end(JSON.stringify(value));
    };
    inFlight++;
    try {
      if (inFlight > 32) fail(503, 'busy', 'Too many simultaneous requests. Try again later.');
      const url = new URL(request.url, 'http://localhost');
      if (url.pathname === '/health') {
        method(request, ['GET']); request.resume(); send(200, { service: name, version: '0.1.0', status: 'ok' }); return;
      }
      if (token) {
        const provided = Buffer.from(request.headers.authorization ?? '');
        if (provided.length !== secret.length || !timingSafeEqual(provided, secret)) fail(401, 'unauthorized', 'A valid Bearer token is required.');
      }
      if (url.search) fail(400, 'unsupported_query', 'This API does not accept query parameters.');
      const result = await handler({ request, path: url.pathname, json: () => readJson(request, bodyLimit) });
      request.resume(); send(result.status ?? 200, result.body);
    } catch (error) {
      request.resume();
      send(error instanceof HttpError ? error.status : 500, {
        error: { code: error instanceof HttpError ? error.code : 'internal_error', message: error instanceof HttpError ? error.message : 'The request could not be completed.' },
      });
    } finally { inFlight--; }
  });
  server.maxHeadersCount = 50;
  server.requestTimeout = 15_000;
  server.headersTimeout = 10_000;
  return server;
}

export function startFromEnv(moduleUrl, factory, defaultPort) {
  if (!process.argv[1] || resolve(process.argv[1]) !== resolve(fileURLToPath(moduleUrl))) return;
  const port = process.env.PORT === undefined ? defaultPort : Number(process.env.PORT);
  const host = process.env.HOST ?? '127.0.0.1';
  const token = process.env.API_TOKEN ?? '';
  if (!Number.isInteger(port) || port < 1 || port > 65535) throw new Error('PORT must be an integer from 1 to 65535.');
  if (!['127.0.0.1', '::1', 'localhost'].includes(host) && !token) throw new Error('A non-loopback HOST requires API_TOKEN.');
  const server = factory({ token });
  server.on('error', error => { console.error(`Could not start server: ${error.code ?? error.message}`); process.exitCode = 1; });
  server.listen(port, host, () => console.log(`Listening at http://${host.includes(':') ? `[${host}]` : host}:${port}`));
  for (const signal of ['SIGINT', 'SIGTERM']) process.once(signal, () => { server.close(); server.closeAllConnections(); });
}
