import assert from "node:assert/strict";
import test from "node:test";
import { promises as fs } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { gzipSync } from "node:zlib";
import { Client, InMemoryTransport } from "@modelcontextprotocol/client";
import { titledCharacterSearchResultSchema } from "../src/domain/titled-character-search.js";

const titles = `<animetitles>
  <anime aid="1725"><title xml:lang="en" type="main">Viper GTS</title></anime>
  <anime aid="77"><title xml:lang="en" type="main">Macross</title></anime>
  <anime aid="1088"><title xml:lang="en" type="main">Macross</title></anime>
</animetitles>`;

test("real MCP tool joins a unique local title to one provider source without guessing ambiguous titles", async () => {
  const dir = await fs.mkdtemp(join(tmpdir(), "weeb-titled-mcp-"));
  const path = join(dir, "titles.xml.gz");
  await fs.writeFile(path, gzipSync(titles));
  const keys = ["ANIDB_CLIENT", "ANIDB_ANIME_CACHE_DIR", "ANIDB_TITLE_DUMP_CACHE_PATH"] as const;
  const before = Object.fromEntries(keys.map(key => [key, process.env[key]]));
  const oldFetch = globalThis.fetch;
  process.env.ANIDB_CLIENT = "weebmoenexus";
  process.env.ANIDB_ANIME_CACHE_DIR = "";
  process.env.ANIDB_TITLE_DUMP_CACHE_PATH = path;
  const reads: number[] = [];
  globalThis.fetch = async input => {
    const id = Number(new URL(String(input)).searchParams.get("aid"));
    reads.push(id);
    assert.equal(id, 1725, "Only the explicitly unique local work may reach AniDB");
    return new Response(`<anime id="1725"><titles><title type="main">Viper GTS</title></titles>
      <characters><character id="5"><name>Carrera</name></character><character id="6"><name>Carrera</name></character></characters></anime>`);
  };
  let client: Client | null = null;
  let server: ReturnType<(typeof import("../src/server.js"))["buildServer"]> | null = null;
  try {
    const { buildServer } = await import("../src/server.js");
    server = buildServer();
    client = new Client({ name: "offline-title-character", version: "1" });
    const [ct, st] = InMemoryTransport.createLinkedPair();
    await server.connect(st); await client.connect(ct);
    const tool = (await client.listTools()).tools.find(t => t.name === "find_character_by_anime_title");
    assert.ok(tool); assert.equal(tool.annotations?.readOnlyHint, true);

    const found = await client.callTool({
      name: "find_character_by_anime_title",
      arguments: { animeTitle: "Viper GTS", characterName: "Carrera" }
    });
    assert.notEqual(found.isError, true);
    const value = titledCharacterSearchResultSchema.parse(found.structuredContent);
    assert.equal(value.status, "unique_work_searched");
    assert.equal(value.titleMatchCount, 1);
    assert.equal(value.selectedAnimeId, 1725);
    assert.deepEqual(value.characterSearch?.results.map(c => c.anidbCharacterId), [5, 6]);
    assert.deepEqual(reads, [1725]);

    const ambiguous = await client.callTool({
      name: "find_character_by_anime_title",
      arguments: { animeTitle: "Macross", characterName: "Carrera" }
    });
    const candidates = titledCharacterSearchResultSchema.parse(ambiguous.structuredContent);
    assert.equal(candidates.status, "ambiguous_work_requires_selection");
    assert.deepEqual(candidates.workCandidates.map(c => c.anidbId), [77, 1088]);
    assert.equal(candidates.characterSearch, null);
    assert.deepEqual(reads, [1725]);

    const unknown = await client.callTool({
      name: "find_character_by_anime_title",
      arguments: { animeTitle: "Unknown Work", characterName: "Carrera" }
    });
    assert.equal(titledCharacterSearchResultSchema.parse(unknown.structuredContent).status, "no_local_work_match");
    assert.deepEqual(reads, [1725]);

    const repeat = await client.callTool({
      name: "find_character_by_anime_title",
      arguments: { animeTitle: "VIPER_GTS", characterName: "Carrera" }
    });
    assert.equal(titledCharacterSearchResultSchema.parse(repeat.structuredContent).status, "unique_work_searched");
    assert.deepEqual(reads, [1725], "Cached source record avoids another live request");

    const invalid = await client.callTool({
      name: "find_character_by_anime_title",
      arguments: { animeTitle: "??", characterName: "Carrera" }
    });
    assert.equal(invalid.isError, true);
    assert.deepEqual(reads, [1725]);
  } finally {
    await client?.close(); await server?.close();
    globalThis.fetch = oldFetch;
    for (const key of keys) {
      if (before[key] === undefined) delete process.env[key]; else process.env[key] = before[key];
    }
    await fs.rm(dir, { recursive: true, force: true });
  }
});
