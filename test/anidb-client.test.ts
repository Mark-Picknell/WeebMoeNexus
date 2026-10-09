import assert from "node:assert/strict";
import test from "node:test";
import type { AniDbConfig } from "../src/config.js";
import { AnimeService } from "../src/services/anime-service.js";
import { AniDbClient, AniDbConfigurationError, AniDbUpstreamError } from "../src/providers/anidb/client.js";

const config: AniDbConfig = {
  client: "weebmoenexus",
  clientVersion: 1,
  apiUrl: "http://api.anidb.net:9001/httpapi",
  minIntervalMs: 2000,
  cacheTtlMs: 72 * 60 * 60 * 1000
};

const fixture = `<?xml version="1.0" encoding="UTF-8"?>
<anime id="15437" restricted="0">
  <titles>
    <title xml:lang="x-jat" type="main">Akudama Drive</title>
    <title xml:lang="en" type="official">Akudama Drive</title>
  </titles>
  <type>TV Series</type>
  <episodecount>12</episodecount>
  <characters>
    <character id="108685" type="main character in">
      <name>Isha</name>
      <gender>female</gender>
    </character>
  </characters>
</anime>`;

test("AniDB client sends registered identification and service caches normalized results", async () => {
  const originalFetch = globalThis.fetch;
  const seen: URL[] = [];

  globalThis.fetch = async (input) => {
    seen.push(new URL(String(input)));
    return new Response(fixture, { status: 200, headers: { "Content-Type": "text/xml" } });
  };

  try {
    const service = new AnimeService(config);
    const first = await service.getByAniDbId(15437);
    const second = await service.getByAniDbId(15437);

    assert.equal(seen.length, 1, "the second query must hit the cache");
    const query = seen[0]!.searchParams;
    assert.equal(query.get("request"), "anime");
    assert.equal(query.get("client"), "weebmoenexus");
    assert.equal(query.get("clientver"), "1");
    assert.equal(query.get("protover"), "1");
    assert.equal(query.get("aid"), "15437");

    assert.strictEqual(first, second);
    assert.equal(first.id, 15437);
    assert.equal(first.preferredTitle, "Akudama Drive");
    assert.equal(first.characters[0]?.id, 108685);
    assert.equal(first.provenance[0]?.provider, "anidb");
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("AniDB client rejects missing registration before making HTTP requests", async () => {
  const client = new AniDbClient({ ...config, client: "" });
  await assert.rejects(() => client.getAnimeXml(15437), AniDbConfigurationError);
});

test("AniDB client does not retry a client-ban response", async () => {
  const originalFetch = globalThis.fetch;
  let calls = 0;

  globalThis.fetch = async () => {
    calls++;
    return new Response("<error>client banned</error>", { status: 200 });
  };

  try {
    const client = new AniDbClient(config);
    await assert.rejects(() => client.getAnimeXml(15437), AniDbUpstreamError);
    assert.equal(calls, 1);
  } finally {
    globalThis.fetch = originalFetch;
  }
});
