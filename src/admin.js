import crypto from 'node:crypto';
import { HttpError } from './http.js';
import { publicPlayer } from './routes/api.js';

const isLoopback = (addr = '') => addr === '::1' || addr.startsWith('127.') || addr === '::ffff:127.0.0.1';

function authorize(req, config) {
  if (isLoopback(req.socket.remoteAddress)) return;
  const given = req.headers['x-admin-token'] || new URL(req.url, 'http://x').searchParams.get('token') || '';
  const expected = config.adminToken || '';
  const ok = expected && given.length === expected.length &&
    crypto.timingSafeEqual(Buffer.from(given), Buffer.from(expected));
  if (!ok) throw new HttpError(403, 'Admin is only available from localhost or with adminToken');
}

/** Admin dashboard and JSON API under /admin. */
export function registerAdminRoutes(router, state) {
  const { store, config } = state;
  const guard = (handler) => (ctx) => {
    authorize(ctx.req, config);
    return handler(ctx);
  };

  router.add('GET', '/admin', guard(() => ({ headers: { 'content-type': 'text/html; charset=utf-8' }, body: DASHBOARD })));

  router.add('GET', '/admin/api/status', guard(() => ({
    uptimeSeconds: Math.round(process.uptime()),
    players: store.collection('players').all().length,
    routes: router.routes.map((r) => ({ method: r.method, path: r.path, host: r.host, source: r.source })),
    captures: state.captures.endpoints(),
    unhandled: state.unhandled.slice().reverse(),
  })));

  router.add('GET', '/admin/api/players', guard(() => store.collection('players').all().map(publicPlayer)));

  router.add('POST', '/admin/api/players/:id/coins', guard(({ params, json }) => {
    const amount = Number(json?.amount);
    if (!Number.isFinite(amount)) throw new HttpError(400, 'amount must be a number');
    const updated = store.collection('players').update(params.id, (p) => ({ ...p, coins: Math.max(0, p.coins + amount) }));
    if (!updated) throw new HttpError(404, 'No such player');
    return publicPlayer(updated);
  }));

  router.add('POST', '/admin/api/captures/reload', guard(() => {
    state.reloadCaptures();
    return { endpoints: state.captures.endpoints().length };
  }));

  router.add('POST', '/admin/api/unhandled/clear', guard(() => {
    state.unhandled.length = 0;
    return { ok: true };
  }));
}

const DASHBOARD = `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Boddle Revival Admin</title>
<style>
  body{font:14px/1.45 system-ui,sans-serif;margin:0;padding:16px;background:#f6f7fb;color:#1d2330}
  h1{font-size:20px} h2{font-size:16px;margin-top:28px}
  table{border-collapse:collapse;width:100%;background:#fff;border-radius:8px;overflow:hidden}
  td,th{padding:6px 10px;border-bottom:1px solid #e6e8ef;text-align:left;vertical-align:top}
  code{font:12px ui-monospace,monospace;word-break:break-all}
  button{cursor:pointer;padding:4px 10px}
  .muted{color:#6b7280}
  @media (prefers-color-scheme:dark){body{background:#12151c;color:#e6e8ef}table{background:#1b1f29}td,th{border-color:#2a2f3c}}
</style></head><body>
<h1>Boddle Revival Admin</h1>
<div id="summary" class="muted">Loading…</div>
<h2>Unhandled requests <button onclick="post('/admin/api/unhandled/clear')">Clear</button></h2>
<p class="muted">The client asked for these and nothing answered. Capture them or write a handler in src/routes/custom/.</p>
<table id="unhandled"></table>
<h2>Players</h2><table id="players"></table>
<h2>Recorded endpoints <button onclick="post('/admin/api/captures/reload')">Reload captures</button></h2>
<table id="captures"></table>
<h2>Routes</h2><table id="routes"></table>
<script>
const qs = location.search;
const esc = (s) => String(s ?? '').replace(/[&<>"]/g, (c) => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]));
const table = (id, head, rows) => document.getElementById(id).innerHTML =
  '<tr>' + head.map((h) => '<th>' + h + '</th>').join('') + '</tr>' +
  (rows.length ? rows.map((r) => '<tr>' + r.map((c) => '<td>' + c + '</td>').join('') + '</tr>').join('')
               : '<tr><td class="muted" colspan="' + head.length + '">Nothing yet</td></tr>');
async function post(path, body) {
  await fetch(path + qs, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body || {}) });
  load();
}
async function grant(id) {
  const amount = prompt('Coins to add (negative to remove):', '100');
  if (amount !== null) post('/admin/api/players/' + id + '/coins', { amount: Number(amount) });
}
async function load() {
  const s = await (await fetch('/admin/api/status' + qs)).json();
  const players = await (await fetch('/admin/api/players' + qs)).json();
  document.getElementById('summary').textContent =
    s.players + ' players · ' + s.captures.length + ' recorded endpoints · ' + s.routes.length + ' routes · up ' + s.uptimeSeconds + 's';
  table('unhandled', ['Time', 'Request', 'Body'], s.unhandled.map((u) =>
    [esc(u.time.slice(11, 19)), '<code>' + esc(u.method + ' ' + u.host + u.path + u.query) + '</code>', '<code>' + esc(u.body) + '</code>']));
  table('players', ['Name', 'Grade', 'Level', 'Coins', ''], players.map((p) =>
    [esc(p.displayName) + ' <span class="muted">@' + esc(p.username) + '</span>', p.grade, p.level, p.coins,
     '<button onclick="grant(\\'' + esc(p.id) + '\\')">Coins</button>']));
  table('captures', ['Endpoint', 'Hosts', 'Samples'], s.captures.map((c) =>
    ['<code>' + esc(c.key) + '</code>', esc(c.hosts.join(', ')), c.count]));
  table('routes', ['Method', 'Path', 'Source'], s.routes.map((r) =>
    [r.method, '<code>' + esc((r.host || '') + r.path) + '</code>', esc(r.source)]));
}
load(); setInterval(load, 5000);
</script></body></html>`;
