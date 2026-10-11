import assert from "node:assert/strict";
import test from "node:test";
import { Client, InMemoryTransport } from "@modelcontextprotocol/client";
import { selectedCharacterSearchResultSchema } from "../src/domain/selected-character-search.js";
import { providerErrorSchema } from "../src/domain/provider-error.js";

const xml = new Map<number, string>([
  [1725, `<anime id="1725">
    <titles><title type="main">Viper GTS</title></titles>
    <characters><character id="700"><name>Carrera</name><seiyuu id="40">Synthetic Performer</seiyuu></character>
    <character id="701"><name>Carrera Extra</name></character></characters>
  </anime>`],
  [9800, `<anime id="9800">
    <titles><title type="main">Other Anime</title></titles>
    <characters><character id="700"><name>Carrera</name></character><character id="702"><name>Carrera Character</name></character></characters>
  </anime>`],
  [9900, "<error>Client banned</error>"]
]);

test("read-only MCP selected character search ranks work context, retains collisions, caches sources and stops on ban", async () => {
  const originalClient = process.env.ANIDB_CLIENT;
  const originalDirectory = process.env.ANIDB_ANIME_CACHE_DIR;
  const originalFetch = globalThis.fetch;
  process.env.ANIDB_CLIENT = "weebmoenexus";
  process.env.ANIDB_ANIME_CACHE_DIR = "";
  const reads: number[] = [];
  globalThis.fetch = async input => {
    const id = Number(new URL(String(input)).searchParams.get("aid"));
    reads.push(id);
    const body = xml.get(id);
    assert.ok(body, `Unexpected AniDB lookup ${id}`);
    return new Response(body, { status: 200, headers: { "Content-Type": "application/xml" } });
  };

  let server: ReturnType<(typeof import("../src/server.js"))["buildServer"]> | null = null;
  let client: Client | null = null;
  try {
    const { buildServer } = await import("../src/server.js");
    server = buildServer();
    client = new Client({ name: "offline-selected-character-search", version: "1.0" });
    const [ct, st] = InMemoryTransport.createLinkedPair();
    await server.connect(st);
    await client.connect(ct);

    const tool = (await client.listTools()).tools.find(t => t.name === "search_characters_in_selected_anime");
    assert.ok(tool);
    assert.equal(tool.annotations?.readOnlyHint, true);
    const result = await client.callTool({
      name: "search_characters_in_selected_anime",
      arguments: { anidbIds: [9800, 1725], query: "Carrera", workTitle: "Viper GTS" }
    });
    assert.notEqual(result.isError, true);
    const data = selectedCharacterSearchResultSchema.parse(result.structuredContent);
    assert.equal(data.totalNameMatches, 4);
    assert.deepEqual(data.examinedAnimeIds, [9800, 1725]);
    assert.deepEqual(data.results.map(x => [x.sourceAnimeId, x.anidbCharacterId, x.nameMatch]),
      [[1725, 700, "exact"], [1725, 701, "prefix"], [9800, 700, "exact"], [9800, 702, "prefix"]]);
    assert.equal(data.results[0]!.voiceActor?.name, "Synthetic Performer");
    assert.equal(data.results[2]!.workTitleMatch, "different_source_work");
    assert.deepEqual(reads, [9800, 1725]);

    const truncated = await client.callTool({
      name: "search_characters_in_selected_anime",
      arguments: { anidbIds: [1725, 9800], query: "Carrera", limit: 1 }
    });
    const partial = selectedCharacterSearchResultSchema.parse(truncated.structuredContent);
    assert.equal(partial.totalNameMatches, 4);
    assert.equal(partial.truncated, true);
    assert.equal(partial.results.length, 1);
    assert.deepEqual(reads, [9800, 1725], "repeat selected work reads reused validated cache");

    const invalid = await client.callTool({
      name: "search_characters_in_selected_anime",
      arguments: { anidbIds: [1725, 1725], query: "Carrera" }
    });
    assert.equal(invalid.isError, true);
    assert.deepEqual(reads, [9800, 1725]);

    const banned = await client.callTool({
      name: "search_characters_in_selected_anime",
      arguments: { anidbIds: [9900, 9999], query: "Carrera" }
    });
    assert.equal(banned.isError, true);
    assert.equal(providerErrorSchema.parse(banned.structuredContent?.error).code, "banned");
    assert.deepEqual(reads, [9800, 1725, 9900], "provider error stops later selected work reads");
  } finally {
    await client?.close();
    await server?.close();
    globalThis.fetch = originalFetch;
    if (originalClient === undefined) delete process.env.ANIDB_CLIENT;
    else process.env.ANIDB_CLIENT = originalClient;
    if (originalDirectory === undefined) delete process.env.ANIDB_ANIME_CACHE_DIR;
    else process.env.ANIDB_ANIME_CACHE_DIR = originalDirectory;
  }
});
