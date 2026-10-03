import { scrubHeaders, scrubBody } from './captures.js';

const ASSET_EXT = /\.(png|jpe?g|gif|webp|svg|ico|css|js|mjs|wasm|data|unityweb|br|gz|woff2?|ttf|otf|mp3|ogg|wav|mp4|webm|bundle|map)$/i;
const ASSET_MIME = /^(image|font|audio|video)\/|javascript|css|wasm/i;

const headerMap = (list = []) => Object.fromEntries(list.map((h) => [h.name.toLowerCase(), h.value]));

/**
 * Converts HAR (browser DevTools "Save all as HAR", mitmproxy hardump, Charles,
 * etc.) into scrubbed capture entries.
 */
export function harToCaptures(har, { hostFilter = null, includeAssets = false } = {}) {
  const out = [];
  for (const e of har?.log?.entries ?? []) {
    let url;
    try {
      url = new URL(e.request.url);
    } catch {
      continue;
    }
    if (!/^(https?|wss?):$/.test(url.protocol)) continue;
    if (hostFilter && !hostFilter.test(url.hostname)) continue;

    const reqHeadersRaw = headerMap(e.request.headers);
    if (e._webSocketMessages || reqHeadersRaw.upgrade?.toLowerCase() === 'websocket') {
      out.push(websocketCapture(e, url, reqHeadersRaw));
      continue;
    }

    const resHeaders = headerMap(e.response?.headers);
    const mime = e.response?.content?.mimeType || resHeaders['content-type'] || '';
    if (!includeAssets && (ASSET_EXT.test(url.pathname) || ASSET_MIME.test(mime))) continue;
    if (!e.response || e.response.status === 0) continue; // blocked or aborted

    const reqHeaders = reqHeadersRaw;
    const content = e.response.content ?? {};
    const isBase64 = content.encoding === 'base64';
    out.push({
      recordedAt: e.startedDateTime,
      host: url.hostname.toLowerCase(),
      method: e.request.method.toUpperCase(),
      path: url.pathname,
      query: url.search,
      request: {
        headers: scrubHeaders(reqHeaders),
        body: scrubBody(e.request.postData?.text ?? '', reqHeaders['content-type'] ?? ''),
      },
      response: {
        status: e.response.status,
        headers: scrubHeaders(resHeaders),
        body: isBase64 ? content.text ?? '' : scrubBody(content.text ?? '', mime),
        bodyEncoding: isBase64 ? 'base64' : 'utf8',
      },
    });
  }
  return out;
}

/**
 * Chrome stores a WebSocket's frames in the non-standard `_webSocketMessages`
 * field of its HAR entry. They're kept for analysis; replay doesn't use them.
 */
function websocketCapture(e, url, reqHeaders) {
  return {
    recordedAt: e.startedDateTime,
    host: url.hostname.toLowerCase(),
    method: 'GET',
    path: url.pathname,
    query: url.search,
    request: { headers: scrubHeaders(reqHeaders), body: '' },
    response: { status: e.response?.status ?? 101, headers: {}, body: '', bodyEncoding: 'utf8' },
    websocket: {
      messages: (e._webSocketMessages ?? []).map((m) => ({
        direction: m.type === 'send' ? 'send' : 'receive',
        time: m.time,
        opcode: m.opcode,
        data: m.opcode === 2 ? m.data : scrubFrame(m.data),
      })),
    },
  };
}

/** Scrubs a text frame, keeping any Socket.IO/engine.io numeric prefix intact. */
function scrubFrame(data) {
  if (typeof data !== 'string') return data;
  const m = /^(\d+(?:\/[^,]*,)?\d*)([[{].*)$/s.exec(data);
  return m ? m[1] + scrubBody(m[2], 'json') : scrubBody(data, '');
}

/**
 * Names a WebSocket message for analysis: Socket.IO event name, JSON "type"/
 * "event"/"action"/"cmd" field, or a generic shape.
 */
export function messageKind(data, opcode = 1) {
  if (opcode === 2) return 'binary';
  if (typeof data !== 'string' || !data) return 'empty';
  const sio = /^(\d+)(?:\/[^,]*,)?(\d*)(\[.*)$/s.exec(data);
  if (sio) {
    try {
      const arr = JSON.parse(sio[3]);
      if (Array.isArray(arr) && typeof arr[0] === 'string') return `socket.io "${arr[0]}"`;
    } catch { /* fall through */ }
  }
  if (/^\d+$/.test(data)) return `engine.io packet ${data}`;
  try {
    const v = JSON.parse(data.replace(/^\d+/, '') || 'null');
    if (v && typeof v === 'object' && !Array.isArray(v)) {
      for (const k of ['type', 'event', 'action', 'cmd', 'op', 'method']) {
        if (typeof v[k] === 'string' || typeof v[k] === 'number') return `${k}=${v[k]}`;
      }
      return `{${Object.keys(v).slice(0, 6).join(', ')}}`;
    }
  } catch { /* not JSON */ }
  return 'text';
}
