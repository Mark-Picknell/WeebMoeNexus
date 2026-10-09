import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { promises as fs } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { promisify } from "node:util";
import test from "node:test";
import { loadAniDbConfig, type AniDbConfig } from "../src/config.js";
import { MAX_ANIME_CACHE_BYTES } from "../src/providers/anidb/anime-cache.js";
import { ProviderLookupError } from "../src/domain/provider-error.js";
import { AnimeService } from "../src/services/anime-service.js";

const xml = '<anime id="15437"><titles><title type="main">Akudama Drive</title></titles><characters><character id="108685"><name>Isha</name><episodes>1-2</episodes></character></characters></anime>';
const base: AniDbConfig = { client: "weebmoenexus", clientVersion: 1,
  apiUrl: "http://api.anidb.net:9001/httpapi", minIntervalMs: 0, cacheTtlMs: 60_000 };

async function fixture(run: (config: AniDbConfig, directory: string) => Promise<void>) {
  const directory = await fs.mkdtemp(join(tmpdir(), "weeb-anime-cache-"));
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async () => new Response(xml);
  try { await run({ ...base, cacheDirectory: directory }, directory); }
  finally { globalThis.fetch = originalFetch; await fs.rm(directory, { recursive: true, force: true }); }
}

async function cacheFile(directory: string) {
  const scopes = await fs.readdir(directory);
  assert.equal(scopes.length, 1);
  return join(directory, scopes[0]!, "15437.json");
}

test("successful anime survives an actual process restart without fetch or changed provenance", async () => {
  await fixture(async (config, directory) => {
    const serviceUrl = new URL("../src/services/anime-service.ts", import.meta.url).href;
    const script = `import { AnimeService } from ${JSON.stringify(serviceUrl)};
      globalThis.fetch = async () => {
        if (process.argv[1] === 'cached') throw new Error('Unexpected network access');
        return new Response(${JSON.stringify(xml)});
      };
      console.log(JSON.stringify(await new AnimeService(${JSON.stringify(config)}).getByAniDbId(15437)));`;
    const execute = promisify(execFile);
    const args = ["--import", "tsx", "--input-type=module", "-e", script];
    const first = JSON.parse((await execute(process.execPath, [...args, "fresh"])).stdout);
    const second = JSON.parse((await execute(process.execPath, [...args, "cached"])).stdout);
    assert.deepEqual(second, first);
    assert.equal(second.characters[0].episodeAppearancesRaw, "1-2");
    const path = await cacheFile(directory);
    assert.deepEqual(await fs.readdir(join(path, "..")), ["15437.json"], "no temporary files remain");
    if (process.platform !== "win32") assert.equal((await fs.stat(path)).mode & 0o777, 0o600);
  });
});

test("restart neither renews TTL nor serves an expired record when refresh fails", async () => {
  await fixture(async config => {
    let now = 100_000;
    let calls = 0;
    globalThis.fetch = async () => { calls++; return new Response(xml); };
    await new AnimeService(config, { now: () => now }).getByAniDbId(15437);
    now += 59_999;
    const restarted = new AnimeService(config, { now: () => now });
    await restarted.getByAniDbId(15437);
    assert.equal(calls, 1);
    now++;
    globalThis.fetch = async () => { calls++; return new Response('<error>Client banned</error>'); };
    await assert.rejects(() => restarted.getByAniDbId(15437), ProviderLookupError);
    await assert.rejects(() => new AnimeService(config, { now: () => now }).getByAniDbId(15437), ProviderLookupError);
    assert.equal(calls, 3, "each explicit refresh makes one attempt; stale success is never returned");
  });
});

