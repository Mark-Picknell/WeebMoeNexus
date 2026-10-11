import assert from "node:assert/strict";
import test from "node:test";
import { request } from "node:http";
import { once } from "node:events";
import { loadHttpConfig, type HttpConfig } from "../src/http/config.js";
import { createHttpServer, HTTP_BODY_MAX_BYTES, HTTP_REQUESTS_PER_MINUTE, HTTP_MAX_CONCURRENT, type HttpDiagnostic } from "../src/http/server.js";

const token = "synthetic-test-secret-only-0123456789";
const hosted = (): HttpConfig => loadHttpConfig({ WMN_HTTP_MODE: "bearer", WMN_ALLOWED_HOSTS: "service.example.test", WMN_ALLOWED_ORIGINS: "https://client.example.test", WMN_BEARER_TOKEN: token });

async function start(config: HttpConfig, fetch: (request: Request) => Promise<Response>, options = {}) {
  const server = createHttpServer(config, { fetch }, options);
  server.listen(0, "127.0.0.1"); await once(server, "listening");
  const address = server.address(); assert.ok(address && typeof address !== "string");
  const send = (opts: { path?: string; method?: string; headers?: Record<string, string>; body?: string; chunked?: boolean } = {}) => new Promise<{ status: number; body: string }>((resolve, reject) => {
    const req = request({ hostname: "127.0.0.1", port: address.port, path: opts.path ?? "/mcp", method: opts.method ?? "POST", headers: { host: "service.example.test", authorization: `Bearer ${token}`, ...opts.headers } }, res => {
      let body = ""; res.setEncoding("utf8"); res.on("data", chunk => body += chunk); res.on("end", () => resolve({ status: res.statusCode!, body }));
    });
    req.on("error", reject);
    if (opts.chunked) req.write(opts.body ?? "");
    req.end(opts.chunked ? undefined : opts.body);
  });
  return { server, send, close: async () => { server.closeAllConnections(); await new Promise<void>(resolve => server.close(() => resolve())); } };
}

test("deployment configuration defaults to loopback and rejects unsafe or ambiguous opt-ins without leaking values", () => {
  assert.equal(loadHttpConfig({}).mode, "local"); assert.equal(loadHttpConfig({}).bindHost, "127.0.0.1");
  for (const env of [
    { WMN_BIND_HOST: "0.0.0.0" }, { PORT: "3000oops" }, { WMN_HTTP_MODE: "unknown-private" },
    { WMN_HTTP_MODE: "public", WMN_ALLOWED_HOSTS: "service.example.test" },
    { WMN_HTTP_MODE: "bearer", WMN_ALLOWED_HOSTS: "*", WMN_BEARER_TOKEN: token },
    { WMN_HTTP_MODE: "bearer", WMN_ALLOWED_HOSTS: "https://service.example.test", WMN_BEARER_TOKEN: token },
    { WMN_HTTP_MODE: "bearer", WMN_ALLOWED_HOSTS: "service.example.test", WMN_BEARER_TOKEN: "short-private" },
    { WMN_ALLOWED_ORIGINS: "https://private-secret.example.test/path" }
  ]) assert.throws(() => loadHttpConfig(env), error => !String(error).includes("private") && !String(error).includes(token));
  assert.equal(loadHttpConfig({ WMN_HTTP_MODE: "public", WMN_ALLOWED_HOSTS: "service.example.test", WMN_PUBLIC_READ_ONLY: "true" }).mode, "public");
});

test("HTTP host, exact origin, bearer, route and liveness gates run before the MCP handler", async () => {
  let calls = 0; const diagnostics: HttpDiagnostic[] = [];
  const app = await start(hosted(), async () => { calls++; return Response.json({ ok: true }); }, { diagnostic: (event: HttpDiagnostic) => diagnostics.push(event) });
  try {
    assert.equal((await app.send({ headers: { host: "attacker.example.test", "x-forwarded-host": "service.example.test" } })).status, 403);
    assert.equal((await app.send({ headers: { origin: "https://client.example.test:9999" } })).status, 403);
    assert.equal((await app.send({ headers: { authorization: "Bearer private-wrong" } })).status, 401);
    assert.equal((await app.send({ path: "/mcp?private-secret=1" })).status, 404);
    assert.equal((await app.send({ method: "PUT" })).status, 405);
    assert.equal((await app.send({ path: "/healthz", method: "GET", headers: { authorization: "" } })).status, 200);
    assert.equal(calls, 0, "liveness and denied requests must not call MCP or any provider");
    assert.equal((await app.send({ headers: { origin: "https://client.example.test" } })).status, 200);
    assert.equal((await app.send()).status, 200, "server clients may omit Origin");
    assert.equal(calls, 2);
    assert.equal(JSON.stringify(diagnostics).includes("private"), false);
    assert.equal(JSON.stringify(diagnostics).includes(token), false);
    assert.equal(JSON.stringify(diagnostics).includes("example.test"), false);
  } finally { await app.close(); }
});

test("HTTP buffers enforce byte limits for length-declared and chunked bodies", async () => {
  let calls = 0;
  const app = await start(hosted(), async req => { calls++; return new Response(await req.text()); });
  try {
    const body = "x".repeat(HTTP_BODY_MAX_BYTES + 1);
    assert.equal((await app.send({ body, headers: { "content-length": String(body.length) } })).status, 413);
    assert.equal((await app.send({ body, chunked: true })).status, 413);
    assert.equal(calls, 0);
    assert.equal((await app.send({ body: "allowed" })).body, "allowed");
  } finally { await app.close(); }
});

test("HTTP admission budgets reset only after a full minute and handler diagnostics remain sanitized", async () => {
  let now = 1_000_000, calls = 0;
  const events: HttpDiagnostic[] = [];
  const app = await start(hosted(), async () => { calls++; if (calls === 1) throw new Error("private-token private-path"); return new Response("ok"); }, { now: () => now, diagnostic: (e: HttpDiagnostic) => events.push(e) });
  try {
    assert.equal((await app.send()).status, 500);
    for (let i = 1; i < HTTP_REQUESTS_PER_MINUTE; i++) assert.equal((await app.send()).status, 200);
    assert.equal((await app.send()).status, 429);
    now--; assert.equal((await app.send()).status, 429);
    now += 60_001; assert.equal((await app.send()).status, 200);
    assert.equal(JSON.stringify(events).includes("private"), false);
    assert.ok(events.some(e => e.event === "handler_error"));
  } finally { await app.close(); }
});

test("HTTP concurrency is bounded and releasing responses restores capacity", async () => {
  let release!: () => void;
  const blocked = new Promise<void>(resolve => release = resolve);
  let calls = 0;
  const app = await start(hosted(), async () => { calls++; await blocked; return new Response("ok"); });
  try {
    const pending = Array.from({ length: HTTP_MAX_CONCURRENT }, () => app.send());
    while (calls < HTTP_MAX_CONCURRENT) await new Promise(resolve => setImmediate(resolve));
    assert.equal((await app.send()).status, 429);
    release(); assert.ok((await Promise.all(pending)).every(r => r.status === 200));
    assert.equal((await app.send()).status, 200);
  } finally { release(); await app.close(); }
});

test("loopback defaults continue rejecting external hosts and origins", async () => {
  const app = await start(loadHttpConfig({}), async () => new Response("ok"));
  try {
    assert.equal((await app.send()).status, 403);
    assert.equal((await app.send({ headers: { host: "localhost", origin: "https://evil.example.test" } })).status, 403);
    assert.equal((await app.send({ headers: { host: "localhost", origin: "http://localhost:3000" } })).status, 200);
  } finally { await app.close(); }
});
