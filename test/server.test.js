import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { startServer } from '../src/server.js';

const quiet = { warn() {}, error() {}, log() {} };

async function boot(extra = {}) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'br-'));
  const capturesDir = path.join(dir, 'captures');
  const customDir = path.join(dir, 'custom');
  fs.mkdirSync(capturesDir);
  fs.mkdirSync(customDir);
  fs.writeFileSync(path.join(capturesDir, 's.json'), JSON.stringify([{
    host: 'api.game.test', method: 'GET', path: '/v3/world/123', query: '',
    request: { headers: {}, body: '' },
    response: { status: 200, headers: { 'content-type': 'application/json' }, body: '{"world":"recorded"}', bodyEncoding: 'utf8' },
  }]));
  fs.writeFileSync(path.join(customDir, 'hello.js'),
    "export default { method: 'GET', path: '/v3/hello/:name', handle: ({ params }) => ({ hi: params.name }) };");
  const app = await startServer(
    { host: '127.0.0.1', port: 0, dataDir: path.join(dir, 'data'), capturesDir, replay: true, startingCoins: 100, ...extra },
    { customDir, log: quiet },
  );
  const base = `http://127.0.0.1:${app.servers[0].address().port}`;
  return { app, base, dir };
}

const call = async (base, method, p, { token, body, host } = {}) => {
  const headers = { 'content-type': 'application/json' };
  if (token) headers.authorization = `Bearer ${token}`;
  if (host) headers.host = host;
  const res = await fetch(base + p, { method, headers, body: body && JSON.stringify(body) });
  return { status: res.status, body: await res.json().catch(() => null), headers: res.headers };
};

test('full player flow: register, play, buy, equip', async (t) => {
  const { app, base } = await boot();
  t.after(() => app.close());

  const reg = await call(base, 'POST', '/api/v1/auth/register', { body: { username: 'Mathkid', password: 'secret1', grade: 3 } });
  assert.equal(reg.status, 201);
  assert.equal(reg.body.player.coins, 100);
  assert.equal(reg.body.player.passwordHash, undefined);
  assert.equal((await call(base, 'POST', '/api/v1/auth/register', { body: { username: 'mathkid', password: 'secret1' } })).status, 409);

  const bad = await call(base, 'POST', '/api/v1/auth/login', { body: { username: 'mathkid', password: 'nope' } });
  assert.equal(bad.status, 401);
  const { body: { token } } = await call(base, 'POST', '/api/v1/auth/login', { body: { username: 'MATHKID', password: 'secret1' } });
  assert.equal((await call(base, 'GET', '/api/v1/me')).status, 401);

  const q = await call(base, 'GET', '/api/v1/questions/next?skill=addition', { token });
  assert.equal(q.body.answer, undefined);
  // Work out the answer from the prompt.
  const [a, b] = q.body.prompt.match(/\d+/g).map(Number);
  const ans = await call(base, 'POST', `/api/v1/questions/${q.body.id}/answer`, { token, body: { answer: a + b } });
  assert.equal(ans.body.correct, true);
  assert.equal(ans.body.player.coins, 105);
  assert.equal((await call(base, 'POST', `/api/v1/questions/${q.body.id}/answer`, { token, body: { answer: 0 } })).status, 404);

  assert.equal((await call(base, 'POST', '/api/v1/shop/buy', { token, body: { itemId: 'pet-dragon' } })).status, 402);
  const buy = await call(base, 'POST', '/api/v1/shop/buy', { token, body: { itemId: 'hat-beanie' } });
  assert.equal(buy.body.player.coins, 25);
  assert.equal((await call(base, 'PUT', '/api/v1/me/avatar', { token, body: { hat: 'hat-wizard' } })).status, 403);
  const eq = await call(base, 'PUT', '/api/v1/me/avatar', { token, body: { hat: 'hat-beanie' } });
  assert.deepEqual(eq.body.avatar, { hat: 'hat-beanie' });

  const prog = await call(base, 'POST', '/api/v1/progress/world1-level1', { token, body: { stars: 2 } });
  assert.equal(prog.body.stars, 2);
  const lb = await call(base, 'GET', '/api/v1/leaderboard');
  assert.equal(lb.body[0].displayName, 'Mathkid');
});

test('custom handlers, replay and unhandled log', async (t) => {
  const { app, base } = await boot();
  t.after(() => app.close());

  assert.deepEqual((await call(base, 'GET', '/v3/hello/sam')).body, { hi: 'sam' });

  const tunnelled = await call(base, 'GET', '/_host/api.game.test/v3/world/5');
  assert.deepEqual(tunnelled.body, { world: 'recorded' });

  const replay = await call(base, 'GET', '/v3/world/999');
  assert.deepEqual(replay.body, { world: 'recorded' });
  assert.equal(replay.headers.get('x-boddle-revival'), 'replay');

  const missing = await call(base, 'POST', '/v3/unknown', { body: { a: 1 } });
  assert.equal(missing.status, 404);
  const status = await call(base, 'GET', '/admin/api/status');
  assert.equal(status.body.unhandled[0].path, '/v3/unknown');
  assert.ok(status.body.routes.some((r) => r.source === 'custom/hello.js'));

  const pre = await fetch(base + '/anything', { method: 'OPTIONS', headers: { origin: 'https://play.example' } });
  assert.equal(pre.status, 204);
  assert.equal(pre.headers.get('access-control-allow-origin'), 'https://play.example');
});

test('data persists across restarts', async () => {
  const first = await boot();
  await call(first.base, 'POST', '/api/v1/auth/register', { body: { username: 'keeper', password: 'secret1' } });
  await first.app.close();
  const dataDir = path.join(first.dir, 'data');
  const again = await startServer(
    { host: '127.0.0.1', port: 0, dataDir, capturesDir: path.join(first.dir, 'captures'), replay: true, startingCoins: 100 },
    { customDir: path.join(first.dir, 'custom'), log: quiet },
  );
  const base = `http://127.0.0.1:${again.servers[0].address().port}`;
  const login = await call(base, 'POST', '/api/v1/auth/login', { body: { username: 'keeper', password: 'secret1' } });
  assert.equal(login.status, 200);
  await again.close();
});

test('serves the built-in play page', async (t) => {
  const { app, base } = await boot();
  t.after(() => app.close());
  const root = await fetch(base + '/', { redirect: 'manual' });
  assert.equal(root.status, 302);
  assert.equal(root.headers.get('location'), '/play');
  const play = await fetch(base + '/play');
  assert.equal(play.status, 200);
  assert.match(await play.text(), /<title>Boddle Revival<\/title>/);
});
