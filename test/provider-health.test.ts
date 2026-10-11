import assert from "node:assert/strict";
import { promises as fs } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import type { AniDbConfig } from "../src/config.js";
import { ProviderLookupError } from "../src/domain/provider-error.js";
import { OBSERVATION_STALE_AFTER_MS, ProviderOperationHealthTracker, providerOperationHealthSchema } from "../src/domain/provider-health.js";
import { AnimeService } from "../src/services/anime-service.js";

// All responses/configuration/clock values are synthetic; no live probes.
const base: AniDbConfig = { client: "synthetic-client", clientVersion: 1, apiUrl: "https://example.test/anidb", minIntervalMs: 0, cacheTtlMs: 3_600_000 };
const xml = '<anime id="11"><titles><title type="main">Synthetic Work</title></titles></anime>';

test("health inspection is unobserved before HTTP reads and performs no probes", () => {
  const original = globalThis.fetch;
  let calls = 0;
  globalThis.fetch = () => { calls++; throw new Error("Probe forbidden"); };
  try {
    const service = new AnimeService(base);
    const health = service.getProviderHealth();
    assert.equal(health.configuration, "ready");
    assert.equal(health.freshness, "unobserved");
    assert.equal(health.observation, null);
    assert.equal(health.ageMs, null);
    assert.equal(health.activeProbe, false);
    assert.equal(calls, 0);
  } finally { globalThis.fetch = original; }
});

test("configuration preflight matches read behavior without exposing private values", async () => {
  const original = globalThis.fetch;
  let calls = 0;
  globalThis.fetch = () => { calls++; throw new Error("No request expected"); };
  try {
    for (const override of [{ client: "" }, { apiUrl: "file:///private-secret" }, { apiUrl: "https://private-user:private-password@example.test" }, { clientVersion: 0 }, { apiUrl: "private-broken-url" }]) {
      const service = new AnimeService({ ...base, ...override });
      const expected = "client" in override ? "not_configured" : "invalid_configuration";
      assert.equal(service.getProviderHealth().configuration, expected);
      await assert.rejects(() => service.getByAniDbId(11), ProviderLookupError);
      const observed = service.getProviderHealth().observation!;
      assert.equal(observed.outcome, "failed");
      assert.equal(observed.networkAttempted, "no");
      assert.equal(JSON.stringify(service.getProviderHealth()).includes("private"), false);
      assert.equal(JSON.stringify(service.getProviderHealth()).includes("synthetic-client"), false);
    }
    assert.equal(calls, 0);
  } finally { globalThis.fetch = original; }
});

test("validated HTTP success ages naturally; cache reads cannot renew it", async () => {
  const original = globalThis.fetch;
  let now = 1_000_000, calls = 0;
  globalThis.fetch = async () => { calls++; return new Response(xml); };
  try {
    const service = new AnimeService(base, { now: () => now });
    await service.getByAniDbId(11);
    const first = service.getProviderHealth();
    assert.equal(first.observation!.outcome, "validated_success");
    assert.equal(first.ageMs, 0);
    now += OBSERVATION_STALE_AFTER_MS - 1;
    await service.getByAniDbId(11);
    assert.equal(service.getProviderHealth().freshness, "recent");
    now++;
    assert.equal(service.getProviderHealth().freshness, "stale");
    assert.deepEqual(service.getProviderHealth().observation, first.observation);
    assert.equal(calls, 1);
  } finally { globalThis.fetch = original; }
});

test("a ban or HTTP failure remains visible while an older cached anime is served", async () => {
  const original = globalThis.fetch;
  let now = 1_000_000, calls = 0;
  globalThis.fetch = async () => { calls++; return calls === 1 ? new Response(xml) : new Response('<error>Client banned</error>'); };
  try {
    const service = new AnimeService(base, { now: () => now });
    await service.getByAniDbId(11);
    now += 100;
    await assert.rejects(() => service.getByAniDbId(12), ProviderLookupError);
    const failure = service.getProviderHealth().observation!;
    assert.equal(failure.outcome, "failed");
    if (failure.outcome === "failed") assert.equal(failure.error.code, "banned");
    now += 100;
    assert.equal((await service.getByAniDbId(11)).id, 11);
    assert.deepEqual(service.getProviderHealth().observation, failure);
    assert.equal(calls, 2);
    globalThis.fetch = async () => { calls++; return new Response(xml.replace('id="11"', 'id="13"')); };
    await assert.rejects(() => service.getByAniDbId(13), (error: unknown) => error instanceof ProviderLookupError && error.details.reason === "local_backoff");
    assert.equal(service.getProviderHealth().observation!.networkAttempted, "no");
    assert.equal(calls, 2);
    now += 5 * 60_000;
    await service.getByAniDbId(13);
    assert.equal(service.getProviderHealth().observation!.outcome, "validated_success");
    assert.equal(calls, 3, "recovery is a later explicit read, not a health probe or retry");
  } finally { globalThis.fetch = original; }
});

