import test from 'node:test';
import assert from 'node:assert/strict';
import { normalizePath, CaptureIndex, scrubJson, scrubHeaders } from '../src/captures.js';
import { harToCaptures } from '../src/har.js';

test('normalizePath replaces id-like segments', () => {
  assert.equal(normalizePath('/api/users/12345/items'), '/api/users/:id/items');
  assert.equal(normalizePath('/api/u/507f1f77bcf86cd799439011'), '/api/u/:id');
  assert.equal(normalizePath('/x/3fa85f64-5717-4562-b3fc-2c963f66afa6'), '/x/:id');
  assert.equal(normalizePath('/api/v2/shop'), '/api/v2/shop');
});

test('CaptureIndex prefers same host, then same query', () => {
  const mk = (host, query, body) => ({ host, method: 'GET', path: '/a/1', query, response: { status: 200, body } });
  const idx = new CaptureIndex([mk('x.com', '', 'x'), mk('y.com', '?q=1', 'y1'), mk('y.com', '', 'y')]);
  assert.equal(idx.find('GET', 'y.com', '/a/99', '?q=1').response.body, 'y1');
  assert.equal(idx.find('GET', 'y.com', '/a/99', '').response.body, 'y');
  assert.equal(idx.find('GET', 'x.com', '/a/2', '').response.body, 'x');
  assert.equal(idx.find('POST', 'x.com', '/a/2', ''), null);
});

test('scrubbing removes secrets', () => {
  assert.deepEqual(scrubJson({ user: { password: 'p', email: 'a@b.c', name: 'N' }, accessToken: 't' }),
    { user: { password: '[redacted]', email: '[redacted]', name: 'N' }, accessToken: '[redacted]' });
  const h = scrubHeaders({ Authorization: 'Bearer x', Cookie: 'c', 'Content-Type': 'application/json', 'X-Auth-Token': 'z' });
  assert.equal(h.authorization, '[redacted]');
  assert.equal(h.cookie, '[redacted]');
  assert.equal(h['x-auth-token'], '[redacted]');
  assert.equal(h['content-type'], 'application/json');
});

test('harToCaptures keeps API calls, skips assets, scrubs bodies', () => {
  const har = { log: { entries: [
    {
      startedDateTime: '2026-01-01T00:00:00Z',
      request: { method: 'POST', url: 'https://api.game.test/login?v=1', headers: [{ name: 'Content-Type', value: 'application/json' }], postData: { text: '{"username":"kid","password":"hunter2"}' } },
      response: { status: 200, headers: [{ name: 'Set-Cookie', value: 's=1' }], content: { mimeType: 'application/json', text: '{"token":"abc","coins":5}' } },
    },
    {
      request: { method: 'GET', url: 'https://cdn.game.test/Build/game.wasm.br', headers: [] },
      response: { status: 200, headers: [], content: { mimeType: 'application/wasm', text: '' } },
    },
  ] } };
  const [c, ...rest] = harToCaptures(har);
  assert.equal(rest.length, 0);
  assert.equal(c.host, 'api.game.test');
  assert.equal(c.query, '?v=1');
  assert.deepEqual(JSON.parse(c.request.body), { username: 'kid', password: '[redacted]' });
  assert.deepEqual(JSON.parse(c.response.body), { token: '[redacted]', coins: 5 });
  assert.equal(c.response.headers['set-cookie'], '[redacted]');
});
