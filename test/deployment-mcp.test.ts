import assert from "node:assert/strict";
import test from "node:test";
import { once } from "node:events";
import { Client, StreamableHTTPClientTransport } from "@modelcontextprotocol/client";
import { createMcpHandler } from "@modelcontextprotocol/server";
import { loadHttpConfig } from "../src/http/config.js";
import { createHttpServer, HTTP_BODY_MAX_BYTES } from "../src/http/server.js";

test("real loopback HTTP MCP client lists read-only tools and inspects status without provider traffic", async () => {
  const oldClient = process.env.ANIDB_CLIENT;
  process.env.ANIDB_CLIENT = "";
  const { buildServer } = await import("../src/server.js");
  const handler = createMcpHandler(buildServer, { maxRequestBodySize: HTTP_BODY_MAX_BYTES, maxSubscriptions: 16 });
  const server = createHttpServer(loadHttpConfig({}), handler);
  const client = new Client({ name: "offline-loopback-http", version: "1" });
  try {
    server.listen(0, "127.0.0.1"); await once(server, "listening");
    const address = server.address(); assert.ok(address && typeof address !== "string");
    await client.connect(new StreamableHTTPClientTransport(new URL(`http://127.0.0.1:${address.port}/mcp`)));
    const listing = await client.listTools();
    assert.equal(listing.tools.length, 12);
    assert.ok(listing.tools.some(tool => tool.name === "search_characters_in_selected_anime"));
    assert.ok(listing.tools.some(tool => tool.name === "rank_episode_characters"));
    assert.ok(listing.tools.every(tool => tool.annotations?.readOnlyHint === true));
    const health = await client.callTool({ name: "health", arguments: {} });
    assert.deepEqual(health.structuredContent, { name: "weeb-moe-nexus", status: "ok", anidbConfigured: false });
    const status = await client.callTool({ name: "get_provider_status", arguments: {} });
    assert.notEqual(status.isError, true);
    const registry = status.structuredContent as { providers: { health: { freshness: string; observation: unknown } }[] };
    assert.equal(registry.providers[0]!.health.freshness, "unobserved");
    assert.equal(registry.providers[0]!.health.observation, null);
  } finally {
    await client.close(); await handler.close(); server.closeAllConnections();
    await new Promise<void>(resolve => server.close(() => resolve()));
    if (oldClient === undefined) delete process.env.ANIDB_CLIENT; else process.env.ANIDB_CLIENT = oldClient;
  }
});
