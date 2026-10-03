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
    if (!/^https?:$/.test(url.protocol)) continue;
    if (hostFilter && !hostFilter.test(url.hostname)) continue;

    const resHeaders = headerMap(e.response?.headers);
    const mime = e.response?.content?.mimeType || resHeaders['content-type'] || '';
    if (!includeAssets && (ASSET_EXT.test(url.pathname) || ASSET_MIME.test(mime))) continue;
    if (!e.response || e.response.status === 0) continue; // blocked or aborted

    const reqHeaders = headerMap(e.request.headers);
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
