import assert from "node:assert/strict";
import test from "node:test";
import { RateGate, RateGateCapacityError } from "../src/infrastructure/rate-gate.js";
import { AniDbClient, ANIDB_BACKOFF_MS, ANIDB_RESPONSE_MAX_BYTES } from "../src/providers/anidb/client.js";
import { ProviderLookupError } from "../src/domain/provider-error.js";
import { AnimeService } from "../src/services/anime-service.js";

const config = { client: "synthetic-client", clientVersion: 1, apiUrl: "https://example.test/anidb", minIntervalMs: 0, cacheTtlMs: 60_000 };

test("AniDB ban and 429 pause new and already queued reads without automatic retries", async () => {
  const original = globalThis.fetch;
  try {
    for (const response of [() => new Response('<error>Client banned</error>'), () => new Response("limited", { status: 429 })]) {
      let calls = 0, now = 1_000_000;
      globalThis.fetch = async () => { calls++; return response(); };
      const client = new AniDbClient(config, () => now);
      const results = await Promise.allSettled([client.getAnimeXml(1), client.getAnimeXml(2)]);
      assert.equal(results[0]!.status, "rejected");
      assert.equal(results[1]!.status, "rejected");
      if (results[1]!.status === "rejected") assert.equal(results[1]!.reason.details.reason, "local_backoff");
      await assert.rejects(() => client.getAnimeXml(3), (e: unknown) => e instanceof ProviderLookupError && e.details.reason === "local_backoff");
      assert.equal(calls, 1);
      now += ANIDB_BACKOFF_MS;
      globalThis.fetch = async () => { calls++; return new Response('<anime id="3"/>'); };
      assert.equal(await client.getAnimeXml(3), '<anime id="3"/>'); assert.equal(calls, 2);
    }
  } finally { globalThis.fetch = original; }
});

test("AniDB response transfer is bounded even when the declared length is missing or false", async () => {
  const original = globalThis.fetch;
  try {
    for (const declaredLength of [undefined, "1", String(ANIDB_RESPONSE_MAX_BYTES + 1)]) {
      let cancelled = false;
      globalThis.fetch = async () => new Response(new ReadableStream<Uint8Array>({
        start(controller) { controller.enqueue(new Uint8Array(ANIDB_RESPONSE_MAX_BYTES)); controller.enqueue(new Uint8Array(1)); },
        cancel() { cancelled = true; }
      }), { headers: declaredLength ? { "content-length": declaredLength } : {} });
      await assert.rejects(() => new AniDbClient(config).getAnimeXml(1), (e: unknown) => e instanceof ProviderLookupError && e.details.reason === "invalid_response");
      assert.equal(cancelled, true);
    }
  } finally { globalThis.fetch = original; }
});

test("bounded rate gate rejects excess work and releases capacity after an operation fails", async () => {
  const gate = new RateGate(0, 2);
  let release!: () => void;
  const blocked = new Promise<void>(resolve => release = resolve);
  const first = gate.run(async () => { await blocked; throw new Error("synthetic failure"); });
  const failure = assert.rejects(first);
  const second = gate.run(async () => 2);
  await assert.rejects(() => gate.run(async () => 3), RateGateCapacityError);
  release(); await failure; assert.equal(await second, 2);
  assert.equal(await gate.run(async () => 4), 4);
});

test("memory successes have a bounded record count without extending cache lifetime", async () => {
  const original = globalThis.fetch;
  let calls = 0;
  globalThis.fetch = async request => { calls++; return new Response(`<anime id="${new URL(String(request)).searchParams.get("aid")}"/>`); };
  try {
    const service = new AnimeService(config);
    for (let id = 1; id <= 257; id++) await service.getByAniDbId(id);
    await service.getByAniDbId(257); assert.equal(calls, 257);
    await service.getByAniDbId(1); assert.equal(calls, 258, "oldest memory record was evicted");
  } finally { globalThis.fetch = original; }
});

test("large normalized records evict by serialized byte budget before the count limit", async () => {
  const original = globalThis.fetch;
  let calls = 0;
  globalThis.fetch = async request => { calls++; return new Response(`<anime id="${new URL(String(request)).searchParams.get("aid")}"><description>${"x".repeat(1_000_000)}</description></anime>`); };
  try {
    const service = new AnimeService(config);
    for (let id = 1; id <= 18; id++) await service.getByAniDbId(id);
    await service.getByAniDbId(18); assert.equal(calls, 18);
    await service.getByAniDbId(1); assert.equal(calls, 19, "serialized byte budget evicted the oldest record");
  } finally { globalThis.fetch = original; }
});
