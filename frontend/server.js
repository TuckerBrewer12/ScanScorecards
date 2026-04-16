import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import http from "node:http";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const distDir = path.join(__dirname, "dist");
const port = Number.parseInt(process.env.PORT || "4173", 10);
const host = "0.0.0.0";

const mimeTypes = {
  ".html": "text/html; charset=utf-8",
  ".js": "application/javascript; charset=utf-8",
  ".mjs": "application/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".gif": "image/gif",
  ".webp": "image/webp",
  ".ico": "image/x-icon",
  ".txt": "text/plain; charset=utf-8",
};

const baseSecurityHeaders = {
  "X-Content-Type-Options": "nosniff",
  "X-Frame-Options": "DENY",
  "Referrer-Policy": "strict-origin-when-cross-origin",
};

function send(
  res,
  status,
  body,
  contentType = "text/plain; charset=utf-8",
  extraHeaders = {},
) {
  res.writeHead(status, {
    ...baseSecurityHeaders,
    "Content-Type": contentType,
    ...extraHeaders,
  });
  res.end(body);
}

function serveFile(res, filePath) {
  fs.readFile(filePath, (err, data) => {
    if (err) {
      send(res, 404, "Not Found");
      return;
    }
    const ext = path.extname(filePath).toLowerCase();
    send(res, 200, data, mimeTypes[ext] || "application/octet-stream");
  });
}

const server = http.createServer((req, res) => {
  const rawUrl = req.url || "/";
  let pathname = "/";
  try {
    pathname = decodeURIComponent(rawUrl.split("?")[0] || "/");
  } catch {
    send(res, 400, "Bad Request");
    return;
  }

  if (pathname === "/health") {
    send(res, 200, "ok", "text/plain; charset=utf-8", { "Cache-Control": "no-store" });
    return;
  }

  // Fail fast for API calls accidentally sent to the frontend container.
  if (pathname === "/api" || pathname.startsWith("/api/")) {
    send(
      res,
      502,
      JSON.stringify({
        detail: "Frontend service cannot serve API routes. Set VITE_API_BASE_URL to your backend URL (including https://).",
      }),
      "application/json; charset=utf-8",
      { "Cache-Control": "no-store" },
    );
    return;
  }

  let requestPath = pathname;
  if (requestPath.endsWith("/")) requestPath += "index.html";
  const candidate = path.resolve(distDir, requestPath.replace(/^\/+/, ""));
  const relative = path.relative(distDir, candidate);

  if (relative.startsWith("..") || path.isAbsolute(relative)) {
    send(res, 400, "Bad Request");
    return;
  }

  fs.stat(candidate, (err, stat) => {
    if (!err && stat.isFile()) {
      serveFile(res, candidate);
      return;
    }

    // SPA fallback
    serveFile(res, path.join(distDir, "index.html"));
  });
});

server.listen(port, host, () => {
  // Keeping this concise helps debugging in Railway logs.
  console.log(`frontend server listening on http://${host}:${port}`);
});
