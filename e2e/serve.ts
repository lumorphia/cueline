/**
 * E2E のために apps/web のビルド (dist) を配る。ヘッダーは本番 (Cloudflare) と同じ apps/web/public/_headers を読む。
 * 拡張子の無いパスはページ (index.html) を返す (wrangler.jsonc の single-page-application と同じ)
 *
 * PORT (既定 4310)、HOST (既定 127.0.0.1)
 */
import { createReadStream } from "node:fs";
import { readFile, stat } from "node:fs/promises";
import { createServer } from "node:http";
import path from "node:path";
import { headersFor, parseHeaders } from "../tooling/headers.ts";

const DIST = path.resolve(import.meta.dirname, "../apps/web/dist");
const PORT = Number(process.env.PORT ?? 4310);
const HOST = process.env.HOST ?? "127.0.0.1";
const rules = parseHeaders(await readFile(path.join(DIST, "_headers"), "utf8"));

const TYPES: Record<string, string> = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json",
  ".webmanifest": "application/manifest+json",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".yaml": "text/yaml; charset=utf-8",
};

async function isFile(file: string): Promise<boolean> {
  try {
    return (await stat(file)).isFile();
  } catch {
    return false;
  }
}

/** dist の外を指すパス (..) は配らない */
async function fileFor(pathname: string): Promise<string | null> {
  const file = path.resolve(DIST, `.${decodeURIComponent(pathname)}`);
  if (!file.startsWith(DIST + path.sep) && file !== DIST) return null;
  if (path.basename(file) === "_headers") return null;
  if (await isFile(file)) return file;
  return path.extname(pathname) === "" ? path.join(DIST, "index.html") : null;
}

const server = createServer(async (req, res) => {
  const pathname = new URL(req.url ?? "/", "http://localhost").pathname;
  const headers = headersFor(rules, pathname);
  if (req.method !== "GET" && req.method !== "HEAD") {
    res.writeHead(405, { ...headers, allow: "GET, HEAD" }).end();
    return;
  }
  const file = await fileFor(pathname);
  if (!file) {
    res
      .writeHead(404, { ...headers, "content-type": "text/plain; charset=utf-8" })
      .end("not found");
    return;
  }
  res.writeHead(200, {
    ...headers,
    "content-type": TYPES[path.extname(file)] ?? "application/octet-stream",
  });
  if (req.method === "HEAD") return void res.end();
  createReadStream(file).pipe(res);
});

server.listen(PORT, HOST, () => console.log(`cueline web: http://${HOST}:${PORT}`));
