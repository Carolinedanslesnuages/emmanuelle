/**
 * Serves a built site (a folder) on a local port, the way a static host would. With singlePage,
 * an address without a file extension that matches no file gets index.html, like the host of a
 * single-page application (Vue Router, React Router…).
 */
import { createServer } from 'node:http';
import { readFile, stat } from 'node:fs/promises';
import { join, normalize, extname, resolve } from 'node:path';

const CONTENT_TYPES = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.mjs': 'text/javascript', '.css': 'text/css',
  '.json': 'application/json', '.svg': 'image/svg+xml', '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg',
  '.webp': 'image/webp', '.gif': 'image/gif', '.ico': 'image/x-icon', '.woff2': 'font/woff2', '.woff': 'font/woff', '.txt': 'text/plain',
};

const exists = (path) => stat(path).then(() => true, () => false);

export function serveFolder(folder, { singlePage = false } = {}) {
  const root = resolve(folder);
  const server = createServer(async (request, response) => {
    const requestPath = decodeURIComponent(new URL(request.url, 'http://localhost').pathname);
    let path = normalize(join(root, requestPath));
    if (!path.startsWith(root)) {
      response.writeHead(403).end();
      return;
    }
    try {
      if (singlePage && !extname(requestPath) && !(await exists(path))) path = join(root, 'index.html');
      if ((await stat(path)).isDirectory()) path = join(path, 'index.html');
      const body = await readFile(path);
      response.writeHead(200, { 'Content-Type': CONTENT_TYPES[extname(path)] || 'application/octet-stream' }).end(body);
    } catch {
      response.writeHead(404, { 'Content-Type': 'text/plain' }).end('Introuvable');
    }
  });
  return new Promise((resolveServer) => server.listen(0, '127.0.0.1', () => {
    resolveServer({ baseUrl: `http://127.0.0.1:${server.address().port}`, close: () => server.close() });
  }));
}
