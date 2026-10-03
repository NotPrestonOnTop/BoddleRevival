#!/usr/bin/env node
// Usage: npm run scaffold -- [--match <regex>] [--force]
// Writes a handler stub in src/routes/custom/ for every recorded endpoint
// (matching --match). Each stub starts out returning the recorded response;
// edit it to add real logic.
import fs from 'node:fs';
import path from 'node:path';
import { parseArgs } from 'node:util';
import { loadCaptureFiles, normalizePath } from '../src/captures.js';
import { loadConfig, ROOT } from '../src/config.js';

const { values } = parseArgs({
  options: { match: { type: 'string' }, force: { type: 'boolean', default: false } },
});
const config = loadConfig();
const outDir = path.join(ROOT, 'src/routes/custom');
const match = values.match ? new RegExp(values.match, 'i') : null;

const latest = new Map();
for (const e of loadCaptureFiles(config.capturesDir)) {
  if (e.response.bodyEncoding === 'base64') continue;
  const routePath = normalizePath(e.path);
  const key = `${e.host} ${e.method} ${routePath}`;
  if (match && !match.test(key)) continue;
  latest.set(key, { ...e, routePath });
}

let written = 0;
for (const e of latest.values()) {
  const slug = `${e.method}-${e.host}${e.routePath}`.toLowerCase().replace(/:id/g, 'id').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
  const file = path.join(outDir, `${slug}.js`);
  if (fs.existsSync(file) && !values.force) continue;

  let recorded;
  try {
    recorded = JSON.stringify(JSON.parse(e.response.body), null, 2);
  } catch {
    recorded = JSON.stringify(e.response.body);
  }
  const params = e.routePath.split('/').filter((s) => s === ':id').length;
  const routePath = params > 1 ? (() => { let i = 0; return e.routePath.replace(/:id/g, () => `:id${++i}`); })() : e.routePath;
  fs.writeFileSync(file, `// Generated from a capture of ${e.method} https://${e.host}${e.path}
// Starts out returning what the official server sent. Replace with real logic,
// e.g. read ctx.player() and ctx.store to return this player's data.
const recorded = ${recorded};

export default {
  method: '${e.method}',
  host: '${e.host}',
  path: '${routePath}',
  handle(ctx) {
    return { status: ${e.response.status}, json: recorded };
  },
};
`);
  written++;
  console.log(`wrote ${path.relative(ROOT, file)}`);
}
console.log(`${written} handler(s) written${values.force ? '' : ' (existing files kept; use --force to overwrite)'}`);
