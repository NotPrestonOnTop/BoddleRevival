import http from 'node:http';
import https from 'node:https';
import fs from 'node:fs';
import path from 'node:path';
import { Router, readBody, parseBody, send, corsHeaders, HttpError } from './http.js';
import { Store } from './store.js';
import { currentPlayer } from './auth.js';
import { CaptureIndex, replayResponse } from './captures.js';
import { serveStatic } from './static.js';
import { registerApiRoutes } from './routes/api.js';
import { registerAdminRoutes } from './admin.js';
import { loadCustomRoutes } from './routes/loadCustom.js';
import { ROOT } from './config.js';

const MAX_UNHANDLED = 200;

export async function createApp(config, { customDir = path.join(ROOT, 'src/routes/custom'), log = console } = {}) {
  const store = new Store(config.dataDir ? path.join(config.dataDir, 'db.json') : null);
  const router = new Router();
  const state = {
    store,
    config,
    router,
    unhandled: [],
    captures: new CaptureIndex(),
    reloadCaptures() {
      state.captures = config.replay ? CaptureIndex.fromDir(config.capturesDir) : new CaptureIndex();
    },
  };
  state.reloadCaptures();

  // Custom handlers first so they can override anything below.
  const customCount = await loadCustomRoutes(router, customDir);
  registerAdminRoutes(router, state);
  registerApiRoutes(router, state);

  async function handle(req, res) {
    const url = new URL(req.url, 'http://localhost');
    let host = (req.headers.host || '').replace(/:\d+$/, '').toLowerCase();
    // "/_host/<hostname>/rest" lets a browser redirect rule keep the original
    // hostname when sending traffic to localhost (see docs/CONNECTING.md).
    const tunnelled = /^\/_host\/([^/]+)(\/.*)?$/.exec(url.pathname);
    if (tunnelled) {
      host = tunnelled[1].toLowerCase();
      url.pathname = tunnelled[2] || '/';
    }

    if (req.method === 'OPTIONS') {
      res.writeHead(204, corsHeaders(req));
      res.end();
      return;
    }

    let rawBody = Buffer.alloc(0);
    try {
      if (req.method !== 'GET' && req.method !== 'HEAD') rawBody = await readBody(req);
      const match = router.match(req.method, host, url.pathname);
      if (match) {
        const ctx = {
          req,
          url,
          host,
          query: url.searchParams,
          params: match.params,
          body: rawBody,
          json: parseBody(rawBody, req.headers['content-type']),
          store,
          config,
          player: () => currentPlayer(store, req),
        };
        send(req, res, await match.route.handler(ctx));
        return;
      }

      if ((req.method === 'GET' || req.method === 'HEAD') && serveStatic(config.staticDir, url.pathname, req, res, corsHeaders(req))) {
        return;
      }

      const recorded = config.replay && state.captures.find(req.method, host, url.pathname, url.search);
      if (recorded) {
        send(req, res, replayResponse(recorded));
        return;
      }

      state.unhandled.push({
        time: new Date().toISOString(),
        method: req.method,
        host,
        path: url.pathname,
        query: url.search,
        body: rawBody.toString('utf8').slice(0, 500),
      });
      if (state.unhandled.length > MAX_UNHANDLED) state.unhandled.shift();
      log.warn?.(`[unhandled] ${req.method} ${host}${url.pathname}${url.search}`);
      send(req, res, { status: 404, json: { error: 'Not implemented on this private server yet' } });
    } catch (err) {
      const status = err instanceof HttpError || err.status ? err.status : 500;
      if (status >= 500) log.error?.(err);
      send(req, res, { status, json: { error: status >= 500 ? 'Internal server error' : err.message, details: err.details } });
    }
  }

  return { handle, state, customCount };
}

export async function startServer(config, options = {}) {
  const log = options.log ?? console;
  const app = await createApp(config, options);
  const listen = (server, port) =>
    new Promise((resolve, reject) => {
      server.once('error', reject);
      server.listen(port, config.host, () => resolve(server));
    });

  const servers = [await listen(http.createServer(app.handle), config.port)];
  if (config.https) {
    const tls = { cert: fs.readFileSync(config.https.cert), key: fs.readFileSync(config.https.key) };
    servers.push(await listen(https.createServer(tls, app.handle), config.https.port ?? 443));
  }

  const close = async () => {
    await Promise.all(servers.map((s) => new Promise((r) => s.close(r))));
    app.state.store.flush();
  };
  return { ...app, servers, close };
}
