import assert from "node:assert/strict";
import test from "node:test";
import {
  recordSceneObservation, sceneObservationInputSchema, sceneObservationRecordSchema
} from "../src/domain/scene-observation.js";

const input = () => ({
  observationId: "ob-1234567890ab",
  reportedAt: "2026-10-11T02:00:00Z",
  context: { anidbId: 42, episodeId: 102, offsetMs: 145230 },
  author: "unverified_user_report" as const,
  observations: [
    { attribute: "hair_color" as const, reportedValue: "Hot pink", certainty: "observed" as const },
    { attribute: "accessory" as const, reportedValue: "Scalpel", certainty: "uncertain" as const }
  ],
  proposedCharacterId: 77,
  imageReference: null,
  consentScope: "ephemeral_local_processing_only" as const
});

test("keeps time-coded observations separate from source metadata or canonical identity", () => {
  const result = recordSceneObservation(input());
  assert.ok(sceneObservationRecordSchema.safeParse(result).success);
  assert.equal(result.reviewState, "unreviewed");
  assert.equal(result.provenance, "unverified_submitter_assertion");
  assert.equal(result.context.offsetMs, 145230);
  assert.equal(result.proposedCharacterId, 77);
  assert.equal(result.observations[1]!.certainty, "uncertain");
  assert.equal("canonicalId" in result, false);
  assert.equal("provider" in result, false);
});

test("unknown episode and unknown timestamp are represented, never fabricated", () => {
  const value = input();
  value.context.episodeId = null;
  value.context.offsetMs = null;
  value.proposedCharacterId = null;
  const result = recordSceneObservation(value);
  assert.equal(result.context.episodeId, null);
  assert.equal(result.context.offsetMs, null);
  assert.equal(result.proposedCharacterId, null);
});

test("digest-only image metadata is a rights claim rather than upload or license verification", () => {
  const value = { ...input(), imageReference: {
    type: "digest_only" as const, sha256: "a".repeat(64),
    rightsClaim: "claimed_licensed" as const, permissionAffirmed: true as const
  } };
  const record = recordSceneObservation(value);
  assert.equal(record.imageReference?.sha256, "a".repeat(64));
  assert.equal("content" in record, false);
  assert.equal(sceneObservationInputSchema.safeParse({
    ...value, imageReference: { ...value.imageReference, uri: "https://example.test/image" }
  }).success, false);
  assert.equal(sceneObservationInputSchema.safeParse({
    ...value, imageReference: { ...value.imageReference, permissionAffirmed: false }
  }).success, false);
  assert.equal(sceneObservationInputSchema.safeParse({
    ...value, imageReference: { ...value.imageReference, sha256: "not-a-digest" }
  }).success, false);
});

test("scope and consent are mandatory; processing cannot imply public sharing or retention", () => {
  for (const replacement of [
    { context: { ...input().context, offsetMs: -1 } },
    { context: { ...input().context, episodeId: 0 } },
    { context: { ...input().context, anidbId: Number.MAX_SAFE_INTEGER + 1 } },
    { consentScope: "public_indexing" },
    { consentScope: undefined },
    { author: "verified_provider" },
    { reviewState: "approved" }
  ]) {
    assert.equal(sceneObservationInputSchema.safeParse({ ...input(), ...replacement }).success, false);
  }
});

test("unsupported assertions, raw bytes, unbounded notes and excessive observations reject", () => {
  const value = input();
  assert.equal(sceneObservationInputSchema.safeParse({
    ...value, observations: [{ attribute: "verified_species", reportedValue: "Succubus", certainty: "observed" }]
  }).success, false);
  assert.equal(sceneObservationInputSchema.safeParse({
    ...value, observations: [{ ...value.observations[0], reportedValue: "x".repeat(201) }]
  }).success, false);
  assert.equal(sceneObservationInputSchema.safeParse({
    ...value, observations: Array.from({ length: 17 }, () => value.observations[0])
  }).success, false);
  assert.equal(sceneObservationInputSchema.safeParse({
    ...value, rawImageBytes: "data:image/png;base64,anything"
  }).success, false);
});

test("parsing copies the input instead of mutating or retaining its writable arrays", () => {
  const value = input();
  const record = recordSceneObservation(value);
  value.observations[0]!.reportedValue = "retracted text";
  assert.equal(record.observations[0]!.reportedValue, "Hot pink");
  assert.equal(sceneObservationRecordSchema.safeParse({
    ...record, reviewState: "reviewer_verified"
  }).success, false);
});
