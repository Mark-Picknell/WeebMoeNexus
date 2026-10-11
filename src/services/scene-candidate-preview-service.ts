import type { AnimeRecord } from "../domain/anime.js";
import { sceneReviewHistorySchema, assessSceneReviews, type SceneReviewHistory } from "../domain/scene-review.js";
import { rankEpisodeCharacters, type EpisodeCharacterRanking } from "./episode-character-ranking-service.js";

export interface SceneCandidatePreview {
  scope: "selected_anidb_work_and_unverified_observation";
  sourceAnimeId: number;
  sourceEpisodeId: number | null;
  observationId: string;
  offsetMs: number | null;
  reviewStatus: SceneReviewHistory["assessment"]["status"];
  proposedCharacterId: number | null;
  /** The proposal is a user claim, not a verified match or identity join. */
  proposalCoverage:
    | "no_proposal" | "withdrawn" | "episode_not_selected" | "episode_not_reported"
    | "present_in_returned_source_rows" | "not_checked_truncated"
    | "not_reported_in_examined_source_rows";
  /** There is currently no source character-trait index or frame decoder. */
  traitComparison: "not_available";
  sourceRanking: (EpisodeCharacterRanking & {
    candidates: (EpisodeCharacterRanking["candidates"][number] & { observerProposed: boolean })[];
  }) | null;
}

/**
 * Produce a *local* review preview from independently scoped records.
 * Preserve the episode source ranking and review history separately.
 * No frame decoding, trait matching, provider writes or identity decisions.
 */
export function previewSceneCandidates(
  sourceAnime: AnimeRecord, rawHistory: SceneReviewHistory, limit = 25
): SceneCandidatePreview {
  const history = sceneReviewHistorySchema.parse(rawHistory);
  const replayed = assessSceneReviews(history.observation, history.events);
  if (JSON.stringify(history.assessment) !== JSON.stringify(replayed.assessment)) {
    throw new Error("Observation review assessment is inconsistent with its evidence");
  }
  const obs = replayed.observation;
  if (sourceAnime.id !== obs.context.anidbId) {
    throw new Error("A scene observation cannot be applied to a different source work");
  }
  const sourceEpisodeId = obs.context.episodeId;
  const ranking = sourceEpisodeId === null ? null : rankEpisodeCharacters(sourceAnime, sourceEpisodeId, limit);
  const withdrawn = replayed.assessment.status === "withdrawn";
  const proposedCharacterId = obs.proposedCharacterId;
  const candidates = ranking?.candidates.map(candidate => ({
    ...candidate,
    observerProposed: !withdrawn && proposedCharacterId !== null &&
      candidate.anidbCharacterId === proposedCharacterId
  })) ?? [];

  const proposalCoverage = withdrawn ? "withdrawn"
    : proposedCharacterId === null ? "no_proposal"
    : sourceEpisodeId === null ? "episode_not_selected"
    : ranking && !ranking.sourceEpisodeFound ? "episode_not_reported"
    : candidates.some(c => c.observerProposed) ? "present_in_returned_source_rows"
    : ranking?.truncated ? "not_checked_truncated"
    : "not_reported_in_examined_source_rows";
  return {
    scope: "selected_anidb_work_and_unverified_observation",
    sourceAnimeId: obs.context.anidbId,
    sourceEpisodeId,
    observationId: obs.observationId,
    offsetMs: obs.context.offsetMs,
    reviewStatus: replayed.assessment.status,
    proposedCharacterId,
    proposalCoverage,
    traitComparison: "not_available",
    sourceRanking: ranking ? { ...ranking, candidates } : null
  };
}
