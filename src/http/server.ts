import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import { createHash, timingSafeEqual } from "node:crypto";
import { hostHeaderValidation, localhostOriginValidation, toNodeHandler, type FetchLikeMcpHandler } from "@modelcontextprotocol/node";
import type { HttpConfig } from "./config.js";

export const HTTP_BODY_MAX_BYTES = 64 * 1024;
export const HTTP_MAX_CONCURRENT = 32;
export const HTTP_REQUESTS_PER_MINUTE = 120;
export type HttpDiagnostic = { event: "request_finished"; status: number; durationMs: number } | { event: "handler_error" };
const digest = (value: string) => createHash("sha256").update(value).digest();

/** One process, one global admission budget; forwarded client identifiers are ignored. */
export function createHttpServer(config: HttpConfig, handler: FetchLikeMcpHandler, options: {
  now?: () => number; diagnostic?: (event: HttpDiagnostic) => void;
} = {}) {
  const now = options.now ?? Date.now;
  const diagnostic = (event: HttpDiagnostic) => { try { options.diagnostic?.(event); } catch { /* diagnostics cannot change results */ } };
  const nodeHandler = toNodeHandler(handler, { maxRequestBodySize: HTTP_BODY_MAX_BYTES, onerror: () => diagnostic({ event: "handler_error" }) });
  const validateHost = hostHeaderValidation(config.allowedHosts);
  const localOrigin = localhostOriginValidation();
  const expectedToken = config.bearerToken ? digest(`Bearer ${config.bearerToken}`) : null;
  let active = 0, count = 0, windowStarted = now();
  const answer = (res: ServerResponse, status: number, message: string) => {
    res.writeHead(status, { "Content-Type": "application/json", "Cache-Control": "no-store" });
    res.end(JSON.stringify({ error: message }));
  };
  const server = createServer((req: IncomingMessage, res: ServerResponse) => {
    const started = now();
    let admitted = false, finished = false;
    const finish = () => {
      if (finished) return;
      finished = true;
      if (admitted) active--;
      diagnostic({ event: "request_finished", status: res.statusCode, durationMs: Math.max(0, now() - started) });
    };
    res.once("finish", finish); res.once("close", finish);
    if (!validateHost(req, res)) return;
    if (config.mode === "local") { if (!localOrigin(req, res)) return; }
    else if (req.headers.origin && !config.allowedOrigins.includes(req.headers.origin)) { answer(res, 403, "Origin is not allowed."); return; }
    if (req.url === "/healthz" && req.method === "GET") { answer(res, 200, "process_alive"); return; }
    if (req.url !== "/mcp") { answer(res, 404, "Route not found."); return; }
    if (expectedToken && !timingSafeEqual(digest(req.headers.authorization ?? ""), expectedToken)) {
      res.setHeader("WWW-Authenticate", 'Bearer realm="WeebMoeNexus"'); answer(res, 401, "Authentication required."); return;
    }
    if (!["GET", "POST", "DELETE"].includes(req.method ?? "")) { res.setHeader("Allow", "GET, POST, DELETE"); answer(res, 405, "Method is not allowed."); return; }
    const current = now();
    if (current - windowStarted >= 60_000) { count = 0; windowStarted = current; }
    if (count >= HTTP_REQUESTS_PER_MINUTE || active >= HTTP_MAX_CONCURRENT) {
      res.setHeader("Retry-After", "60"); answer(res, 429, "Server admission limit reached."); return;
    }
    count++; active++; admitted = true;
    if (Number(req.headers["content-length"]) > HTTP_BODY_MAX_BYTES) { answer(res, 413, "Request body too large."); return; }
    void nodeHandler(req, res).catch(() => {
      diagnostic({ event: "handler_error" });
      if (!res.headersSent) answer(res, 500, "Request failed."); else res.destroy();
    });
  });
  server.requestTimeout = 30_000;
  server.headersTimeout = 15_000;
  server.keepAliveTimeout = 5_000;
  return server;
}
