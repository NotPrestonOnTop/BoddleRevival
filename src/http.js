/** Minimal routing and request/response helpers on top of node:http. */

export function compilePath(pattern) {
  const keys = [];
  const source = pattern
    .split('/')
    .map((seg) => {
      if (seg === '*') return '(.*)';
      if (seg.startsWith(':')) {
        keys.push(seg.slice(1));
        return '([^/]+)';
      }
      return seg.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    })
    .join('/');
  return { regex: new RegExp(`^${source}/?$`, 'i'), keys };
}

export class Router {
  constructor() {
    this.routes = [];
  }

  add(method, path, handler, { host = null, source = 'native' } = {}) {
    const { regex, keys } = compilePath(path);
    this.routes.push({ method: method.toUpperCase(), path, host: host?.toLowerCase() ?? null, regex, keys, handler, source });
  }

  /** Host-specific routes win over host-agnostic ones. */
  match(method, host, pathname) {
    let fallback = null;
    for (const route of this.routes) {
      if (route.method !== method && route.method !== '*') continue;
      if (route.host && route.host !== host) continue;
      const m = route.regex.exec(pathname);
      if (!m) continue;
      const params = Object.fromEntries(route.keys.map((k, i) => [k, decodeURIComponent(m[i + 1])]));
      if (route.host) return { route, params };
      fallback ??= { route, params };
    }
    return fallback;
  }
}

export function readBody(req, limit = 5 * 1024 * 1024) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    let size = 0;
    req.on('data', (chunk) => {
      size += chunk.length;
      if (size > limit) {
        reject(Object.assign(new Error('Body too large'), { status: 413 }));
        req.destroy();
        return;
      }
      chunks.push(chunk);
    });
    req.on('end', () => resolve(Buffer.concat(chunks)));
    req.on('error', reject);
  });
}

export function parseBody(buffer, contentType = '') {
  if (!buffer.length) return null;
  const text = buffer.toString('utf8');
  if (contentType.includes('application/x-www-form-urlencoded')) {
    return Object.fromEntries(new URLSearchParams(text));
  }
  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
}

export function corsHeaders(req) {
  return {
    'access-control-allow-origin': req.headers.origin || '*',
    'access-control-allow-credentials': 'true',
    'access-control-allow-methods': 'GET,POST,PUT,PATCH,DELETE,OPTIONS',
    'access-control-allow-headers': req.headers['access-control-request-headers'] || '*',
    'access-control-max-age': '600',
    vary: 'Origin',
  };
}

/**
 * Handlers return either a plain value (sent as JSON 200) or
 * { status, headers, json | text | body }.
 */
export function send(req, res, result) {
  if (res.headersSent) return;
  const isEnvelope =
    result && typeof result === 'object' && !Array.isArray(result) &&
    ('status' in result || 'json' in result || 'text' in result || 'body' in result);
  const r = isEnvelope ? result : { json: result ?? null };
  const headers = { ...corsHeaders(req), ...(r.headers || {}) };
  let payload;
  if ('json' in r) {
    payload = JSON.stringify(r.json);
    headers['content-type'] ??= 'application/json; charset=utf-8';
  } else if ('text' in r) {
    payload = String(r.text);
    headers['content-type'] ??= 'text/plain; charset=utf-8';
  } else {
    payload = r.body ?? '';
  }
  res.writeHead(r.status ?? 200, headers);
  res.end(payload);
}

export class HttpError extends Error {
  constructor(status, message, details) {
    super(message);
    this.status = status;
    this.details = details;
  }
}
