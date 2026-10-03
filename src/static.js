import fs from 'node:fs';
import path from 'node:path';

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'application/javascript',
  '.css': 'text/css',
  '.json': 'application/json',
  '.wasm': 'application/wasm',
  '.data': 'application/octet-stream',
  '.unityweb': 'application/octet-stream',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
  '.mp3': 'audio/mpeg',
  '.ogg': 'audio/ogg',
};

/**
 * Serves files from a local folder. Handles Unity WebGL's pre-compressed
 * "*.br" / "*.gz" build files by sending the matching Content-Encoding.
 * Returns false when no file matched.
 */
export function serveStatic(dir, pathname, req, res, extraHeaders = {}) {
  if (!dir) return false;
  let rel;
  try {
    rel = decodeURIComponent(pathname);
  } catch {
    return false;
  }
  const file = path.resolve(dir, `.${rel}`);
  if (file !== dir && !file.startsWith(dir + path.sep)) return false;
  let target = file;
  if (fs.existsSync(target) && fs.statSync(target).isDirectory()) target = path.join(target, 'index.html');
  if (!fs.existsSync(target) || !fs.statSync(target).isFile()) return false;

  const headers = { ...extraHeaders };
  let ext = path.extname(target);
  if (ext === '.br' || ext === '.gz') {
    headers['content-encoding'] = ext === '.br' ? 'br' : 'gzip';
    ext = path.extname(target.slice(0, -ext.length));
  }
  headers['content-type'] = MIME[ext] ?? 'application/octet-stream';
  headers['content-length'] = fs.statSync(target).size;
  res.writeHead(200, headers);
  if (req.method === 'HEAD') res.end();
  else fs.createReadStream(target).pipe(res);
  return true;
}
