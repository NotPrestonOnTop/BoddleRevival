#!/usr/bin/env node
// Usage: npm run import-har -- <file.har> [--host <regex>] [--name <capture-name>] [--include-assets]
import fs from 'node:fs';
import path from 'node:path';
import { parseArgs } from 'node:util';
import { harToCaptures } from '../src/har.js';
import { loadConfig } from '../src/config.js';

const { values, positionals } = parseArgs({
  allowPositionals: true,
  options: {
    host: { type: 'string' },
    name: { type: 'string' },
    'include-assets': { type: 'boolean', default: false },
  },
});

if (!positionals.length) {
  console.error('Usage: npm run import-har -- <file.har> [--host boddle] [--name session1] [--include-assets]');
  process.exit(1);
}

const config = loadConfig();
fs.mkdirSync(config.capturesDir, { recursive: true });

for (const file of positionals) {
  const har = JSON.parse(fs.readFileSync(file, 'utf8'));
  const entries = harToCaptures(har, {
    hostFilter: values.host ? new RegExp(values.host, 'i') : null,
    includeAssets: values['include-assets'],
  });
  const name = values.name || path.basename(file, path.extname(file));
  const out = path.join(config.capturesDir, `${name}.json`);
  fs.writeFileSync(out, JSON.stringify(entries, null, 2));
  const hosts = [...new Set(entries.map((e) => e.host))];
  console.log(`${file}: ${entries.length} API calls from ${hosts.length} host(s) -> ${path.relative(process.cwd(), out)}`);
  for (const h of hosts) console.log(`  ${h}`);
}
console.log('\nCredentials, cookies and emails were redacted. Review the file before sharing it with anyone.');
console.log('Next: npm run analyze');
