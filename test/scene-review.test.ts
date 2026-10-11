import assert from "node:assert/strict";
import test from "node:test";
import { recordSceneObservation } from "../src/domain/scene-observation.js";
import { appendSceneReview, assessSceneReviews, sceneReviewEventSchema } from "../src/domain/scene-review.js";

const scene = (proposal: number | null = 77) => recordSceneObservation({
  observationId: "ob-abcdef012345", reportedAt: "2026-10-11T02:00:00Z",
  context: { anidbId: 42, episodeId: null, offsetMs: 2300 },
  author: "unverified_user_report",
  observations: [{ attribute: "hair_color", reportedValue: "hot pink", certainty: "uncertain" }],
  proposedCharacterId: proposal, imageReference: null,
  consentScope: "ephemeral_local_processing_only"
});
const event = (id: string, action: "supports_proposal" | "disputes_proposal" | "requests_evidence" | "withdraws_report", at = "2026-10-11T02:00:01Z") => ({
  eventId: "rv-" + id.padEnd(10, "0"),
  observationId: "ob-abcdef012345",
  recordedAt: at,
  actor: "unverified_local_reviewer" as const,
  action, note: null
});

test("unreviewed observations do not self-verify their proposed identity", () => {
  const history = assessSceneReviews(scene());
  assert.equal(history.assessment.status, "unreviewed");
  assert.equal(history.assessment.canonicalIdentityChanged, false);
  assert.equal(history.events.length, 0);
});

test("observer support remains unverified even when repeated", () => {
  const first = appendSceneReview(assessSceneReviews(scene()), event("support1", "supports_proposal"));
  const second = appendSceneReview(first, event("support2", "supports_proposal", "2026-10-11T02:00:02Z"));
  assert.equal(first.assessment.status, "observer_supported_unverified");
  assert.equal(second.assessment.status, "observer_supported_unverified");
  assert.equal(second.assessment.supportingEvents, 2);
  assert.equal(second.assessment.canonicalIdentityChanged, false);
  assert.equal(first.events.length, 1, "original ledger remains immutable");
});

test("support and dispute coexist; newer and more numerous votes do not erase conflict", () => {
  const rows = [
    event("support1", "supports_proposal"),
    event("dispute1", "disputes_proposal", "2026-10-11T02:00:02Z"),
    event("support2", "supports_proposal", "2026-10-11T02:00:03Z")
  ];
  const history = assessSceneReviews(scene(), rows);
  assert.equal(history.assessment.status, "contested");
  assert.equal(history.events.length, 3);
  assert.equal(history.assessment.supportingEvents, 2);
  assert.equal(history.assessment.disputingEvents, 1);
  assert.equal(assessSceneReviews(scene(), [rows[1]!, rows[0]!, rows[2]!].map((r, i) => ({
    ...r, recordedAt: `2026-10-11T02:00:0${i + 1}Z`
  }))).assessment.status, "contested");
});

test("evidence requests are not approvals, and a dispute remains visible", () => {
  const requested = assessSceneReviews(scene(), [event("request1", "requests_evidence")]);
  assert.equal(requested.assessment.status, "needs_more_evidence");
  const disputed = appendSceneReview(requested, event("dispute1", "disputes_proposal", "2026-10-11T02:00:02Z"));
  assert.equal(disputed.assessment.status, "disputed");
  assert.equal(disputed.assessment.needsEvidenceEvents, 1);
});

test("withdrawal preserves ancestry and blocks resurrection", () => {
  const withdrawn = assessSceneReviews(scene(), [
    event("support1", "supports_proposal"),
    event("retract1", "withdraws_report", "2026-10-11T02:00:02Z")
  ]);
  assert.equal(withdrawn.assessment.status, "withdrawn");
  assert.equal(withdrawn.events.length, 2);
  assert.throws(() => appendSceneReview(withdrawn, event("support2", "supports_proposal", "2026-10-11T02:00:03Z")), /reactivated/);
});

test("review chronology, identity and event uniqueness are checked", () => {
  const base = scene();
  assert.throws(() => assessSceneReviews(base, [event("support1", "supports_proposal", "2026-10-10T00:00:00Z")]), /chronology/);
  assert.throws(() => assessSceneReviews(base, [event("support1", "supports_proposal"), event("support1", "supports_proposal")]), /Duplicate/);
  assert.throws(() => assessSceneReviews(base, [{ ...event("support1", "supports_proposal"), observationId: "ob-notthesame" }]), /different/);
  assert.throws(() => assessSceneReviews(scene(null), [event("support1", "supports_proposal")]), /proposed/);
  assert.equal(sceneReviewEventSchema.safeParse({
    ...event("support1", "supports_proposal"), actor: "verified_moderator"
  }).success, false);
});

test("forged review summaries cannot be appended as if independently checked", () => {
  const base = assessSceneReviews(scene(), [event("support1", "supports_proposal")]);
  const tampered = structuredClone(base);
  tampered.assessment.status = "contested";
  assert.throws(() => appendSceneReview(tampered, event("support2", "supports_proposal", "2026-10-11T02:00:02Z")), /does not match/);
  assert.equal(base.assessment.status, "observer_supported_unverified");
});
