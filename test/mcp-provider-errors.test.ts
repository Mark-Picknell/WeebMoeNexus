import assert from "node:assert/strict";
import test from "node:test";
import { Client, InMemoryTransport } from "@modelcontextprotocol/client";
import { providerErrorSchema } from "../src/domain/provider-error.js";

test("all AniDB-backed MCP read tools expose structured provider failures without changing success schemas", async () => {
  const oldClient = process.env.ANIDB_CLIENT;
  const oldInterval = process.env.ANIDB_MIN_INTERVAL_MS;
  const oldFetch = globalThis.fetch;
  const previousCacheDirectory = process.env.ANIDB_ANIME_CACHE_DIR;
  process.env.ANIDB_ANIME_CACHE_DIR = ""; // Synthetic fixtures never share persistent application data.
  process.env.ANIDB_CLIENT = "weebmoenexus";
  process.env.ANIDB_MIN_INTERVAL_MS = "2000";
  const reads: number[] = [];
  // These labels and arbitrary numeric codes are synthetic classification
  // fixtures, NOT recorded AniDB responses or a numeric API-code table.
  const bodies = new Map([
    [7001, '<error code="9001">No such anime</error>'],
    [7002, '<error code="9002">Client banned</error>'],
    [7003, '<error code="9003">Client version outdated</error>'],
    [7004, '<error code="9004">Unknown client</error>']
  ]);
  globalThis.fetch = async request => {
    const id = Number(new URL(String(request)).searchParams.get("aid"));
    reads.push(id);
    if (id === 7005) return new Response("Synthetic upstream failure", { status: 503 });
    const body = bodies.get(id);
    assert.ok(body, "No unmocked provider request is permitted");
    return new Response(body);
  };
  let server: ReturnType<(typeof import("../src/server.js"))["buildServer"]> | null = null;
  let client: Client | null = null;
  try {
    const { buildServer } = await import("../src/server.js");
    server = buildServer();
    client = new Client({ name: "offline-provider-errors", version: "1.0.0" });
    const [ct, st] = InMemoryTransport.createLinkedPair();
    await server.connect(st);
    await client.connect(ct);
    const cases = [
      { name: "get_anime_by_anidb_id", arguments: { anidbId: 7001 }, code: "not_found" },
      { name: "get_related_anime", arguments: { anidbId: 7002 }, code: "banned" },
      { name: "find_character", arguments: { anidbId: 7003, query: "Synthetic" }, code: "outdated" },
      { name: "get_character", arguments: { anidbId: 7004, characterId: 1 }, code: "misconfigured" },
      { name: "traverse_anime_relations", arguments: { anidbId: 7005 }, code: "unavailable" }
    ];
    for (const item of cases) {
      const result = await client.callTool({ name: item.name, arguments: item.arguments });
      assert.equal(result.isError, true);
      const error = providerErrorSchema.parse(result.structuredContent?.error);
      assert.equal(error.code, item.code);
      assert.equal(error.provider, "anidb");
      assert.equal(error.retried, false);
      assert.ok(result.content.some(c => c.type === "text" && c.text === error.message));
    }
    assert.deepEqual(reads, [7001, 7002, 7003, 7004, 7005]);
  } finally {
    if (client) await client.close();
    if (server) await server.close();
    if (previousCacheDirectory === undefined) delete process.env.ANIDB_ANIME_CACHE_DIR;
    else process.env.ANIDB_ANIME_CACHE_DIR = previousCacheDirectory;
    globalThis.fetch = oldFetch;
    if (oldClient === undefined) delete process.env.ANIDB_CLIENT;
    else process.env.ANIDB_CLIENT = oldClient;
    if (oldInterval === undefined) delete process.env.ANIDB_MIN_INTERVAL_MS;
    else process.env.ANIDB_MIN_INTERVAL_MS = oldInterval;
  }
});
