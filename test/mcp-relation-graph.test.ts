import assert from "node:assert/strict";
import test from "node:test";
import { Client, InMemoryTransport } from "@modelcontextprotocol/client";
import { relationGraphResultSchema } from "../src/domain/relation-graph.js";

test("MCP traversal enforces budgets, preserves provenance and reuses the paced anime cache", async () => {
  const originalClient = process.env.ANIDB_CLIENT;
  const originalInterval = process.env.ANIDB_MIN_INTERVAL_MS;
  const originalFetch = globalThis.fetch;
  process.env.ANIDB_CLIENT = "weebmoenexus";
  process.env.ANIDB_MIN_INTERVAL_MS = "2000";
  const reads: number[] = [];
  // Synthetic XML only. Boundary 6003 must never be fetched in this test.
  const xml = new Map([
    [6001, '<anime id="6001"><titles><title type="main">Synthetic root</title></titles><relatedanime><anime id="6002" type="sequel">Synthetic sequel</anime></relatedanime></anime>'],
    [6002, '<anime id="6002"><titles><title type="main">Synthetic target</title></titles><relatedanime><anime id="6001" type="prequel"/><anime id="6003" type="sequel"/></relatedanime></anime>']
  ]);
  globalThis.fetch = async request => {
    const url = new URL(String(request));
    assert.equal(url.searchParams.get("client"), "weebmoenexus");
    const id = Number(url.searchParams.get("aid"));
    reads.push(id);
    const body = xml.get(id);
    assert.ok(body, `Unexpected live/boundary fetch: ${id}`);
    return new Response(body, { status: 200 });
  };

  let server: ReturnType<(typeof import("../src/server.js"))["buildServer"]> | null = null;
  let client: Client | null = null;
  try {
    const { buildServer } = await import("../src/server.js");
    server = buildServer();
    client = new Client({ name: "offline-relation-graph", version: "1.0.0" });
    const [ct, st] = InMemoryTransport.createLinkedPair();
    await server.connect(st);
    await client.connect(ct);
    const listing = await client.listTools();
    const tool = listing.tools.find(t => t.name === "traverse_anime_relations");
    assert.ok(tool);
    assert.equal(tool.annotations?.readOnlyHint, true);
    assert.equal(tool.annotations?.openWorldHint, true);

    const result = await client.callTool({
      name: "traverse_anime_relations",
      arguments: { anidbId: 6001, maxDepth: 2, maxReads: 2 }
    });
    assert.notEqual(result.isError, true);
    const graph = relationGraphResultSchema.parse(result.structuredContent);
    assert.deepEqual(reads, [6001, 6002]);
    assert.equal(graph.readAttempts, 2);
    assert.equal(graph.recordsRead, 2);
    assert.equal(graph.termination, "depth_limit");
    assert.deepEqual(graph.edges.map(e => [e.sourceAnimeId, e.targetAnimeId, e.relationType]), [
      [6001, 6002, "sequel"], [6002, 6001, "prequel"], [6002, 6003, "sequel"]
    ]);
    assert.ok(graph.edges.every(e => e.evidenceSourceUrl === `https://anidb.net/anime/${e.sourceAnimeId}`));
    assert.equal(graph.nodes[1]!.title, "Synthetic target");
    assert.equal(graph.nodes[2]!.recordRead, false);
    assert.equal(graph.nodes[2]!.title, null);

    const again = await client.callTool({ name: "traverse_anime_relations", arguments: { anidbId: 6001 } });
    assert.notEqual(again.isError, true);
    assert.equal(relationGraphResultSchema.parse(again.structuredContent).recordsRead, 1);
    assert.deepEqual(reads, [6001, 6002], "cached root reused; no boundary fetch");

    const invalid = await client.callTool({
      name: "traverse_anime_relations", arguments: { anidbId: 6001, maxReads: 11 }
    });
    assert.equal(invalid.isError, true);
    assert.deepEqual(reads, [6001, 6002]);
  } finally {
    if (client) await client.close();
    if (server) await server.close();
    globalThis.fetch = originalFetch;
    if (originalClient === undefined) delete process.env.ANIDB_CLIENT;
    else process.env.ANIDB_CLIENT = originalClient;
    if (originalInterval === undefined) delete process.env.ANIDB_MIN_INTERVAL_MS;
    else process.env.ANIDB_MIN_INTERVAL_MS = originalInterval;
  }
});
