import assert from "node:assert/strict";
import test from "node:test";
import { Client, InMemoryTransport } from "@modelcontextprotocol/client";

const fixture = `<?xml version="1.0" encoding="UTF-8"?>
<anime id="1725">
  <titles><title type="main">Synthetic Viper Work</title></titles>
  <episodes>
    <episode id="801"><epno type="1">1</epno></episode>
    <episode id="802"><epno type="1">2</epno></episode>
    <episode id="803"><epno type="2">1</epno></episode>
  </episodes>
  <characters>
    <character id="501"><name>Character One</name><episodes>1,2</episodes></character>
    <character id="502"><name>Character Two</name></character>
    <character id="503"><name>Character Three</name><episodes>S1,unsupported</episodes></character>
  </characters>
</anime>`;

test("MCP episode character ranking preserves unknowns and uses exactly one paced source read", async () => {
  const oldClient = process.env.ANIDB_CLIENT;
  const oldCache = process.env.ANIDB_ANIME_CACHE_DIR;
  const oldFetch = globalThis.fetch;
  process.env.ANIDB_CLIENT = "weebmoenexus";
  process.env.ANIDB_ANIME_CACHE_DIR = "";
  let fetches = 0;
  globalThis.fetch = async input => {
    fetches++;
    assert.equal(new URL(String(input)).searchParams.get("aid"), "1725");
    return new Response(fixture, { status: 200, headers: { "Content-Type": "application/xml" } });
  };
  let server: ReturnType<(typeof import("../src/server.js"))["buildServer"]> | null = null;
  let client: Client | null = null;
  try {
    const { buildServer } = await import("../src/server.js");
    server = buildServer();
    client = new Client({ name: "offline-episode-ranking", version: "1.0.0" });
    const [ct, st] = InMemoryTransport.createLinkedPair();
    await server.connect(st);
    await client.connect(ct);
    const listed = await client.listTools();
    const rankingTool = listed.tools.find(t => t.name === "rank_episode_characters");
    assert.ok(rankingTool);
    assert.equal(rankingTool.annotations?.readOnlyHint, true);

    const r = await client.callTool({ name: "rank_episode_characters",
      arguments: { anidbId: 1725, episodeId: 802, limit: 1 } });
    assert.notEqual(r.isError, true);
    const output = r.structuredContent as {
      sourceEpisodeFound: boolean; totalCandidates: number; positiveReferenceCount: number;
      unverifiedCount: number; truncated: boolean;
      candidates: { anidbCharacterId: number; appearance: string; episodeEvidence: { linkedEpisodeIds: number[] } }[];
    };
    assert.equal(output.sourceEpisodeFound, true);
    assert.equal(output.totalCandidates, 3);
    assert.equal(output.positiveReferenceCount, 1);
    assert.equal(output.unverifiedCount, 2);
    assert.equal(output.truncated, true);
    assert.deepEqual(output.candidates.map(c => c.anidbCharacterId), [501]);
    assert.deepEqual(output.candidates[0]!.episodeEvidence.linkedEpisodeIds, [801, 802]);

    const unknown = await client.callTool({ name: "rank_episode_characters",
      arguments: { anidbId: 1725, episodeId: 803 } });
    assert.notEqual(unknown.isError, true);
    const unknownOutput = unknown.structuredContent as {
      totalCandidates: number; unverifiedCount: number; positiveReferenceCount: number;
      candidates: { appearance: string }[];
    };
    assert.equal(unknownOutput.totalCandidates, 3);
    assert.equal(unknownOutput.positiveReferenceCount, 1, "positive special episode reference is source evidence");
    assert.equal(unknownOutput.unverifiedCount, 2);
    assert.ok(unknownOutput.candidates.some(c => c.appearance === "unverified"));

    const missing = await client.callTool({ name: "rank_episode_characters",
      arguments: { anidbId: 1725, episodeId: 9999 } });
    assert.notEqual(missing.isError, true);
    assert.equal((missing.structuredContent as { sourceEpisodeFound: boolean }).sourceEpisodeFound, false);
    assert.equal((missing.structuredContent as { totalCandidates: number }).totalCandidates, 0);

    const invalid = await client.callTool({ name: "rank_episode_characters",
      arguments: { anidbId: 1725, episodeId: 0 } });
    assert.equal(invalid.isError, true);
    assert.equal(fetches, 1, "valid requests reuse the same source record; invalid input makes no new request");
  } finally {
    if (client) await client.close();
    if (server) await server.close();
    globalThis.fetch = oldFetch;
    if (oldClient === undefined) delete process.env.ANIDB_CLIENT;
    else process.env.ANIDB_CLIENT = oldClient;
    if (oldCache === undefined) delete process.env.ANIDB_ANIME_CACHE_DIR;
    else process.env.ANIDB_ANIME_CACHE_DIR = oldCache;
  }
});
