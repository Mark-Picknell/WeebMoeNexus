import assert from "node:assert/strict";
import test from "node:test";
import { animeEvidenceInputSchema, animeEvidenceResultSchema } from "../src/domain/anime-evidence.js";
import { ProviderLookupError } from "../src/domain/provider-error.js";
import { getAnimeEvidence } from "../src/services/anime-evidence-service.js";
import { mapAniDbAnimeXml } from "../src/providers/anidb/mapper.js";

const at = "2026-10-10T23:00:00Z";
const record = () => mapAniDbAnimeXml(`<anime id="7"><relatedanime><anime id="8">Other</anime></relatedanime>
  <characters><character id="7"><name>First</name><gender>female</gender></character><character id="7"><name>Second</name><gender>male</gender></character>
  <character id="8"><name>First</name><gender>female</gender></character></characters>
  <creators><name id="7" type="Script">First</name><name type="Direction">First</name></creators></anime>`, at);

test("one-record evidence preserves namespaces, multi-name variants, gender conflict and unknown-ID rows", async () => {
  const reads: number[] = [];
  const result = await getAnimeEvidence(animeEvidenceInputSchema.parse({ anidbId: 7 }), { getByAniDbId: async id => { reads.push(id); return record(); } });
  assert.ok(animeEvidenceResultSchema.safeParse(result).success);
  assert.deepEqual(reads, [7]);
  const names = result.fields.filter(f => f.assessment.request.field === "name" && f.assessment.request.subjects[0]!.id === "7");
  assert.equal(names.length, 2); assert.ok(names.every(f => f.assessment.status === "reported"));
  const character = names.find(f => f.assessment.request.subjects[0]!.kind === "character")!;
  assert.deepEqual(character.assessment.claims.map(c => c.value), ["First", "Second"]);
  const genders = result.fields.filter(f => f.assessment.request.field === "gender");
  assert.deepEqual(genders.map(f => f.assessment.status), ["conflicting", "reported"]);
  assert.ok(result.fields.some(f => f.assessment.request.field === "species" && f.assessment.status === "unknown"));
  assert.equal(result.unassignedUnknownIndexes.length, 2);
  assert.ok(result.unassignedUnknownIndexes.every(i => result.projection.unknowns[i]!.reason === "missing_subject_id"));
});

test("absent preferred provider neither connects it nor hides current source assertions", async () => {
  let reads = 0;
  const result = await getAnimeEvidence(animeEvidenceInputSchema.parse({ anidbId: 7, sourcePreference: { providers: ["not_connected"], allowUnlisted: false } }), {
    getByAniDbId: async () => { reads++; return record(); }
  });
  assert.equal(reads, 1);
  const reported = result.fields.filter(f => f.assessment.claims.length);
  assert.ok(reported.every(f => f.status === "no_eligible_source" && f.preferredClaimIndexes.length === 0));
  assert.equal(reported.reduce((sum, f) => sum + f.otherClaimIndexes.length, 0), result.projection.claims.length);
});

test("invalid input performs no reads and failed/mismatched records stop once with safe errors", async () => {
  let reads = 0;
  await assert.rejects(getAnimeEvidence({ anidbId: 0 } as never, { getByAniDbId: async () => { reads++; return record(); } }));
  assert.equal(reads, 0);
  const denied = new ProviderLookupError({ code: "banned", reason: "api_error", message: "Synthetic safe ban", httpStatus: 200, apiCode: null });
  await assert.rejects(getAnimeEvidence(animeEvidenceInputSchema.parse({ anidbId: 7 }), { getByAniDbId: async () => { reads++; throw denied; } }), e => e === denied);
  await assert.rejects(getAnimeEvidence(animeEvidenceInputSchema.parse({ anidbId: 8 }), { getByAniDbId: async () => { reads++; return record(); } }), e => e instanceof ProviderLookupError && e.details.reason === "invalid_response");
  assert.equal(reads, 2);
});

test("evidence budget overflow and malformed provenance fail without silent truncation or retries", async () => {
  const huge = record();
  huge.titles = Array.from({ length: 1001 }, (_, i) => ({ language: "en", kind: "synonym", value: `Synthetic ${i}` }));
  const invalid = record(); invalid.provenance[0]!.retrievedAt = "private-malformed-value";
  for (const anime of [huge, invalid]) {
    let reads = 0;
    await assert.rejects(getAnimeEvidence(animeEvidenceInputSchema.parse({ anidbId: 7 }), { getByAniDbId: async () => { reads++; return anime; } }), e =>
      e instanceof ProviderLookupError && e.details.reason === "invalid_response" && !e.message.includes("private-malformed"));
    assert.equal(reads, 1);
  }
});
