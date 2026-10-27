import { createServer } from 'node:http';
import { readFile, stat } from 'node:fs/promises';
import { extname, resolve, dirname, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
const here = dirname(fileURLToPath(import.meta.url));
const pkg = JSON.parse(await readFile(resolve(here, '../desktop-app/package.json'), 'utf8'));
export const releaseRoot = resolve(here, 'releases', `bc-design-${pkg.version}`);
const types = { '.html': 'text/html; charset=utf-8', '.css': 'text/css; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.json': 'application/json', '.png': 'image/png', '.svg': 'image/svg+xml', '.exe': 'application/octet-stream' };
export function previewServer() {
  return createServer(async (request, response) => {
    try {
      let url = new URL(request.url, 'http://localhost');
      let file = resolve(releaseRoot, '.' + decodeURIComponent(url.pathname));
      if (relative(releaseRoot, file).startsWith('..')) { response.writeHead(403); response.end(); return; }
      if ((await stat(file)).isDirectory()) {
        if (!url.pathname.endsWith('/')) { response.writeHead(301, { Location: url.pathname + '/' + url.search }); response.end(); return; }
        file = resolve(file, 'index.html');
      }
      const data = await readFile(file);
      response.writeHead(200, { 'Content-Type': types[extname(file)] || 'application/octet-stream', 'Content-Length': data.length, 'Cache-Control': 'no-cache' });
      response.end(request.method === 'HEAD' ? undefined : data);
    } catch { response.writeHead(404); response.end('Not found'); }
  });
}
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const port = Number(process.env.PORT || 4182);
  previewServer().listen(port, '127.0.0.1', () => console.log(`BC Design website preview: http://127.0.0.1:${port}/bc-design/`));
}
