import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

/**
 * Loads every module in src/routes/custom/ (except files starting with "_").
 * Each module default-exports one route or an array of routes:
 *
 *   export default {
 *     method: 'POST',
 *     path: '/some/real/client/path/:id',
 *     host: 'api.example.com',   // optional; only match this Host header
 *     handle(ctx) { return { ... } },
 *   };
 *
 * ctx = { req, url, query, params, body, json, store, config, player() }
 */
export async function loadCustomRoutes(router, dir) {
  if (!fs.existsSync(dir)) return 0;
  let count = 0;
  for (const file of fs.readdirSync(dir).sort()) {
    if (!file.endsWith('.js') || file.startsWith('_')) continue;
    const mod = await import(pathToFileURL(path.join(dir, file)).href);
    const routes = [mod.default].flat().filter(Boolean);
    for (const r of routes) {
      if (!r.method || !r.path || typeof r.handle !== 'function') {
        throw new Error(`${file}: route needs method, path and handle()`);
      }
      router.add(r.method, r.path, r.handle, { host: r.host, source: `custom/${file}` });
      count++;
    }
  }
  return count;
}
