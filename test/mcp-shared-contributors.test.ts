import assert from "node:assert/strict";
import test from "node:test";
import { Client, InMemoryTransport } from "@modelcontextprotocol/client";
import { sharedContributorResultSchema } from "../src/domain/shared-contributors.js";
import { providerErrorSchema } from "../src/domain/provider-error.js";

test("MCP shared contributor joins stable source IDs and preserves voice and production credit paths", async () => {
  const configKeys = ["ANIDB_CLIENT", "ANIDB_ANIME_CACHE_DIR"] as const;
  const saved = Object.fromEntries(configKeys.map(key => [key, process.env[key]]));
  const previousFetch = globalThis.fetch;
  process.env.ANIDB_CLIENT = "weebmoenexus";
  process.env.ANIDB_ANIME_CACHE_DIR = "";
  const reads: number[] = [];
  const bodies = new Map<number, string>([
    [101, `<anime id="101"><titles><title type="main">Source A</title></titles>
      <creators><name id="50" type="Direction">Shared Artist</name>
        <name id="51" type="Production">Same Name</name>
        <name type="Writing">No ID</name></creators>
      <characters><character id="1001"><name>Hero</name><seiyuu id="50">Shared Artist</seiyuu></character></characters>
    </anime>`],
    [102, `<anime id="102"><titles><title type="main">Source B</title></titles>
      <creators><name id="50" type="Music">Alternate Display</name>
        <name id="52" type="Production">Same Name</name></creators>
      <characters><character id="1002"><name>Other Hero</name><seiyuu id="60">Other Actor</seiyuu></character></characters>
    </anime>`],
    [103, "<error>Client banned</error>"]
  ]);
  globalThis.fetch = async req => {
    const id = Number(new URL(String(req)).searchParams.get("aid"));
    reads.push(id);
    const xml = bodies.get(id);
    assert.ok(xml, `Unexpected selected work ${id}`);
    return new Response(xml);
  };
  let client: Client | null = null;
  let server: ReturnType<(typeof import("../src/server.js"))["buildServer"]> | null = null;
  try {
    const { buildServer } = await import("../src/server.js");
    server = buildServer();
    client = new Client({ name: "offline-shared-contributors", version: "1" });
    const [ct, st] = InMemoryTransport.createLinkedPair();
    await server.connect(st); await client.connect(ct);
    const tool = (await client.listTools()).tools.find(t => t.name === "find_shared_contributors");
    assert.ok(tool);
    assert.equal(tool.annotations?.readOnlyHint, true);

    const result = await client.callTool({
      name: "find_shared_contributors", arguments: { anidbIds: [101, 102] }
    });
    assert.notEqual(result.isError, true);
    const value = sharedContributorResultSchema.parse(result.structuredContent);
    assert.equal(value.sharedContributorCount, 1);
    assert.equal(value.distinctNamedIdCollisionCount, 1);
    assert.equal(value.unresolvedIdCreditRows, 1);
    assert.equal(value.results[0]!.anidbContributorId, 50);
    assert.equal(value.results[0]!.sourceWorkCount, 2);
    assert.equal(value.results[0]!.nameVariance, "different_reported_names");
    assert.equal(value.results[0]!.credits.length, 3);
    assert.equal(value.results[0]!.credits.find(c => c.type === "voice")?.characterId, 1001);
    assert.equal(value.results[0]!.credits.find(c => c.type === "voice")?.sourceField, "characters[0].voiceActor");
    assert.deepEqual(reads, [101, 102]);

    const again = await client.callTool({
      name: "find_shared_contributors", arguments: { anidbIds: [102, 101] }
    });
    assert.equal(sharedContributorResultSchema.parse(again.structuredContent).sharedContributorCount, 1);
    assert.deepEqual(reads, [101, 102], "Source cache must prevent new source requests");

    const rejected = await client.callTool({
      name: "find_shared_contributors", arguments: { anidbIds: [101, 101] }
    });
    assert.equal(rejected.isError, true);
    assert.deepEqual(reads, [101, 102]);

    const blocked = await client.callTool({
      name: "find_shared_contributors", arguments: { anidbIds: [103, 104] }
    });
    assert.equal(blocked.isError, true);
    assert.equal(providerErrorSchema.parse(blocked.structuredContent?.error).code, "banned");
    assert.deepEqual(reads, [101, 102, 103], "A provider failure stops later work lookups");
  } finally {
    await client?.close();
    await server?.close();
    globalThis.fetch = previousFetch;
    for (const key of configKeys) {
      if (saved[key] === undefined) delete process.env[key]; else process.env[key] = saved[key];
    }
  }
});
