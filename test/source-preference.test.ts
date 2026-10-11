import assert from "node:assert/strict";
import test from "node:test";
import type { FieldClaim } from "../src/domain/field-claim.js";
import type { FieldAssessmentInput } from "../src/domain/field-assessment.js";
import { fieldPreferenceSchema } from "../src/domain/source-preference.js";
import { preferFieldClaims } from "../src/services/source-preference-service.js";

const subject = { provider: "subject_namespace", kind: "character" as const, id: "7" };
const request: FieldAssessmentInput = { subjects: [subject], field: "species", context: { work: null, qualifiers: {} }, cardinality: "single" };
function claim(provider: string, value: string, polarity: FieldClaim["polarity"] = "positive"): FieldClaim {
  return { subject, field: request.field, context: request.context, value, polarity,
    evidence: { sourceRecord: { provider, kind: "work", id: "1" }, sourceUrl: `https://example.test/${provider}`,
      retrievedAt: "2026-10-10T23:00:00Z", sourceField: "character.species", representation: "normalized_scalar", reportedValue: value } };
}

test("source preference changes display indexes while every disagreement and assertion survives", () => {
  const claims = [claim("a", "human"), claim("b", "succubus")];
  const first = preferFieldClaims(request, claims, [], { providers: ["b", "a"] });
  const reverse = preferFieldClaims(request, claims, [], { providers: ["a", "b"] });
  assert.deepEqual(first.preferredClaimIndexes, [1]); assert.deepEqual(first.otherClaimIndexes, [0]);
  assert.deepEqual(reverse.preferredClaimIndexes, [0]);
  assert.deepEqual(first.assessment, reverse.assessment);
  assert.equal(first.assessment.status, "conflicting");
  assert.deepEqual(first.assessment.claims, claims);
});

test("default priority retains ties including duplicate rows, negatives and internal conflicts", () => {
  const claims = [claim("a", "human"), claim("a", "human", "negative"), claim("a", "succubus"), claim("b", "human")];
  const neutral = preferFieldClaims(request, claims);
  assert.deepEqual(neutral.preferredClaimIndexes, [0, 1, 2, 3]);
  const chosen = preferFieldClaims(request, claims, [], { providers: ["a"] });
  assert.deepEqual(chosen.preferredClaimIndexes, [0, 1, 2]);
  assert.equal(chosen.assessment.status, "conflicting");
  assert.deepEqual(chosen.assessment, neutral.assessment);
});

test("preference uses evidence source provider, not subject namespace or freshness/votes", () => {
  const newer = claim("b", "succubus"); newer.evidence.retrievedAt = "2026-10-11T00:00:00Z";
  const result = preferFieldClaims(request, [claim("a", "human"), newer, newer], [], { providers: ["subject_namespace", "a", "b"] });
  assert.deepEqual(result.preferredClaimIndexes, [0]);
  assert.equal(result.assessment.claims.length, 3);
});

test("unlisted sources can tie as fallback or remain fully visible without an eligible preference", () => {
  const claims = [claim("a", "human"), claim("b", "succubus")];
  const fallback = preferFieldClaims(request, claims, [], { providers: ["absent"] });
  assert.deepEqual(fallback.preferredClaimIndexes, [0, 1]);
  const noSource = preferFieldClaims(request, claims, [], { providers: ["absent"], allowUnlisted: false });
  assert.equal(noSource.status, "no_eligible_source");
  assert.deepEqual(noSource.preferredClaimIndexes, []); assert.deepEqual(noSource.otherClaimIndexes, [0, 1]);
  assert.deepEqual(noSource.assessment, fallback.assessment);
  assert.equal(preferFieldClaims(request, []).status, "no_claims");
});

test("explicit preferred negatives do not silently become a lower-ranked positive value", () => {
  const result = preferFieldClaims(request, [claim("a", "human", "negative"), claim("b", "human")], [], { providers: ["a", "b"] });
  assert.deepEqual(result.preferredClaimIndexes, [0]);
  assert.equal(result.assessment.claims[0]!.polarity, "negative");
  assert.equal(result.assessment.status, "conflicting");
});

test("invalid policies/index partitions reject and preference is independent of caller mutation", () => {
  assert.throws(() => preferFieldClaims(request, [], [], { providers: ["a", " a "] }));
  assert.throws(() => preferFieldClaims(request, [], [], { providers: Array.from({ length: 11 }, (_, i) => String(i)) }));
  const claims = [claim("a", "human")]; const policy = { providers: ["a"] };
  const result = preferFieldClaims(request, claims, [], policy);
  assert.equal(fieldPreferenceSchema.safeParse({ ...result, otherClaimIndexes: [0] }).success, false);
  assert.equal(fieldPreferenceSchema.safeParse({ ...result, preferredClaimIndexes: [1] }).success, false);
  result.assessment.claims[0]!.value = "changed"; result.policy.providers[0] = "changed";
  assert.equal(claims[0]!.value, "human"); assert.deepEqual(policy.providers, ["a"]);
});
