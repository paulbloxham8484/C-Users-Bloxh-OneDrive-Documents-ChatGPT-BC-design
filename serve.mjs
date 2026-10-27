import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import { extname, join, normalize, relative, resolve } from "node:path";

const root = resolve(process.env.BC_DESIGN_PREVIEW_ROOT || process.cwd());
const port = Number(process.env.PORT || 4173);
const contentTypes = {
  ".css": "text/css; charset=utf-8",
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".png": "image/png",
  ".svg": "image/svg+xml",
};

const server = createServer(async (request, response) => {
  const requestPath = decodeURIComponent((request.url || "/").split("?")[0]);
  const requestedFile = resolve(join(root, normalize(requestPath === "/" ? "index.html" : requestPath.slice(1))));

  if (relative(root, requestedFile).startsWith("..")) {
    response.writeHead(403);
    response.end("Forbidden");
    return;
  }

  try {
    const file = await readFile(requestedFile);
    response.writeHead(200, { "Content-Type": contentTypes[extname(requestedFile)] || "application/octet-stream" });
    response.end(file);
  } catch {
    response.writeHead(404, { "Content-Type": "text/plain; charset=utf-8" });
    response.end("Not found");
  }
});

server.listen(port, "127.0.0.1", () => {
  console.log(`BC Design is running at http://127.0.0.1:${port}`);
});
