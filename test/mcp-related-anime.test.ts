import assert from "node:assert/strict";
import test from "node:test";
import { Client, InMemoryTransport } from "@modelcontextprotocol/client";

/** These are synthetic test relationships, NOT real AniDB work assertions. */
const synthetic = `<?xml version="1.0" encoding="UTF-8"?>
<anime id="501" restricted="0">
  <titles><title type="main" xml:lang="en">Synthetic Story</title></titles>
  <relatedanime>
    <anime id="502" type="prequel">Synthetic Story: Earlier</anime>
    <anime id="503" type="alternative version"/>
  </relatedanime>
</anime>`;

test("MCP get_related_anime retrieves one source and preserves direct evidence without target fetches", async () => {
  // Set the client identity before importing the module-scoped AnimeService.
  const originalClient = process.env.ANIDB_CLIENT;
  process.env.ANIDB_CLIENT = "weebmoenexus";
  const originalFetch = globalThis.fetch;
  let fetchCount = 0;
  const seen: URL[] = [];
  globalThis.fetch = async request => {
    fetchCount++;
    const url = new URL(String(request));
    seen.push(url);
    assert.equal(url.searchParams.get("aid"), "501");
    assert.equal(url.searchParams.get("client"), "weebmoenexus");
    return new Response(synthetic, {
      status: 200, headers: { "Content-Type": "application/xml" }
    });
  };

  let server: ReturnType<(typeof import("../src/server.js"))["buildServer"]> | null = null;
  let client: Client | null = null;
  try {
    const { buildServer } = await import("../src/server.js");
    server = buildServer();
    client = new Client({ name: "offline-relations-integration", version: "1.0.0" });
    const [ct, st] = InMemoryTransport.createLinkedPair();
    await server.connect(st);
    await client.connect(ct);

    const tools = await client.listTools();
    assert.ok(tools.tools.some(t => t.name === "get_related_anime"));

    const result = await client.callTool({
      name: "get_related_anime",
      arguments: { anidbId: 501 }
    });
    assert.notEqual(result.isError, true);
    const body = result.structuredContent as {
      sourceAnimeId: number;
      sourceTitle: string;
      sourceUrl: string;
      reportedRelationCount: number;
      relations: Array<{
        sourceAnimeId: number;
        targetAnimeId: number;
        relationType: string;
        targetTitle: string | null;
        targetUrl: string;
        evidenceSourceUrl: string;
        retrievedAt: string;
      }>;
    };
    assert.equal(body.sourceAnimeId, 501);
    assert.equal(body.sourceTitle, "Synthetic Story");
    assert.equal(body.sourceUrl, "https://anidb.net/anime/501");
    assert.equal(body.reportedRelationCount, 2);
    assert.deepEqual(body.relations.map(r => r.targetAnimeId), [502, 503]);
    assert.deepEqual(body.relations.map(r => r.relationType), ["prequel", "alternative version"]);
    assert.equal(body.relations[0]?.targetTitle, "Synthetic Story: Earlier");
    assert.equal(body.relations[1]?.targetTitle, null);
    assert.ok(body.relations.every(r =>
      r.sourceAnimeId === 501 &&
      r.evidenceSourceUrl === "https://anidb.net/anime/501" &&
      r.targetUrl === `https://anidb.net/anime/${r.targetAnimeId}` &&
      !Number.isNaN(Date.parse(r.retrievedAt))
    ));
    // A second relation call and a regular anime read reuse the same
    // source cache; neither requires fetching any linked target IDs.
    const again = await client.callTool({
      name: "get_related_anime", arguments: { anidbId: 501 }
    });
    assert.notEqual(again.isError, true);
    assert.equal(fetchCount, 1);
    assert.equal(seen.length, 1);
  } finally {
    if (client) await client.close();
    if (server) await server.close();
    globalThis.fetch = originalFetch;
    if (originalClient === undefined) delete process.env.ANIDB_CLIENT;
    else process.env.ANIDB_CLIENT = originalClient;
  }
});
