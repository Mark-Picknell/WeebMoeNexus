import assert from "node:assert/strict";
import test from "node:test";
import { Client, InMemoryTransport } from "@modelcontextprotocol/client";
import { animeEvidenceResultSchema } from "../src/domain/anime-evidence.js";
import { AnimeService } from "../src/services/anime-service.js";

test("actual MCP evidence tool reuses the cache, retains conflicts under preference and sanitizes errors", async () => {
  const names = ["ANIDB_CLIENT", "ANIDB_MIN_INTERVAL_MS", "ANIDB_ANIME_CACHE_DIR", "ANIDB_HTTP_API_URL"] as const;
  const before = Object.fromEntries(names.map(n => [n, process.env[n]]));
  const oldFetch = globalThis.fetch, oldReader = AnimeService.prototype.getByAniDbId;
  process.env.ANIDB_CLIENT = "synthetic-client"; process.env.ANIDB_MIN_INTERVAL_MS = "2000";
  process.env.ANIDB_ANIME_CACHE_DIR = ""; process.env.ANIDB_HTTP_API_URL = "https://example.test/private-endpoint";
  const reads: number[] = [];
  globalThis.fetch = async request => {
    const id = Number(new URL(String(request)).searchParams.get("aid")); reads.push(id);
    if (id === 7) return new Response('<anime id="7"><characters><character id="1"><name>Synthetic</name><gender>female</gender></character><character id="1"><name>Variant</name><gender>male</gender></character></characters></anime>');
    if (id === 8) return new Response('<error>Client banned</error>');
    throw new Error("Unexpected synthetic request");
  };
  let server: ReturnType<(typeof import("../src/server.js"))["buildServer"]> | null = null;
  let client: Client | null = null;
  try {
    const { buildServer } = await import("../src/server.js"); server = buildServer();
    client = new Client({ name: "offline-anime-evidence", version: "1" });
    const [ct, st] = InMemoryTransport.createLinkedPair(); await server.connect(st); await client.connect(ct);
    const listing = await client.listTools(); const tool = listing.tools.find(t => t.name === "get_anime_evidence")!;
    assert.equal(tool.annotations?.readOnlyHint, true); assert.equal(tool.annotations?.openWorldHint, true);
    const first = await client.callTool({ name: "get_anime_evidence", arguments: { anidbId: 7 } });
    const result = animeEvidenceResultSchema.parse(first.structuredContent);
    assert.equal(result.fields.find(f => f.assessment.request.field === "gender")!.assessment.status, "conflicting");
    const next = await client.callTool({ name: "get_anime_evidence", arguments: { anidbId: 7, sourcePreference: { providers: ["unconnected"], allowUnlisted: false } } });
    const preferred = animeEvidenceResultSchema.parse(next.structuredContent);
    assert.deepEqual(preferred.projection, result.projection);
    assert.deepEqual(preferred.fields.map(f => f.assessment), result.fields.map(f => f.assessment));
    assert.ok(preferred.fields.filter(f => f.assessment.claims.length).every(f => f.status === "no_eligible_source"));
    assert.deepEqual(reads, [7]);
    const registry = await client.callTool({ name: "get_provider_status", arguments: {} });
    assert.ok(JSON.stringify(registry.structuredContent).includes('"field_evidence"'));
    const failed = await client.callTool({ name: "get_anime_evidence", arguments: { anidbId: 8 } });
    assert.equal(failed.isError, true); assert.equal((failed.structuredContent as any).error.code, "banned");
    assert.deepEqual(reads, [7, 8]);
    const invalid = await client.callTool({ name: "get_anime_evidence", arguments: { anidbId: 0 } });
    assert.equal(invalid.isError, true); assert.deepEqual(reads, [7, 8]);
    AnimeService.prototype.getByAniDbId = async () => { throw new Error("private-reader-detail"); };
    const broken = await client.callTool({ name: "get_anime_evidence", arguments: { anidbId: 7 } });
    assert.equal(broken.isError, true); assert.equal(JSON.stringify(broken).includes("private-reader-detail"), false);
    assert.equal(JSON.stringify(first).includes("synthetic-client"), false);
    assert.equal(JSON.stringify(first).includes("private-endpoint"), false);
  } finally {
    AnimeService.prototype.getByAniDbId = oldReader;
    if (client) await client.close(); if (server) await server.close(); globalThis.fetch = oldFetch;
    for (const name of names) { if (before[name] === undefined) delete process.env[name]; else process.env[name] = before[name]; }
  }
});