test("a shorter TTL expires persisted data while a longer TTL cannot extend it", async () => {
  await fixture(async config => {
    await new AnimeService(config, { now: () => 100_000 }).getByAniDbId(15437);
    let calls = 0;
    globalThis.fetch = async () => { calls++; return new Response('<error>No such anime</error>'); };
    await assert.rejects(() => new AnimeService({ ...config, cacheTtlMs: 20_000 }, { now: () => 120_000 }).getByAniDbId(15437));
    await assert.rejects(() => new AnimeService({ ...config, cacheTtlMs: 120_000 }, { now: () => 160_000 }).getByAniDbId(15437));
    assert.equal(calls, 2);
  });
});

test("corrupt, incompatible, wrong-identity and invalid-evidence cache files are misses", async () => {
  await fixture(async (config, directory) => {
    await new AnimeService(config, { now: () => 100_000 }).getByAniDbId(15437);
    const path = await cacheFile(directory);
    const saved = JSON.parse(await fs.readFile(path, "utf8"));
    const changed = (edit: (entry: any) => void) => {
      const entry = structuredClone(saved); edit(entry); return JSON.stringify(entry);
    };
    const invalid = ["{truncated", changed(e => e.version = 999), changed(e => e.scope = "other"),
      changed(e => e.value.id = 99), changed(e => delete e.value.characters),
      changed(e => e.value.provenance = []), changed(e => e.value.provenance[0].providerId = "99"),
      changed(e => e.value.provenance[0].sourceUrl = "https://example.test/wrong"),
      changed(e => e.value.provenance[0].retrievedAt = "invalid"),
      changed(e => e.cachedAt = 200_000), changed(e => e.expiresAt = e.cachedAt)];
    let calls = 0;
    globalThis.fetch = async () => { calls++; return new Response(xml); };
    for (const body of invalid) {
      await fs.writeFile(path, body);
      assert.equal((await new AnimeService(config, { now: () => 100_001 }).getByAniDbId(15437)).id, 15437);
    }
    assert.equal(calls, invalid.length);
    assert.deepEqual(await fs.readdir(join(path, "..")), ["15437.json"]);
  });
});

test("oversized disk data is rejected before parsing and replaced by a validated result", async () => {
  await fixture(async (config, directory) => {
    await new AnimeService(config).getByAniDbId(15437);
    const path = await cacheFile(directory);
    await fs.truncate(path, MAX_ANIME_CACHE_BYTES + 1);
    let calls = 0;
    globalThis.fetch = async () => { calls++; return new Response(xml); };
    await new AnimeService(config).getByAniDbId(15437);
    assert.equal(calls, 1);
    assert.ok((await fs.stat(path)).size < MAX_ANIME_CACHE_BYTES);
  });
});

test("provider endpoint and client identity/version use separate cache scopes", async () => {
  await fixture(async config => {
    await new AnimeService(config).getByAniDbId(15437);
    let calls = 0;
    globalThis.fetch = async () => { calls++; return new Response(xml); };
    for (const override of [{ apiUrl: "https://example.test/anidb" }, { client: "another-client" }, { clientVersion: 2 }]) {
      await new AnimeService({ ...config, ...override }).getByAniDbId(15437);
    }
    assert.equal(calls, 3);
  });
});

test("disk write failure keeps the validated in-memory result and sanitized diagnostic", async () => {
  await fixture(async (config, directory) => {
    const blocker = join(directory, "private-path-blocker");
    await fs.writeFile(blocker, "not a directory");
    const originalWarn = console.warn;
    const warnings: string[] = [];
    console.warn = message => warnings.push(String(message));
    try {
      let calls = 0;
      globalThis.fetch = async () => { calls++; return new Response(xml); };
      const service = new AnimeService({ ...config, cacheDirectory: blocker });
      const first = await service.getByAniDbId(15437);
      assert.strictEqual(await service.getByAniDbId(15437), first);
      assert.equal(calls, 1);
      assert.equal(warnings.length, 1);
      assert.equal(warnings[0]!.includes(directory), false);
      assert.equal(warnings[0]!.includes("private"), false);
      assert.equal(await fs.readFile(blocker, "utf8"), "not a directory");
    } finally { console.warn = originalWarn; }
  });
});

