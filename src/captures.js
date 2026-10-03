import fs from 'node:fs';
import path from 'node:path';

/**
 * A capture entry is one recorded request/response pair:
 * { host, method, path, query, request: { headers, body }, response: { status, headers, body, bodyEncoding } }
 * bodyEncoding is "utf8" or "base64".
 */

const ID_SEGMENT = [
  /^\d+$/, // numeric ids
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i, // UUID
  /^[0-9a-f]{24}$/i, // Mongo ObjectId
  /^[0-9a-f]{32,}$/i, // long hex hashes
  /^[A-Za-z0-9_-]{20,}$/, // long opaque tokens
];

/** Replaces id-like path segments with ":id" so recordings match other ids. */
export function normalizePath(p) {
  return p
    .split('/')
    .map((seg) => (seg && ID_SEGMENT.some((re) => re.test(seg)) ? ':id' : seg))
    .join('/');
}

const SECRET_HEADER = /^(authorization|cookie|set-cookie|proxy-authorization)$|token|api[-_]?key|secret|session/i;
const SECRET_KEY = /pass(word)?|token|secret|^email$|e_?mail|phone|session|auth|credential|jwt/i;

export function scrubHeaders(headers = {}) {
  const out = {};
  for (const [k, v] of Object.entries(headers)) {
    out[k.toLowerCase()] = SECRET_HEADER.test(k) ? '[redacted]' : v;
  }
  return out;
}

/** Recursively redacts values whose key looks like a credential or contact detail. */
export function scrubJson(value) {
  if (Array.isArray(value)) return value.map(scrubJson);
  if (value && typeof value === 'object') {
    return Object.fromEntries(
      Object.entries(value).map(([k, v]) => [k, SECRET_KEY.test(k) && v !== null && typeof v !== 'object' ? '[redacted]' : scrubJson(v)]),
    );
  }
  return value;
}

export function scrubBody(body, contentType = '') {
  if (typeof body !== 'string' || !body) return body;
  if (contentType.includes('json') || /^[[{]/.test(body.trim())) {
    try {
      return JSON.stringify(scrubJson(JSON.parse(body)));
    } catch { /* not JSON */ }
  }
  if (contentType.includes('x-www-form-urlencoded')) {
    const params = new URLSearchParams(body);
    for (const key of [...params.keys()]) if (SECRET_KEY.test(key)) params.set(key, '[redacted]');
    return params.toString();
  }
  return body;
}

export function loadCaptureFiles(dir) {
  if (!dir || !fs.existsSync(dir)) return [];
  const entries = [];
  for (const file of fs.readdirSync(dir).sort()) {
    if (!file.endsWith('.json')) continue;
    const data = JSON.parse(fs.readFileSync(path.join(dir, file), 'utf8'));
    for (const e of [data].flat()) entries.push({ ...e, file });
  }
  return entries;
}

export class CaptureIndex {
  constructor(entries = []) {
    this.byKey = new Map();
    this.size = 0;
    for (const e of entries) this.add(e);
  }

  static fromDir(dir) {
    return new CaptureIndex(loadCaptureFiles(dir));
  }

  add(entry) {
    if (entry.websocket) return; // analysed by tools/analyze.js, never replayed over HTTP
    const key = `${entry.method.toUpperCase()} ${normalizePath(entry.path)}`.toLowerCase();
    if (!this.byKey.has(key)) this.byKey.set(key, []);
    this.byKey.get(key).push(entry);
    this.size++;
  }

  /** Best match: same host and query > same host > same query > latest recording. */
  find(method, host, pathname, search = '') {
    const list = this.byKey.get(`${method.toUpperCase()} ${normalizePath(pathname)}`.toLowerCase());
    if (!list) return null;
    const score = (e) => (e.host === host ? 2 : 0) + ((e.query ?? '') === search ? 1 : 0);
    let best = null;
    for (const e of list) if (!best || score(e) >= score(best)) best = e;
    return best;
  }

  endpoints() {
    return [...this.byKey.entries()].map(([key, list]) => ({
      key,
      hosts: [...new Set(list.map((e) => e.host))],
      count: list.length,
    }));
  }
}

const REPLAY_HEADERS = /^(content-type|cache-control|x-[a-z-]+)$/i;

/** Turns a capture entry into a response envelope for send(). */
export function replayResponse(entry) {
  const headers = { 'x-boddle-revival': 'replay' };
  for (const [k, v] of Object.entries(entry.response.headers ?? {})) {
    if (REPLAY_HEADERS.test(k) && v !== '[redacted]') headers[k.toLowerCase()] = v;
  }
  const raw = entry.response.body ?? '';
  const body = entry.response.bodyEncoding === 'base64' ? Buffer.from(raw, 'base64') : raw;
  return { status: entry.response.status ?? 200, headers, body };
}
