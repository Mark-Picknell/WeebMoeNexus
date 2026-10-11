import assert from "node:assert/strict";
import test from "node:test";
import { fieldClaimSchema, fieldContextKey, entityReferenceKey } from "../src/domain/field-claim.js";
import { projectAniDbFieldClaims } from "../src/providers/anidb/field-claims.js";
import { mapAniDbAnimeXml } from "../src/providers/anidb/mapper.js";

const at = "2026-10-10T23:00:00Z";
const record = () => mapAniDbAnimeXml(`<anime id="7"><type>TV</type><episodecount>0</episodecount>
  <titles><title type="main" xml:lang="en">Synthetic</title><title type="main" xml:lang="ja">別</title></titles>
  <characters><character id="7"><name>Same</name><gender>female</gender><episodes>1-2</episodes><seiyuu id="7">Same</seiyuu></character>
  <character id="8"/></characters><creators><name id="7" type="Script">Same</name><name type="Direction">Unidentified</name></creators>
  <episodes><episode id="11"><epno type="1">1</epno><length>0</length></episode><episode id="12"/></episodes></anime>`, at);

test("field projection preserves exact source paths, time, types and normalized evidence", () => {
  const result = projectAniDbFieldClaims(record());
  assert.deepEqual(result.claims.find(c => c.field === "episodeCount")!.value, 0);
  const gender = result.claims.find(c => c.field === "gender")!;
  assert.equal(gender.evidence.sourceField, "characters[0].gender");
  assert.equal(gender.evidence.reportedValue, "female");
  assert.equal(gender.evidence.representation, "normalized_scalar");
  assert.equal(gender.evidence.retrievedAt, at);
  assert.equal(gender.evidence.sourceUrl, "https://anidb.net/anime/7");
  assert.equal(result.claims.find(c => c.field === "episode.lengthMinutes")!.value, 0);
  assert.ok(result.claims.every(c => c.polarity === "positive"));
});

test("same numeric IDs preserve kind namespaces and missing contributor IDs retain values", () => {
  const result = projectAniDbFieldClaims(record());
  const names = result.claims.filter(c => c.field === "name");
  assert.deepEqual(names.map(c => c.subject.kind), ["character", "contributor", "contributor"]);
  assert.equal(new Set(names.map(c => entityReferenceKey(c.subject))).size, 2);
  assert.ok(result.unknowns.some(u => u.subject === null && u.reason === "missing_subject_id" && u.normalizedValue === "Unidentified"));
  assert.equal(result.claims.some(c => c.value === "Unidentified"), false);
});

test("fallbacks, absent values, unmodeled attributes and lost boolean presence are explicit unknowns", () => {
  const result = projectAniDbFieldClaims(record());
  assert.ok(result.unknowns.some(u => u.reason === "derived_display" && u.normalizedValue === "AniDB character #8"));
  assert.ok(result.unknowns.some(u => u.field === "episode.number" && u.reason === "derived_display"));
  assert.ok(result.unknowns.some(u => u.field === "restricted" && u.reason === "normalization_lost_presence" && u.normalizedValue === false));
  assert.ok(result.unknowns.some(u => u.field === "species" && u.reason === "not_modeled"));
  assert.ok(result.unknowns.some(u => u.field === "startDate" && u.reason === "missing_value"));
  assert.equal(result.claims.some(c => c.field === "restricted" || c.field === "preferredTitle"), false);
});

test("language/title kinds and episode IDs preserve field context rather than collapsing values", () => {
  const result = projectAniDbFieldClaims(record());
  const titles = result.claims.filter(c => c.field === "title");
  assert.notEqual(fieldContextKey(titles[0]!.context), fieldContextKey(titles[1]!.context));
  const number = result.claims.find(c => c.field === "episode.number")!;
  assert.deepEqual(number.context.qualifiers, { episodeId: "11" });
  assert.equal(fieldContextKey({ work: null, qualifiers: { a: "1", b: "2" } }), fieldContextKey({ work: null, qualifiers: { b: "2", a: "1" } }));
});

test("validation rejects missing or ambiguous source ancestry, timestamps, unsafe IDs and null claims", () => {
  for (const mutate of [
    (a: ReturnType<typeof record>) => { a.provenance = []; },
    (a: ReturnType<typeof record>) => { a.provenance.push(a.provenance[0]!); },
    (a: ReturnType<typeof record>) => { a.provenance[0]!.sourceUrl += "wrong"; },
    (a: ReturnType<typeof record>) => { a.provenance[0]!.retrievedAt = "tomorrow"; },
    (a: ReturnType<typeof record>) => { a.characters[0]!.id = Number.MAX_SAFE_INTEGER + 1; }
  ]) { const anime = record(); mutate(anime); assert.throws(() => projectAniDbFieldClaims(anime)); }
  const claim = projectAniDbFieldClaims(record()).claims[0]!;
  assert.equal(fieldClaimSchema.safeParse({ ...claim, value: null }).success, false);
  assert.equal(fieldClaimSchema.safeParse({ ...claim, evidence: { ...claim.evidence, sourceUrl: "file:///private" } }).success, false);
});

test("empty records create no invented titles/people and projection is isolated with no network", () => {
  const original = globalThis.fetch;
  globalThis.fetch = () => { throw new Error("No network authorized"); };
  try {
    const anime = record(); const before = structuredClone(anime);
    const result = projectAniDbFieldClaims(anime);
    result.claims[0]!.subject.id = "changed";
    assert.deepEqual(anime, before);
    assert.equal(projectAniDbFieldClaims(mapAniDbAnimeXml('<anime id="7"/>', at)).claims.length, 0);
  } finally { globalThis.fetch = original; }
});