test("failed and mismatched source responses never create persistent success entries", async () => {
  await fixture(async (config, directory) => {
    for (const body of ['<error>No such anime</error>', '<error>Client banned</error>', '<anime id="99"/>', '<anime id="15437">']) {
      globalThis.fetch = async () => new Response(body);
      await assert.rejects(() => new AnimeService(config).getByAniDbId(15437), ProviderLookupError);
      assert.deepEqual(await fs.readdir(directory), []);
    }
  });
});

test("failed atomic replacement preserves the previous file and cleans temporary data", async () => {
  await fixture(async (config, directory) => {
    await new AnimeService(config, { now: () => 100_000 }).getByAniDbId(15437);
    const path = await cacheFile(directory);
    const originalBody = await fs.readFile(path, "utf8");
    const originalRename = fs.rename;
    const originalWarn = console.warn;
    fs.rename = async () => { throw new Error("Synthetic rename failure"); };
    console.warn = () => {};
    try {
      const newerXml = xml.replace("Akudama Drive", "New synthetic title");
      globalThis.fetch = async () => new Response(newerXml);
      const service = new AnimeService(config, { now: () => 160_000 });
      assert.equal((await service.getByAniDbId(15437)).preferredTitle, "New synthetic title");
      assert.equal((await service.getByAniDbId(15437)).preferredTitle, "New synthetic title");
      assert.equal(await fs.readFile(path, "utf8"), originalBody);
      assert.deepEqual(await fs.readdir(join(path, "..")), ["15437.json"]);
    } finally { fs.rename = originalRename; console.warn = originalWarn; }
  });
});

test("a shared failed read is evicted so a later explicit call can succeed", async () => {
  await fixture(async config => {
    let calls = 0;
    globalThis.fetch = async () => { calls++; return new Response('<error>Client banned</error>'); };
    const service = new AnimeService(config);
    const results = await Promise.allSettled([service.getByAniDbId(15437), service.getByAniDbId(15437)]);
    assert.ok(results.every(result => result.status === "rejected" && result.reason instanceof ProviderLookupError));
    assert.equal(calls, 1);
    globalThis.fetch = async () => { calls++; return new Response(xml); };
    assert.equal((await service.getByAniDbId(15437)).id, 15437);
    assert.equal(calls, 2, "this is a new explicit call, not an automatic retry");
  });
});

test("concurrent requests for one uncached ID share one upstream read and persistence", async () => {
  await fixture(async (config, directory) => {
    let calls = 0;
    globalThis.fetch = async () => { calls++; return new Response(xml); };
    const service = new AnimeService(config);
    const results = await Promise.all(Array.from({ length: 8 }, () => service.getByAniDbId(15437)));
    assert.equal(calls, 1);
    results.forEach(result => assert.strictEqual(result, results[0]));
    await cacheFile(directory);
  });
});

test("application defaults enable persistence and explicit empty configuration disables it", async () => {
  const prior = process.env.ANIDB_ANIME_CACHE_DIR;
  try {
    delete process.env.ANIDB_ANIME_CACHE_DIR;
    assert.equal(loadAniDbConfig().cacheDirectory, ".cache/anidb/anime");
    process.env.ANIDB_ANIME_CACHE_DIR = "";
    assert.equal(loadAniDbConfig().cacheDirectory, "");
    await fixture(async config => {
      let calls = 0;
      globalThis.fetch = async () => { calls++; return new Response(xml); };
      await new AnimeService({ ...config, cacheDirectory: "" }).getByAniDbId(15437);
      await new AnimeService({ ...config, cacheDirectory: "" }).getByAniDbId(15437);
      assert.equal(calls, 2);
      assert.deepEqual(await fs.readdir(config.cacheDirectory!), []);
    });
  } finally {
    if (prior === undefined) delete process.env.ANIDB_ANIME_CACHE_DIR;
    else process.env.ANIDB_ANIME_CACHE_DIR = prior;
  }
});