test("disk-cache hits after restart leave HTTP health unobserved", async () => {
  const directory = await fs.mkdtemp(join(tmpdir(), "weeb-health-cache-"));
  const original = globalThis.fetch;
  globalThis.fetch = async () => new Response(xml);
  try {
    const config = { ...base, cacheDirectory: directory };
    await new AnimeService(config).getByAniDbId(11);
    globalThis.fetch = () => { throw new Error("Unexpected read on restart"); };
    const restarted = new AnimeService(config);
    assert.equal((await restarted.getByAniDbId(11)).id, 11);
    assert.equal(restarted.getProviderHealth().freshness, "unobserved");
    assert.equal(restarted.getProviderHealth().observation, null);
  } finally { globalThis.fetch = original; await fs.rm(directory, { recursive: true, force: true }); }
});

test("lookup not-found is a scoped failed operation, not a global provider outage claim", async () => {
  const original = globalThis.fetch;
  globalThis.fetch = async () => new Response('<error code="9999">No such anime</error>');
  try {
    const service = new AnimeService(base);
    await assert.rejects(() => service.getByAniDbId(11), ProviderLookupError);
    const health = service.getProviderHealth();
    assert.equal(health.scope, "anime_http_reads");
    const observation = health.observation!;
    assert.equal(observation.outcome, "failed");
    if (observation.outcome === "failed") {
      assert.equal(observation.error.code, "not_found");
      assert.equal(observation.error.httpStatus, 200);
      assert.equal(observation.error.apiCode, 9999);
    }
    assert.equal("healthy" in health, false);
  } finally { globalThis.fetch = original; }
});

test("invalid normalized HTTP data records validation failure rather than a success", async () => {
  const original = globalThis.fetch;
  globalThis.fetch = async () => new Response('<anime id="99"/>');
  try {
    const service = new AnimeService(base);
    await assert.rejects(() => service.getByAniDbId(11), ProviderLookupError);
    const observation = service.getProviderHealth().observation!;
    assert.equal(observation.outcome, "failed");
    if (observation.outcome === "failed") assert.equal(observation.error.reason, "invalid_response");
  } finally { globalThis.fetch = original; }
});

test("health strips arbitrary error messages and caller mutations cannot rewrite history", () => {
  const tracker = new ProviderOperationHealthTracker(() => 1_000_000);
  tracker.recordFailure(new Error("private-token private-URL private-path"));
  assert.equal(JSON.stringify(tracker.snapshot("ready")).includes("private"), false);
  tracker.recordFailure(new ProviderLookupError({ code: "unavailable", reason: "http_error", message: "private-custom-message", httpStatus: 503, apiCode: null }));
  const snapshot = tracker.snapshot("ready");
  assert.equal(JSON.stringify(snapshot).includes("private"), false);
  if (snapshot.observation?.outcome === "failed") snapshot.observation.error.code = "banned";
  const next = tracker.snapshot("ready");
  if (next.observation?.outcome === "failed") assert.equal(next.observation.error.code, "unavailable");
  else assert.fail("Expected failure observation");
});

test("clock reversal is explicit uncertainty; inconsistent freshness schemas reject", () => {
  let now = 1_000_000;
  const tracker = new ProviderOperationHealthTracker(() => now);
  tracker.recordSuccess(); now--;
  const health = tracker.snapshot("ready");
  assert.equal(health.freshness, "clock_uncertain");
  assert.equal(health.ageMs, null);
  assert.equal(providerOperationHealthSchema.safeParse({ ...health, ageMs: 0 }).success, false);
  assert.equal(providerOperationHealthSchema.safeParse({ ...health, observation: null, freshness: "recent" }).success, false);
});

test("malformed diagnostics cannot make the health observer overwrite a lookup error", () => {
  const tracker = new ProviderOperationHealthTracker(() => 1_000_000);
  const error = new ProviderLookupError({ code: "unavailable", reason: "http_error", message: "private-original-message", httpStatus: 0, apiCode: null });
  assert.doesNotThrow(() => tracker.recordFailure(error));
  const observation = tracker.snapshot("ready").observation!;
  assert.equal(observation.outcome, "failed");
  assert.equal(observation.networkAttempted, "unknown");
  if (observation.outcome === "failed") assert.equal(observation.error.code, "unknown");
  assert.equal(JSON.stringify(observation).includes("private"), false);
});
