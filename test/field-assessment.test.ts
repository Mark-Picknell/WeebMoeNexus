import assert from "node:assert/strict";
import test from "node:test";
import type { FieldClaim } from "../src/domain/field-claim.js";
import type { FieldAssessmentInput } from "../src/domain/field-assessment.js";
import { assessFieldClaims } from "../src/services/field-assessment-service.js";
import { mapAniDbAnimeXml } from "../src/providers/anidb/mapper.js";
import { projectAniDbFieldClaims } from "../src/providers/anidb/field-claims.js";

const subject = { provider: "synthetic_a", kind: "character" as const, id: "7" };
const context = { work: null, qualifiers: {} };
const request: FieldAssessmentInput = { subjects: [subject], field: "species", context, cardinality: "single" };
function claim(value: FieldClaim["value"], polarity: FieldClaim["polarity"] = "positive", provider = "synthetic_a"): FieldClaim {
  return { subject, field: "species", context, value, polarity,
    evidence: { sourceRecord: { provider, kind: "work", id: "11" }, sourceUrl: `https://example.test/${provider}/11`,
      retrievedAt: "2026-10-10T23:00:00Z", sourceField: "characters[0].species", representation: "normalized_scalar", reportedValue: value } };
}

test("single-valued differences retain all source claims and exact evidence indexes", () => {
  const result = assessFieldClaims(request, [claim("succubus"), claim("human", "positive", "synthetic_b")]);
  assert.equal(result.status, "conflicting");
  assert.deepEqual(result.conflicts, [{ type: "different_single_values", alternatives: [
    { value: "succubus", claimIndexes: [0] }, { value: "human", claimIndexes: [1] }
  ] }]);
  assert.deepEqual(result.claims.map(c => c.evidence.sourceRecord.provider), ["synthetic_a", "synthetic_b"]);
});

test("multi-valued aliases coexist but positive and explicit negative for the same value conflict", () => {
  const result = assessFieldClaims({ ...request, cardinality: "multiple" }, [claim("One"), claim("Two"), claim("One", "negative")]);
  assert.equal(result.conflicts.length, 1);
  assert.deepEqual(result.conflicts[0], { type: "opposing_assertions", value: "One", positiveClaimIndexes: [0], negativeClaimIndexes: [2] });
  const compatible = assessFieldClaims({ ...request, cardinality: "multiple" }, [claim("One"), claim("Two"), claim("Three", "negative")]);
  assert.equal(compatible.status, "reported");
  assert.equal(compatible.claims.length, 3);
});

test("duplicate assertions and later retrievals do not vote or erase earlier disagreement", () => {
  const later = claim("human"); later.evidence.retrievedAt = "2026-10-11T00:00:00Z";
  const result = assessFieldClaims(request, [claim("succubus"), later, later]);
  assert.equal(result.status, "conflicting");
  assert.equal(result.claims.length, 3);
  const conflict = result.conflicts[0]!;
  assert.equal(conflict.type, "different_single_values");
  if (conflict.type === "different_single_values") assert.deepEqual(conflict.alternatives[1]!.claimIndexes, [1, 2]);
});

test("equal names/IDs in other providers, kinds, works or language contexts never join implicitly", () => {
  const other = claim("human"); other.subject = { ...subject, provider: "synthetic_b" };
  const kind = claim("human"); kind.subject = { ...subject, kind: "contributor" };
  const work = claim("human"); work.context = { work: { provider: "synthetic_a", kind: "work", id: "12" }, qualifiers: {} };
  const language = claim("human"); language.context = { ...context, qualifiers: { language: "ja" } };
  const result = assessFieldClaims(request, [claim("succubus"), other, kind, work, language]);
  assert.equal(result.status, "reported"); assert.equal(result.excludedClaimCount, 4);
  const explicit = assessFieldClaims({ ...request, subjects: [subject, other.subject] }, [claim("succubus"), other]);
  assert.equal(explicit.status, "conflicting");
  assert.deepEqual(explicit.request.subjects, [subject, other.subject]);
  assert.equal("canonicalId" in explicit, false);
});

test("negative-only and unknown states remain scoped source evidence, never absence-as-denial", () => {
  assert.equal(assessFieldClaims(request, []).status, "unknown");
  const denial = assessFieldClaims(request, [claim("succubus", "negative")]);
  assert.equal(denial.status, "negative_only");
  const projection = projectAniDbFieldClaims(mapAniDbAnimeXml('<anime id="7"><characters><character id="7"><name>Synthetic</name></character></characters></anime>', "2026-10-10T23:00:00Z"));
  const species = projection.unknowns.find(u => u.field === "species")!;
  const result = assessFieldClaims({ ...request, subjects: [species.subject!], context: species.context }, projection.claims, projection.unknowns);
  assert.equal(result.status, "unknown"); assert.equal(result.unknowns.length, 1); assert.deepEqual(result.conflicts, []);
});

test("typed values and exact strings are not fuzzy taxonomy or case equivalence", () => {
  for (const values of [[false, 0], [1, "1"], ["Human", "human"]] as const) {
    assert.equal(assessFieldClaims(request, values.map(value => claim(value))).status, "conflicting");
  }
});

test("invalid comparison membership/over-budget evidence rejects and results cannot mutate inputs", () => {
  assert.throws(() => assessFieldClaims({ ...request, subjects: [subject, subject] }, []));
  assert.throws(() => assessFieldClaims({ ...request, subjects: [subject, { ...subject, kind: "historical_person" }] }, []));
  assert.throws(() => assessFieldClaims(request, Array.from({ length: 1001 }, () => claim("human"))));
  const assertions = [claim("human")]; const before = structuredClone(assertions);
  const result = assessFieldClaims(request, assertions); result.claims[0]!.evidence.sourceRecord.id = "changed";
  assert.deepEqual(assertions, before);
});
