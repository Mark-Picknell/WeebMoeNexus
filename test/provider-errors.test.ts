import assert from "node:assert/strict";
import test from "node:test";
import type { AniDbConfig } from "../src/config.js";
import { ProviderLookupError, providerErrorSchema } from "../src/domain/provider-error.js";
import { AniDbClient, AniDbConfigurationError, AniDbUpstreamError } from "../src/providers/anidb/client.js";
import { AnimeService } from "../src/services/anime-service.js";
import { traverseAnimeRelations } from "../src/services/relation-graph-service.js";
import { mapAniDbAnimeXml } from "../src/providers/anidb/mapper.js";

// Zero pacing is solely for fake fetches in this file; no live AniDB calls.
const config: AniDbConfig = {
  client: "weebmoenexus", clientVersion: 1,
  apiUrl: "http://api.anidb.net:9001/httpapi", minIntervalMs: 0, cacheTtlMs: 60_000
};

async function capture(operation: () => Promise<unknown>): Promise<ProviderLookupError> {
  try { await operation(); } catch (error) {
    assert.ok(error instanceof ProviderLookupError);
    assert.ok(providerErrorSchema.safeParse(error.details).success);
    return error;
  }
  throw new Error("Expected provider failure");
}

test("missing or malformed configuration fails before fetch and preserves compatibility classes", async () => {
  const originalFetch = globalThis.fetch;
  let calls = 0;
  globalThis.fetch = async () => { calls++; throw new Error("Unexpected fetch"); };
  try {
    for (const override of [
      { client: " " }, { clientVersion: 0 }, { clientVersion: 1.5 },
      { apiUrl: "invalid URL with private material" }, { apiUrl: "file:///private" },
      { apiUrl: "http://name:private-password@example.test" }
    ]) {
      const failure = await capture(() => new AniDbClient({ ...config, ...override }).getAnimeXml(1));
      assert.ok(failure instanceof AniDbConfigurationError);
      assert.equal(failure.details.code, "misconfigured");
      assert.equal(failure.details.httpStatus, null);
      assert.equal(JSON.stringify(failure.details).includes("private"), false);
    }
    assert.equal(calls, 0);
  } finally { globalThis.fetch = originalFetch; }
});

test("root XML error labels classify states and retain numeric evidence without numeric-only guessing", async () => {
  const originalFetch = globalThis.fetch;
  // Arbitrary numeric values verify preservation, not a provider code table.
  const cases = [
    ['<?xml version="1.0"?><error code="9001">No such anime</error>', "not_found", 9001],
    ['<error code="9002">Client version outdated</error>', "outdated", 9002],
    ['<error code="9003">Client banned</error>', "banned", 9003],
    ['<error>Unknown client</error>', "misconfigured", null],
    ['<error code="999">Unrecognized server label with private details</error>', "unavailable", 999],
    ['<error code="9001"/>', "unavailable", 9001],
    ['<error code="malformed">Banned</error>', "banned", null]
  ] as const;
  try {
    for (const [body, code, apiCode] of cases) {
      let calls = 0;
      globalThis.fetch = async () => { calls++; return new Response(body); };
      const failure = await capture(() => new AniDbClient(config).getAnimeXml(1));
      assert.ok(failure instanceof AniDbUpstreamError);
      assert.equal(failure.details.code, code);
      assert.equal(failure.details.apiCode, apiCode);
      assert.equal(failure.details.httpStatus, 200);
      assert.equal(failure.details.reason, "api_error");
      assert.equal(failure.details.retried, false);
      assert.equal(JSON.stringify(failure.details).includes("private"), false);
      assert.equal(calls, 1);
    }
  } finally { globalThis.fetch = originalFetch; }
});

test("HTTP throttling is backoff while generic HTTP 404/403 cannot prove anime absence or a ban", async () => {
  const originalFetch = globalThis.fetch;
  try {
    for (const status of [429, 404, 403, 503]) {
      let calls = 0;
      globalThis.fetch = async () => { calls++; return new Response("Synthetic transport error", { status }); };
      const failure = await capture(() => new AniDbClient(config).getAnimeXml(1));
      assert.equal(failure.details.code, "unavailable");
      assert.equal(failure.details.reason, status === 429 ? "rate_limited" : "http_error");
      assert.equal(failure.details.httpStatus, status);
      assert.equal(failure.details.apiCode, null);
      assert.equal(calls, 1);
    }
  } finally { globalThis.fetch = originalFetch; }
});

test("network, timeout and response-body failures are sanitized and never retried", async () => {
  const originalFetch = globalThis.fetch;
  try {
    for (const mode of ["network", "timeout", "body"]) {
      let calls = 0;
      globalThis.fetch = async () => {
        calls++;
        if (mode === "network") throw new Error("private-url-and-material");
        if (mode === "timeout") throw new DOMException("private timeout", "TimeoutError");
        const response = new Response("unused");
        response.text = async () => { throw new Error("private transfer failure"); };
        return response;
      };
      const failure = await capture(() => new AniDbClient(config).getAnimeXml(1));
      assert.equal(failure.details.code, "unavailable");
      assert.equal(failure.details.reason, "network_error");
      assert.equal(failure.details.retried, false);
      assert.equal(JSON.stringify(failure.details).includes("private"), false);
      assert.equal(calls, 1);
    }
  } finally { globalThis.fetch = originalFetch; }
});

test("a valid anime mentioning banned in prose is ordinary metadata, not a ban response", async () => {
  const originalFetch = globalThis.fetch;
  const body = '<anime id="1"><description>A character was banned from a club.</description></anime>';
  globalThis.fetch = async () => new Response(body);
  try {
    assert.equal(await new AniDbClient(config).getAnimeXml(1), body);
    assert.equal((await new AnimeService(config).getByAniDbId(1)).description, "A character was banned from a club.");
  } finally { globalThis.fetch = originalFetch; }
});

test("malformed or mismatched successful responses produce invalid_response and are never cached", async () => {
  const originalFetch = globalThis.fetch;
  try {
    for (const body of ['<anime id="1">', '<html>private error page</html>', '<anime id="99"/>']) {
      let calls = 0;
      globalThis.fetch = async () => { calls++; return new Response(body); };
      const service = new AnimeService(config);
      const first = await capture(() => service.getByAniDbId(1));
      const second = await capture(() => service.getByAniDbId(1));
      assert.equal(first.details.reason, "invalid_response");
      assert.equal(second.details.code, "unavailable");
      assert.equal(JSON.stringify(first.details).includes("private"), false);
      assert.equal(calls, 2, "each explicit call makes one request; failed results cannot become cached successes");
    }
  } finally { globalThis.fetch = originalFetch; }
});

test("partial traversal adds sanitized provider details and stops after the first failed source", async () => {
  const reads: number[] = [];
  const result = await traverseAnimeRelations({ anidbId: 1, maxDepth: 2 }, {
    async getByAniDbId(id) {
      reads.push(id);
      if (id === 1) return mapAniDbAnimeXml('<anime id="1"><relatedanime><anime id="2"/><anime id="3"/></relatedanime></anime>');
      throw new AniDbUpstreamError("Synthetic rate limit", "unavailable", "rate_limited", 429);
    }
  });
  assert.deepEqual(reads, [1, 2]);
  assert.equal(result.termination, "source_read_failed");
  assert.equal(result.failures[0]!.code, "source_read_failed");
  assert.equal(result.failures[0]!.providerError?.code, "unavailable");
  assert.equal(result.failures[0]!.providerError?.reason, "rate_limited");
  assert.equal(result.failures[0]!.providerError?.httpStatus, 429);
});
