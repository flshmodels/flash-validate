import { once } from 'node:events';
export async function fixture(t, server) {
  server.listen(0, '127.0.0.1');
  await once(server, 'listening');
  t.after(() => new Promise(resolve => { server.close(resolve); server.closeAllConnections(); }));
  const base = `http://127.0.0.1:${server.address().port}`;
  async function call(path, { method = 'GET', body, headers = {}, raw } = {}) {
    const response = await fetch(base + path, { method, headers: { ...(body !== undefined ? { 'content-type': 'application/json' } : {}), ...headers }, body: raw ?? (body === undefined ? undefined : JSON.stringify(body)) });
    const source = await response.text();
    return { status: response.status, body: source ? JSON.parse(source) : null, headers: response.headers };
  }
  return { call, base };
}
