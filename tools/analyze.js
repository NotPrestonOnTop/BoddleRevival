#!/usr/bin/env node
// Usage: npm run analyze -- [--json]
// Summarises every recorded endpoint so you can see what the client needs.
import { parseArgs } from 'node:util';
import { loadCaptureFiles, normalizePath } from '../src/captures.js';
import { loadConfig } from '../src/config.js';
import { messageKind } from '../src/har.js';

const { values } = parseArgs({ options: { json: { type: 'boolean', default: false } } });
const config = loadConfig();
const entries = loadCaptureFiles(config.capturesDir);
if (!entries.length) {
  console.log(`No captures in ${config.capturesDir}. Import one first: npm run import-har -- session.har`);
  process.exit(0);
}

function shape(body) {
  try {
    const v = JSON.parse(body);
    if (Array.isArray(v)) return `array[${v.length}]${v[0] && typeof v[0] === 'object' ? ` of {${Object.keys(v[0]).slice(0, 8).join(', ')}}` : ''}`;
    if (v && typeof v === 'object') return `{${Object.keys(v).slice(0, 10).join(', ')}}`;
    return typeof v;
  } catch {
    return body ? 'non-JSON' : 'empty';
  }
}

const sockets = new Map();
for (const e of entries.filter((x) => x.websocket)) {
  const key = `${e.host}${normalizePath(e.path)}`;
  const s = sockets.get(key) ?? { url: `wss://${key}`, connections: 0, kinds: new Map() };
  s.connections++;
  for (const m of e.websocket.messages) {
    const kind = `${m.direction === 'send' ? '→' : '←'} ${messageKind(m.data, m.opcode)}`;
    s.kinds.set(kind, (s.kinds.get(kind) ?? 0) + 1);
  }
  sockets.set(key, s);
}

const endpoints = new Map();
for (const e of entries.filter((x) => !x.websocket)) {
  const key = `${e.host} ${e.method} ${normalizePath(e.path)}`;
  const ep = endpoints.get(key) ?? { host: e.host, method: e.method, path: normalizePath(e.path), count: 0, statuses: new Set(), request: '', response: '' };
  ep.count++;
  ep.statuses.add(e.response.status);
  ep.request ||= e.request.body ? shape(e.request.body) : '';
  ep.response ||= e.response.bodyEncoding === 'base64' ? 'binary' : shape(e.response.body);
  endpoints.set(key, ep);
}

const list = [...endpoints.values()].sort((a, b) => (a.host + a.path).localeCompare(b.host + b.path));
const socketList = [...sockets.values()].map((s) => ({ ...s, kinds: Object.fromEntries(s.kinds) }));
if (values.json) {
  console.log(JSON.stringify({
    endpoints: list.map((e) => ({ ...e, statuses: [...e.statuses] })),
    websockets: socketList,
  }, null, 2));
  process.exit(0);
}

const hosts = [...new Set([...list.map((e) => e.host), ...entries.filter((x) => x.websocket).map((x) => x.host)])];
console.log(`${entries.length} recorded calls, ${list.length} distinct endpoints\n`);
console.log('Hosts the client talks to (redirect these to your server):');
for (const h of hosts) console.log(`  ${h}`);
for (const h of hosts) {
  console.log(`\n== ${h}`);
  for (const e of list.filter((x) => x.host === h)) {
    console.log(`  ${e.method.padEnd(6)} ${e.path}  [${[...e.statuses].join(',')}] x${e.count}`);
    if (e.request) console.log(`         req: ${e.request}`);
    console.log(`         res: ${e.response}`);
  }
}

if (socketList.length) {
  console.log('\n== WebSockets (realtime; not replayed yet: see docs/ROADMAP.md)');
  for (const s of socketList) {
    console.log(`  ${s.url}  x${s.connections} connection(s)`);
    for (const [kind, n] of Object.entries(s.kinds).sort((a, b) => b[1] - a[1])) console.log(`         ${kind}  x${n}`);
  }
}
