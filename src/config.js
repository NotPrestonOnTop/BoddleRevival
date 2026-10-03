import fs from 'node:fs';
import path from 'node:path';

export const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');

const DEFAULTS = {
  host: '0.0.0.0',
  port: 8080,
  // { "port": 8443, "cert": "certs/cert.pem", "key": "certs/key.pem" }
  https: null,
  dataDir: 'data',
  capturesDir: 'captures',
  // Optional folder holding a locally saved copy of the web client.
  staticDir: null,
  // Required to reach /admin from anything other than localhost.
  adminToken: null,
  // Answer unknown requests with recorded responses from capturesDir.
  replay: true,
  startingCoins: 100,
};

const ENV = {
  BR_HOST: ['host', String],
  BR_PORT: ['port', Number],
  BR_DATA_DIR: ['dataDir', String],
  BR_CAPTURES_DIR: ['capturesDir', String],
  BR_STATIC_DIR: ['staticDir', String],
  BR_ADMIN_TOKEN: ['adminToken', String],
  BR_REPLAY: ['replay', (v) => v !== '0' && v !== 'false'],
};

export function loadConfig(overrides = {}) {
  let fileConfig = {};
  const file = process.env.BR_CONFIG || path.join(ROOT, 'config.json');
  if (fs.existsSync(file)) fileConfig = JSON.parse(fs.readFileSync(file, 'utf8'));

  const envConfig = {};
  for (const [name, [key, parse]] of Object.entries(ENV)) {
    if (process.env[name] !== undefined) envConfig[key] = parse(process.env[name]);
  }

  const config = { ...DEFAULTS, ...fileConfig, ...envConfig, ...overrides };
  for (const key of ['dataDir', 'capturesDir', 'staticDir']) {
    if (config[key]) config[key] = path.resolve(ROOT, config[key]);
  }
  if (config.https) {
    config.https = {
      ...config.https,
      cert: path.resolve(ROOT, config.https.cert),
      key: path.resolve(ROOT, config.https.key),
    };
  }
  return config;
}
