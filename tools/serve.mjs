// Zero-dependency static server for local testing: node tools/serve.mjs [port]
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { extname, join, normalize } from 'node:path';
import { fileURLToPath } from 'node:url';
const root = join(fileURLToPath(import.meta.url), '..', '..');
const types = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.webmanifest': 'application/manifest+json', '.png': 'image/png', '.svg': 'image/svg+xml' };
export const server = createServer(async (req, res) => {
  const p = normalize(decodeURIComponent(new URL(req.url, 'http://x').pathname)).replace(/^(\.\.[/\\])+/, '');
  try {
    const file = p.endsWith('/') ? p + 'index.html' : p;
    const body = await readFile(join(root, file));
    res.writeHead(200, { 'content-type': types[extname(file)] || 'application/octet-stream', ...(p.endsWith('sw.js') ? { 'service-worker-allowed': '/', 'cache-control': 'no-cache' } : {}) });
    res.end(body);
  } catch { res.writeHead(404).end('not found'); }
});
if (process.argv[1] === fileURLToPath(import.meta.url)) server.listen(+process.argv[2] || 8080, () => console.log('http://localhost:' + (+process.argv[2] || 8080)));
