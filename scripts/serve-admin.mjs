import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const port = Number(process.env.PORT || 5181);
const types = { '.html':'text/html; charset=utf-8', '.js':'text/javascript; charset=utf-8', '.css':'text/css; charset=utf-8', '.svg':'image/svg+xml', '.png':'image/png', '.jpg':'image/jpeg', '.gif':'image/gif', '.woff2':'font/woff2', '.mp4':'video/mp4' };
const server = http.createServer((req, res) => {
  if (!['GET', 'HEAD'].includes(req.method)) { res.writeHead(405); res.end(); return; }
  let pathname;
  try { pathname = decodeURIComponent(new URL(req.url, 'http://localhost').pathname); }
  catch { res.writeHead(400); res.end('Bad request'); return; }
  const relative = pathname === '/' ? 'index.html' : pathname === '/favicon.ico' ? 'dist/favicon.svg' : pathname.slice(1);
  const file = path.resolve(root, relative);
  const parts = relative.split(/[\\/]/);
  if (!file.startsWith(root + path.sep) || parts.some(part => part.startsWith('.') || part === 'node_modules') ||
      (!relative.startsWith('dist/') && !['index.html', 'logo.png', 'logocalbayog.png', 'logologin.png', 'backgrounddioses.jpg', 'HEADER.png', 'church.jpg'].includes(relative))) {
    res.writeHead(404); res.end('Not found'); return;
  }
  if (!fs.existsSync(file) || !fs.statSync(file).isFile()) { res.writeHead(404); res.end('Not found'); return; }
  res.writeHead(200, { 'Content-Type': types[path.extname(file)] || 'application/octet-stream', 'Cache-Control':'no-store', 'X-Content-Type-Options':'nosniff' });
  if (req.method === 'HEAD') res.end();
  else { const stream = fs.createReadStream(file); stream.on('error', () => res.destroy()); stream.pipe(res); }
});
server.on('error', err => { console.error(err.message); process.exitCode = 1; });
server.listen(port, '127.0.0.1', () => console.log(`Admin running at http://localhost:${port}`));


