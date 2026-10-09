import assert from "node:assert/strict";
import test from "node:test";
import { Client, InMemoryTransport } from "@modelcontextprotocol/client";

/**
 * Synthetic fixture deliberately scoped to AniDB #1725 as an identity
 * regression. Names/credits in this test are not claims about live AniDB.
 */
const fixture = `<?xml version="1.0" encoding="UTF-8"?>
<anime id="1725" restricted="1">
  <titles><title xml:lang="en" type="main">Viper GTS</title></titles>
  <episodes>
    <episode id="801"><epno type="1">01</epno></episode>
    <episode id="802"><epno type="1">2</epno></episode>
    <episode id="803"><epno type="2">1</epno></episode>
  </episodes>
  <characters>
    <character id="501" type="main character in">
      <name>Carrera</name><gender>female</gender><episodes>1,2</episodes>
      <seiyuu id="88">Sample Performer</seiyuu>
    </character>
    <character id="502" type="secondary">
      <name>Carrera</name>
    </character>
    <character id="503"><name>Carrera Mk II</name></character>
    <character id="504"><name>カレラ</name></character>
  </characters>
</anime>`;

test("real MCP find_character returns only source-scoped characters and retains independent IDs", async () => {
  const originalClient = process.env.ANIDB_CLIENT;
  const originalFetch = globalThis.fetch;
  const previousCacheDirectory = process.env.ANIDB_ANIME_CACHE_DIR;
  process.env.ANIDB_ANIME_CACHE_DIR = ""; // Synthetic fixtures never share persistent application data.
  process.env.ANIDB_CLIENT = "weebmoenexus";
  let requestedCount = 0;
  globalThis.fetch = async input => {
    requestedCount++;
    const url = new URL(String(input));
    assert.equal(url.searchParams.get("aid"), "1725");
    assert.equal(url.searchParams.get("client"), "weebmoenexus");
    return new Response(fixture, {
      status: 200,
      headers: { "Content-Type": "application/xml" }
    });
  };

  let server: ReturnType<(typeof import("../src/server.js"))["buildServer"]> | null = null;
  let client: Client | null = null;
  try {
    const { buildServer } = await import("../src/server.js");
    server = buildServer();
    client = new Client({ name: "offline-character-finder", version: "1.0.0" });
    const [ct, st] = InMemoryTransport.createLinkedPair();
    await server.connect(st);
    await client.connect(ct);

    const listed = await client.listTools();
    assert.ok(listed.tools.some(tool => tool.name === "find_character"));

    const found = await client.callTool({
      name: "find_character",
      arguments: { anidbId: 1725, query: "Carrera", limit: 10 }
    });
    assert.notEqual(found.isError, true);

    const record = found.structuredContent as {
      scope: string;
      query: string;
      sourceAnimeId: number;
      sourceAnimeTitle: string;
      reportedCharacterCount: number;
      totalMatches: number;
      results: Array<{
        anidbCharacterId: number;
        characterName: string;
        matchType: string;
        evidenceSourceUrl: string;
        episodeAppearancesRaw: string | null;
        episodeEvidence: { parseStatus: string; coverage: string; linkedEpisodeIds: number[]; references: string[] };
        voiceActor: { id: number | null; name: string } | null;
      }>;
    };

    assert.equal(record.scope, "one_anidb_anime");
    assert.equal(record.query, "Carrera");
    assert.equal(record.sourceAnimeId, 1725);
    assert.equal(record.sourceAnimeTitle, "Viper GTS");
    assert.equal(record.reportedCharacterCount, 4);
    assert.equal(record.totalMatches, 2);
    assert.deepEqual(record.results.map(m => m.anidbCharacterId), [501, 502]);
    assert.ok(record.results.every(m => m.matchType === "exact"));
    assert.ok(record.results.every(m =>
      m.evidenceSourceUrl === "https://anidb.net/anime/1725"
    ));
    assert.equal(record.results[0]?.voiceActor?.name, "Sample Performer");
    assert.equal(record.results[0]?.episodeAppearancesRaw, "1,2");
    assert.deepEqual(record.results[0]?.episodeEvidence.linkedEpisodeIds, [801, 802]);
    assert.deepEqual(record.results[0]?.episodeEvidence.references, ["1", "2"]);
    assert.equal(record.results[0]?.episodeEvidence.coverage, "all_references_listed");
    assert.equal(record.results[1]?.episodeEvidence.parseStatus, "unknown");
    assert.equal(record.results[1]?.episodeAppearancesRaw, null);

    assert.ok(listed.tools.some(tool => tool.name === "get_character"));

    // Character-ID lookup must operate on the SAME already cached source work,
    // even when multiple characters share a name.
    const byId = await client.callTool({
      name: "get_character",
      arguments: { anidbId: 1725, characterId: 501 }
    });
    assert.notEqual(byId.isError, true);
    const detail = byId.structuredContent as {
      found: boolean;
      requestedCharacterId: number;
      reportedCharacterCount: number;
      sourceAnimeId: number;
      character: {
        anidbCharacterId: number;
        name: string;
        episodeAppearancesRaw: string | null;
        episodeEvidence: { parseStatus: string; linkedEpisodeIds: number[] };
        voiceActor: { name: string } | null;
      } | null;
    };
    assert.equal(detail.found, true);
    assert.equal(detail.sourceAnimeId, 1725);
    assert.equal(detail.requestedCharacterId, 501);
    assert.equal(detail.character?.anidbCharacterId, 501);
    assert.equal(detail.character?.name, "Carrera");
    assert.equal(detail.character?.episodeAppearancesRaw, "1,2");
    assert.deepEqual(detail.character?.episodeEvidence.linkedEpisodeIds, [801, 802]);
    assert.equal(detail.character?.voiceActor?.name, "Sample Performer");

    const absentId = await client.callTool({
      name: "get_character",
      arguments: { anidbId: 1725, characterId: 9999 }
    });
    assert.notEqual(absentId.isError, true);
    assert.equal((absentId.structuredContent as { found: boolean }).found, false);
    assert.equal((absentId.structuredContent as { character: unknown }).character, null);

    const invalidId = await client.callTool({
      name: "get_character",
      arguments: { anidbId: 1725, characterId: 0 }
    });
    assert.equal(invalidId.isError, true);

    const japanese = await client.callTool({
      name: "find_character",
      arguments: { anidbId: 1725, query: "カレラ" }
    });
    assert.notEqual(japanese.isError, true);
    assert.deepEqual(
      (japanese.structuredContent as { results: Array<{ anidbCharacterId: number }> })
        .results.map(x => x.anidbCharacterId),
      [504]
    );

    const absent = await client.callTool({
      name: "find_character",
      arguments: { anidbId: 1725, query: "No Source Character" }
    });
    assert.notEqual(absent.isError, true);
    const absentResult = absent.structuredContent as {
      totalMatches: number;
      reportedCharacterCount: number;
      results: unknown[];
    };
    assert.equal(absentResult.totalMatches, 0);
    assert.equal(absentResult.reportedCharacterCount, 4);
    assert.deepEqual(absentResult.results, []);

    const invalid = await client.callTool({
      name: "find_character",
      arguments: { anidbId: 1725, query: "C" }
    });
    assert.equal(invalid.isError, true);

    // All calls share a single source anime; nothing is searched in another
    // series and there is no character-by-name API call.
    assert.equal(requestedCount, 1);
  } finally {
    if (client) await client.close();
    if (server) await server.close();
    if (previousCacheDirectory === undefined) delete process.env.ANIDB_ANIME_CACHE_DIR;
    else process.env.ANIDB_ANIME_CACHE_DIR = previousCacheDirectory;
    globalThis.fetch = originalFetch;
    if (originalClient === undefined) delete process.env.ANIDB_CLIENT;
    else process.env.ANIDB_CLIENT = originalClient;
  }
});
