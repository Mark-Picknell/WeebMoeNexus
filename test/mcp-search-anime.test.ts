import assert from "node:assert/strict";
import { promises as fs } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { gzipSync } from "node:zlib";
import { Client, InMemoryTransport } from "@modelcontextprotocol/client";
import { buildServer } from "../src/server.js";

const fixture = gzipSync(`<animetitles>
<anime aid="77">
<title type="main" xml:lang="x-jat">Choujikuu Yousai Macross</title>
<title type="official" xml:lang="en">The Super Dimension Fortress Macross</title>
<title type="syn" xml:lang="en">Macross</title>
</anime>
<anime aid="1088">
<title type="main" xml:lang="x-jat">Macross</title>
</anime>
</animetitles>`);

test("real MCP tool registration and invocation work against only a local cached dump", async () => {
  const folder = await fs.mkdtemp(join(tmpdir(), "weeb-mcp-title-"));
  const cachePath = join(folder, "titles.xml.gz");
  await fs.writeFile(cachePath, fixture);
  const prior = process.env.ANIDB_TITLE_DUMP_CACHE_PATH;
  process.env.ANIDB_TITLE_DUMP_CACHE_PATH = cachePath;

  const server = buildServer();
  const client = new Client({ name: "offline-title-test", version: "1.0.0" });
  const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
  try {
    await server.connect(serverTransport);
    await client.connect(clientTransport);

    const available = await client.listTools();
    assert.ok(available.tools.some(t => t.name === "search_anime"));
    assert.ok(available.tools.some(t => t.name === "get_anime_by_anidb_id"));

    const found = await client.callTool({
      name: "search_anime", arguments: { query: "Macross", limit: 1 }
    });
    assert.notEqual(found.isError, true);
    const structured = found.structuredContent as {
      query: string;
      totalMatches: number;
      results: Array<{
        anidbId: number;
        matchedTitle: string;
        matchedKind: string;
        matchType: string;
        sourceUrl: string;
      }>;
    };
    assert.equal(structured.query, "Macross");
    assert.equal(structured.totalMatches, 2);
    assert.equal(structured.results.length, 1);
    assert.equal(structured.results[0]?.anidbId, 77);
    assert.equal(structured.results[0]?.matchedTitle, "Macross");
    assert.equal(structured.results[0]?.matchedKind, "syn");
    assert.equal(structured.results[0]?.matchType, "exact");
    assert.equal(structured.results[0]?.sourceUrl, "https://anidb.net/anime/77");

    const absent = await client.callTool({
      name: "search_anime", arguments: { query: "Carrera" }
    });
    assert.deepEqual(absent.structuredContent, {
      query: "Carrera", totalMatches: 0, results: []
    });

    const invalid = await client.callTool({
      name: "search_anime", arguments: { query: "Macross", limit: 50 }
    });
    assert.equal(invalid.isError, true);
  } finally {
    await client.close();
    await server.close();
    if (prior === undefined) delete process.env.ANIDB_TITLE_DUMP_CACHE_PATH;
    else process.env.ANIDB_TITLE_DUMP_CACHE_PATH = prior;
    await fs.rm(folder, { force: true, recursive: true });
  }
});
