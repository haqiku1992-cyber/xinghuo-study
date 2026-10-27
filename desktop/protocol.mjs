import path from "node:path";
import { readFile, realpath, stat } from "node:fs/promises";

export const APP_ORIGIN = "app://study";
export const CSP = "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; connect-src 'self'; font-src 'self'; object-src 'none'; base-uri 'none'; form-action 'none'; frame-src 'none'; worker-src 'none'";
const mime = { ".html": "text/html; charset=utf-8", ".js": "text/javascript; charset=utf-8", ".css": "text/css; charset=utf-8", ".json": "application/json; charset=utf-8", ".png": "image/png", ".ico": "image/x-icon", ".svg": "image/svg+xml", ".jpg": "image/jpeg", ".jpeg": "image/jpeg", ".webp": "image/webp", ".woff2": "font/woff2" };
const inside = (root, file) => { const relative = path.relative(root, file); return relative !== ".." && !relative.startsWith(`..${path.sep}`) && !path.isAbsolute(relative); };
export function isAppURL(value) {
  try { const u = new URL(value); return u.protocol === "app:" && u.host === "study" && !u.username && !u.password; } catch { return false; }
}
export function isExternalURL(value) {
  try { const u = new URL(value); return ["https:", "http:"].includes(u.protocol) && !u.username && !u.password; } catch { return false; }
}
export async function serveApp(request, directory) {
  const headers = { "Content-Security-Policy": CSP, "X-Content-Type-Options": "nosniff", "Cache-Control": "no-store" };
  const response = (body, status, type = "text/plain; charset=utf-8") => new Response(request.method === "HEAD" ? null : body, { status, headers: { ...headers, "Content-Type": type } });
  if (!["GET", "HEAD"].includes(request.method)) return response("Method not allowed", 405);
  if (!isAppURL(request.url)) return response("Forbidden", 403);
  let pathname;
  try { pathname = decodeURIComponent(new URL(request.url).pathname); } catch { return response("Bad path", 400); }
  if (pathname.includes("\\") || pathname.includes("\0") || pathname.includes(":") || pathname.split("/").some(p => p === ".." || p === "." || /[. ]$/.test(p))) return response("Forbidden path", 403);
  if (pathname.startsWith("/api/") || ["/sw.js", "/manifest.json"].includes(pathname)) return response("Disabled in desktop", 403);
  try {
    const root = await realpath(directory);
    const candidate = path.resolve(root, `.${pathname === "/" ? "/index.html" : pathname}`);
    if (!inside(root, candidate)) return response("Forbidden", 403);
    const file = await realpath(candidate);
    if (!inside(root, file)) return response("Forbidden", 403);
    if (!(await stat(file)).isFile()) return response("Not found", 404);
    return response(await readFile(file), 200, mime[path.extname(file).toLowerCase()] ?? "application/octet-stream");
  } catch (error) {
    return response(error.code === "ENOENT" || error.code === "ENOTDIR" ? "Not found" : "Cannot read resource", error.code === "ENOENT" || error.code === "ENOTDIR" ? 404 : 500);
  }
}
