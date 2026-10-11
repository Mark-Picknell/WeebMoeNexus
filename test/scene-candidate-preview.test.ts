import assert from "node:assert/strict";
import test from "node:test";
import { mapAniDbAnimeXml } from "../src/providers/anidb/mapper.js";
import { recordSceneObservation } from "../src/domain/scene-observation.js";
import { assessSceneReviews } from "../src/domain/scene-review.js";
import { previewSceneCandidates } from "../src/services/scene-candidate-preview-service.js";

const at = "2026-10-11T02:10:00Z";
const anime = mapAniDbAnimeXml(`<anime id="42">
  <titles><title type="main">Synthetic Work</title></titles>
  <episodes><episode id="101"><epno type="1">1</epno></episode></episodes>
  <characters>
    <character id="7"><name>Named</name><episodes>1</episodes></character>
    <character id="8"><name>Unknown appearance</name></character>
    <character id="7"><name>Separate source row</name><episodes>1</episodes></character>
  </characters>
</anime>`, at);
const observe = (id: number | null = 7, episode: number | null = 101, work = 42) =>
  recordSceneObservation({
    observationId: "ob-abcdef012345", reportedAt: at,
    context: { anidbId: work, episodeId: episode, offsetMs: 45600 },
    author: "unverified_user_report",
    observations: [{ attribute: "hair_color", reportedValue: "hot pink", certainty: "uncertain" }],
    proposedCharacterId: id, imageReference: null,
    consentScope: "ephemeral_local_processing_only"
  });

test("source positive metadata and user proposals remain two visibly separate signals", () => {
  const result = previewSceneCandidates(anime, assessSceneReviews(observe()));
  assert.equal(result.sourceAnimeId, 42);
  assert.equal(result.offsetMs, 45600);
  assert.equal(result.traitComparison, "not_available");
  assert.equal(result.reviewStatus, "unreviewed");
  assert.equal(result.proposalCoverage, "present_in_returned_source_rows");
  assert.equal(result.sourceRanking?.positiveReferenceCount, 2);
  assert.deepEqual(result.sourceRanking?.candidates.map(c => [c.anidbCharacterId, c.observerProposed]),
    [[7, true], [8, false], [7, true]].sort((a, b) => Number(b[1]) - Number(a[1])));
  assert.ok(result.sourceRanking?.candidates.every(c => c.appearance !== "unverified" || !c.observerProposed));
});

test("a proposed character never enters a source record just because an observer claims it", () => {
  const result = previewSceneCandidates(anime, assessSceneReviews(observe(999)));
  assert.equal(result.sourceRanking?.totalCandidates, 3);
  assert.equal(result.proposalCoverage, "not_reported_in_examined_source_rows");
  assert.equal(result.sourceRanking?.candidates.some(c => c.anidbCharacterId === 999), false);
});

test("truncated source candidates do not establish that an unseen proposal is absent", () => {
  const result = previewSceneCandidates(anime, assessSceneReviews(observe(8)), 1);
  assert.equal(result.sourceRanking?.truncated, true);
  assert.equal(result.sourceRanking?.totalCandidates, 3);
  assert.equal(result.proposalCoverage, "not_checked_truncated");
  assert.equal(result.sourceRanking?.candidates.length, 1);
});

test("unknown episode and episode not reported by the source preserve their different scope", () => {
  const noEpisode = previewSceneCandidates(anime, assessSceneReviews(observe(7, null)));
  assert.equal(noEpisode.proposalCoverage, "episode_not_selected");
  assert.equal(noEpisode.sourceRanking, null);
  const missing = previewSceneCandidates(anime, assessSceneReviews(observe(7, 999)));
  assert.equal(missing.proposalCoverage, "episode_not_reported");
  assert.equal(missing.sourceRanking?.sourceEpisodeFound, false);
  assert.deepEqual(missing.sourceRanking?.candidates, []);
});

test("withdrawn reports suppress active proposal flags without deleting historical claims", () => {
  const history = assessSceneReviews(observe(7), [{
    eventId: "rv-1234567890ab", observationId: "ob-abcdef012345", recordedAt: "2026-10-11T02:11:00Z",
    actor: "unverified_local_reviewer", action: "withdraws_report", note: "I got this wrong"
  }]);
  const result = previewSceneCandidates(anime, history);
  assert.equal(result.reviewStatus, "withdrawn");
  assert.equal(result.proposedCharacterId, 7);
  assert.equal(result.proposalCoverage, "withdrawn");
  assert.equal(result.sourceRanking?.candidates.every(c => !c.observerProposed), true);
});

test("a mismatched work or forged review decision cannot be projected as a source fact", () => {
  assert.throws(() => previewSceneCandidates(anime, assessSceneReviews(observe(7, 101, 999))), /different source work/);
  const history = assessSceneReviews(observe(7));
  const forged = structuredClone(history);
  forged.assessment.status = "observer_supported_unverified";
  assert.throws(() => previewSceneCandidates(anime, forged), /inconsistent/);
});
