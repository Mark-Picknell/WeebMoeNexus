import assert from "node:assert/strict";
import { promises as fs } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { gzipSync } from "node:zlib";
import {
  ANIDB_TITLE_DUMP_URL,
  AniDbTitleDumpCache,
  InvalidTitleDumpError,
  MIN_TITLE_DUMP_REFRESH_MS,
  validateTitleGzip
} from "../src/providers/anidb/title-dump.js";

const fixture = gzipSync(`<?xml version="1.0" encoding="UTF-8"?>
<animetitles><anime aid="77">
<title type="main" xml:lang="x-jat">Choujikuu Yousai Macross</title>
<title type="official" xml:lang="ja">超時空要塞マクロス</title>
</anime></animetitles>`);

async function withDirectory(run: (path: string) => Promise<void>) {
  const folder = await fs.mkdtemp(join(tmpdir(), "weeb-titles-"));
  try {
    await run(join(folder, "nested", "anime-titles.xml.gz"));
  } finally {
    await fs.rm(folder, { force: true, recursive: true });
  }
}

test("first read downloads official HTTPS dump and reuses persisted file", async () => {
  await withDirectory(async path => {
    let fetches = 0;
    const cache = new AniDbTitleDumpCache({
      path,
      fetcher: async (url, init) => {
        fetches++;
        assert.equal(url, ANIDB_TITLE_DUMP_URL);
        assert.equal(init.redirect, "error");
        return new Response(fixture, { status: 200 });
      }
    });
    const first = await cache.get();
    assert.deepEqual(
      { source: first.source, stale: first.stale },
      { source: "download", stale: false }
    );
    assert.deepEqual(await fs.readFile(path), fixture);
    const second = await new AniDbTitleDumpCache({
      path,
      fetcher: async () => { throw new Error("cache should avoid fetch"); }
    }).get();
    assert.equal(second.source, "cache");
    assert.equal(second.stale, false);
    assert.equal(fetches, 1);
  });
});

test("a stale verified copy survives upstream errors without additional retry", async () => {
  await withDirectory(async path => {
    await fs.mkdir(join(path, ".."), { recursive: true });
    await fs.writeFile(path, fixture);
    const old = new Date(Date.now() - (MIN_TITLE_DUMP_REFRESH_MS + 60_000));
    await fs.utimes(path, old, old);
    let fetches = 0;
    const cache = new AniDbTitleDumpCache({
      path,
      refreshIntervalMs: MIN_TITLE_DUMP_REFRESH_MS,
      fetcher: async () => {
        fetches++;
        return new Response("server unavailable", { status: 503 });
      }
    });
    const result = await cache.get();
    assert.equal(result.source, "cache");
    assert.equal(result.stale, true);
    assert.equal(fetches, 1, "never retry after an upstream failure");
    assert.deepEqual(await fs.readFile(path), fixture);
  });
});

test("invalid downloaded content cannot overwrite the last known good dump", async () => {
  await withDirectory(async path => {
    await fs.mkdir(join(path, ".."), { recursive: true });
    await fs.writeFile(path, fixture);
    const old = new Date(Date.now() - 72 * 60 * 60 * 1000);
    await fs.utimes(path, old, old);
    const cache = new AniDbTitleDumpCache({
      path,
      fetcher: async () =>
        new Response(gzipSync("<html>Not an AniDB dump</html>"), { status: 200 })
    });
    const result = await cache.get();
    assert.equal(result.stale, true);
    assert.deepEqual(await fs.readFile(path), fixture);
    const files = await fs.readdir(join(path, ".."));
    assert.deepEqual(files, ["anime-titles.xml.gz"], "no partial download artifacts");
  });
});

test("unusable first download fails clearly and never creates a poisoned cache", async () => {
  await withDirectory(async path => {
    const cache = new AniDbTitleDumpCache({
      path,
      fetcher: async () => new Response("<html>Cloudflare</html>", { status: 200 })
    });
    await assert.rejects(() => cache.get(), InvalidTitleDumpError);
    await assert.rejects(() => fs.stat(path), { code: "ENOENT" });
  });
});

test("concurrent requests coalesce into a single network transfer", async () => {
  await withDirectory(async path => {
    let calls = 0;
    const cache = new AniDbTitleDumpCache({
      path,
      fetcher: async () => {
        calls++;
        await new Promise(resolve => setTimeout(resolve, 5));
        return new Response(fixture);
      }
    });
    const [a, b, c] = await Promise.all([cache.get(), cache.get(), cache.get()]);
    assert.equal(calls, 1);
    assert.equal(a.path, b.path);
    assert.equal(b.path, c.path);
  });
});

test("refresh interval cannot be shortened below respectful minimum", async () => {
  await withDirectory(async path => {
    await fs.mkdir(join(path, ".."), { recursive: true });
    await fs.writeFile(path, fixture);
    const age = MIN_TITLE_DUMP_REFRESH_MS / 2;
    const old = new Date(Date.now() - age);
    await fs.utimes(path, old, old);
    const cache = new AniDbTitleDumpCache({
      path,
      refreshIntervalMs: 1,
      fetcher: async () => { throw new Error("refreshed too soon"); }
    });
    const result = await cache.get();
    assert.equal(result.stale, false);
    assert.equal(result.source, "cache");
  });
});

test("gzip validator rejects corrupt archives and non-index XML", () => {
  assert.doesNotThrow(() => validateTitleGzip(fixture));
  assert.throws(() => validateTitleGzip(Buffer.from("bad")), InvalidTitleDumpError);
  assert.throws(
    () => validateTitleGzip(gzipSync("<error>not available</error>")),
    InvalidTitleDumpError
  );
});
