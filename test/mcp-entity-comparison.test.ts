import assert from "node:assert/strict";
import test from "node:test";
import { Client, InMemoryTransport } from "@modelcontextprotocol/client";
import { entityComparisonResultSchema } from "../src/domain/entity-comparison.js";
import { providerErrorSchema } from "../src/domain/provider-error.js";

test("MCP entity comparison keeps source collisions, unknown species, bounds and provider errors explicit", async () => {
  const prior = { client: process.env.ANIDB_CLIENT, directory: process.env.ANIDB_ANIME_CACHE_DIR };
  const originalFetch = globalThis.fetch;
  process.env.ANIDB_CLIENT = "weebmoenexus";
  process.env.ANIDB_ANIME_CACHE_DIR = "";
  const reads: number[] = [];
  // All fixture character/contributor IDs and credits are synthetic.
  const bodies = new Map([
    [1725, '<anime id="1725"><titles><title type="main">Viper GTS</title></titles><creators><name id="888">Same Person</name><name id="889">Same Person</name></creators><characters><character id="888"><name>Carrera</name></character></characters></anime>'],
    [9800, '<anime id="9800"><titles><title type="main">Different Work</title></titles><characters><character id="889"><name>Carrera</name></character></characters></anime>'],
    [9900, '<error>Client banned</error>']
  ]);
  globalThis.fetch = async request => {
    const id = Number(new URL(String(request)).searchParams.get("aid")); reads.push(id);
    const body = bodies.get(id); assert.ok(body, "No unmocked source read is permitted"); return new Response(body);
  };
  let server: ReturnType<(typeof import("../src/server.js"))["buildServer"]> | undefined;
  let client: Client | undefined;
  try {
    const { buildServer } = await import("../src/server.js"); server = buildServer();
    client = new Client({ name: "offline-entity-comparison", version: "1" });
    const [ct, st] = InMemoryTransport.createLinkedPair(); await server.connect(st); await client.connect(ct);
    const tool = (await client.listTools()).tools.find(t => t.name === "compare_anime_entities");
    assert.ok(tool); assert.equal(tool.annotations?.readOnlyHint, true); assert.equal(tool.annotations?.openWorldHint, true);
    const result = await client.callTool({ name: "compare_anime_entities", arguments: { anidbIds: [9800, 1725], query: "Carrera", workTitle: "Viper GTS", species: "Succubus" } });
    assert.notEqual(result.isError, true);
    const comparison = entityComparisonResultSchema.parse(result.structuredContent);
    assert.equal(comparison.resolution, "incomplete"); assert.equal(comparison.unverifiedCount, 1); assert.equal(comparison.conflictingCount, 1);
    assert.equal(comparison.candidates[0]!.occurrence.sourceAnimeId, 1725);
    assert.equal(comparison.candidates[0]!.checks.find(c => c.field === "species")!.status, "unknown");
    assert.deepEqual(reads, [9800, 1725]);
    const people = await client.callTool({ name: "compare_anime_entities", arguments: { anidbIds: [1725], query: "Same Person", kind: "contributor", limit: 1 } });
    const personResult = entityComparisonResultSchema.parse(people.structuredContent);
    assert.equal(personResult.resolution, "ambiguous"); assert.equal(personResult.totalNameCandidates, 2); assert.equal(personResult.truncated, true);
    assert.deepEqual(reads, [9800, 1725], "existing source cache is reused");
    const invalid = await client.callTool({ name: "compare_anime_entities", arguments: { anidbIds: [1, 2, 3, 4, 5, 6], query: "Carrera" } });
    assert.equal(invalid.isError, true); assert.deepEqual(reads, [9800, 1725]);
    const failed = await client.callTool({ name: "compare_anime_entities", arguments: { anidbIds: [9900, 9901], query: "Carrera" } });
    assert.equal(failed.isError, true); assert.equal(providerErrorSchema.parse(failed.structuredContent?.error).code, "banned");
    assert.deepEqual(reads, [9800, 1725, 9900], "failure stops before the next requested source");
  } finally {
    await client?.close(); await server?.close(); globalThis.fetch = originalFetch;
    if (prior.client === undefined) delete process.env.ANIDB_CLIENT; else process.env.ANIDB_CLIENT = prior.client;
    if (prior.directory === undefined) delete process.env.ANIDB_ANIME_CACHE_DIR; else process.env.ANIDB_ANIME_CACHE_DIR = prior.directory;
  }
});
