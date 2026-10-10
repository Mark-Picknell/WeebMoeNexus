import assert from "node:assert/strict";
import test from "node:test";
import { Client, InMemoryTransport } from "@modelcontextprotocol/client";
import { providerRegistryResultSchema } from "../src/domain/provider-registry.js";
import { AnimeService } from "../src/services/anime-service.js";

test("actual MCP status inspection preserves legacy health, performs no probes and retains HTTP failure after cache hits", async () => {
  const names = ["ANIDB_CLIENT", "ANIDB_MIN_INTERVAL_MS", "ANIDB_ANIME_CACHE_DIR", "ANIDB_HTTP_API_URL"] as const;
  const before = Object.fromEntries(names.map(n => [n, process.env[n]]));
  const oldFetch = globalThis.fetch;
  process.env.ANIDB_CLIENT = "synthetic-client";
  process.env.ANIDB_MIN_INTERVAL_MS = "2000";
  process.env.ANIDB_ANIME_CACHE_DIR = "";
  process.env.ANIDB_HTTP_API_URL = "https://example.test/synthetic-private-endpoint";
  const reads: number[] = [];
  globalThis.fetch = async request => {
    const id = Number(new URL(String(request)).searchParams.get("aid")); reads.push(id);
    if (id === 11) return new Response('<anime id="11"><titles><title type="main">Synthetic Work</title></titles></anime>');
    if (id === 12) return new Response('<error>Client banned</error>');
    throw new Error("Unexpected synthetic provider request");
  };
  let server: ReturnType<(typeof import("../src/server.js"))["buildServer"]> | null = null;
  let client: Client | null = null;
  const oldHealth = AnimeService.prototype.getProviderHealth;
  try {
    const { buildServer } = await import("../src/server.js"); server = buildServer();
    client = new Client({ name: "offline-provider-status", version: "1" });
    const [ct, st] = InMemoryTransport.createLinkedPair(); await server.connect(st); await client.connect(ct);
    const listing = await client.listTools();
    const tool = listing.tools.find(t => t.name === "get_provider_status");
    assert.ok(tool); assert.equal(tool.annotations?.readOnlyHint, true); assert.equal(tool.annotations?.openWorldHint, false);
    const inspect = async () => {
      const result = await client!.callTool({ name: "get_provider_status", arguments: {} });
      assert.notEqual(result.isError, true);
      const registry = providerRegistryResultSchema.parse(result.structuredContent);
      const serialized = JSON.stringify(result);
      assert.equal(serialized.includes("synthetic-client"), false);
      assert.equal(serialized.includes("synthetic-private-endpoint"), false);
      assert.deepEqual(registry.providers.map(p => p.declaration.provider), ["anidb"]);
      return registry.providers[0]!;
    };
    const first = await inspect();
    assert.equal(first.health.configuration, "ready"); assert.equal(first.health.freshness, "unobserved");
    const callable = new Set(listing.tools.map(t => t.name));
    for (const capability of first.declaration.capabilities) for (const name of capability.tools) assert.ok(callable.has(name), "registry must not advertise a missing MCP tool");
    const legacy = await client.callTool({ name: "health", arguments: {} });
    assert.deepEqual(legacy.structuredContent, { name: "weeb-moe-nexus", status: "ok", anidbConfigured: true });
    assert.deepEqual(reads, []);
    await client.callTool({ name: "get_anime_by_anidb_id", arguments: { anidbId: 11 } });
    assert.equal((await inspect()).health.observation!.outcome, "validated_success");
    const failed = await client.callTool({ name: "get_related_anime", arguments: { anidbId: 12 } });
    assert.equal(failed.isError, true);
    const failure = (await inspect()).health.observation!;
    assert.equal(failure.outcome, "failed");
    if (failure.outcome === "failed") assert.equal(failure.error.code, "banned");
    await client.callTool({ name: "get_anime_by_anidb_id", arguments: { anidbId: 11 } });
    assert.deepEqual((await inspect()).health.observation, failure);
    assert.deepEqual(reads, [11, 12]);
    assert.deepEqual((await client.callTool({ name: "health", arguments: {} })).structuredContent, legacy.structuredContent);
    AnimeService.prototype.getProviderHealth = () => { throw new Error("private-reader-path"); };
    const broken = await client.callTool({ name: "get_provider_status", arguments: {} });
    assert.equal(broken.isError, true);
    assert.equal(JSON.stringify(broken).includes("private-reader-path"), false);
    assert.deepEqual(reads, [11, 12]);
  } finally {
    AnimeService.prototype.getProviderHealth = oldHealth;
    if (client) await client.close(); if (server) await server.close();
    globalThis.fetch = oldFetch;
    for (const name of names) { if (before[name] === undefined) delete process.env[name]; else process.env[name] = before[name]; }
  }
});
