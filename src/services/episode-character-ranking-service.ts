import { animeRecordSchema, type AnimeRecord } from "../domain/anime.js";
import { normalizeCharacterEpisodeAppearances, type CharacterEpisodeEvidence } from "./episode-appearance-service.js";

export interface EpisodeCharacterCandidate {
  /** Source row index; duplicate source IDs are not silently merged. */
  sourceRowIndex: number;
  anidbCharacterId: number;
  displayName: string;
  nameIsSourceReported: boolean;
  /** Positive source episode reference, NOT an observation of the scene. */
  appearance: "reported_positive" | "unverified";
  episodeEvidence: CharacterEpisodeEvidence;
}

export interface EpisodeCharacterRanking {
  scope: "one_anidb_anime_episode";
  sourceAnimeId: number;
  sourceAnimeTitle: string;
  sourceUrl: string;
  retrievedAt: string;
  requestedEpisodeId: number;
  sourceEpisodeFound: boolean;
  reportedCharacterRows: number;
  totalCandidates: number;
  positiveReferenceCount: number;
  unverifiedCount: number;
  truncated: boolean;
  candidates: EpisodeCharacterCandidate[];
}

/**
 * Rank source-reported character rows for a known anime + episode.
 * Only positive, parsed and same-anime-linked episode references can boost
 * a candidate. Missing, unparsed, different or incomplete metadata never
 * establishes a negative appearance. No image/audio observation is made.
 */
export function rankEpisodeCharacters(raw: AnimeRecord, episodeId: number, limit = 25): EpisodeCharacterRanking {
  if (!Number.isSafeInteger(episodeId) || episodeId < 1) {
    throw new RangeError("AniDB episode ID must be a positive safe integer");
  }
  if (!Number.isSafeInteger(limit) || limit < 1 || limit > 100) {
    throw new RangeError("Episode candidate limit must be an integer from 1 to 100");
  }
  const anime = animeRecordSchema.parse(raw);
  const source = anime.provenance.find(p => p.provider === "anidb" && p.providerId === String(anime.id));
  if (!source || source.sourceUrl !== `https://anidb.net/anime/${anime.id}` ||
      !Number.isFinite(Date.parse(source.retrievedAt))) {
    throw new Error("Episode ranking requires matching AniDB source provenance");
  }
  const sourceEpisodeFound = anime.episodes.some(e => e.id === episodeId);
  const candidates: EpisodeCharacterCandidate[] = sourceEpisodeFound
    ? anime.characters.map((character, sourceRowIndex) => {
        const episodeEvidence = normalizeCharacterEpisodeAppearances(anime, character.episodeAppearancesRaw);
        return {
          sourceRowIndex,
          anidbCharacterId: character.id,
          displayName: character.name,
          nameIsSourceReported: character.name !== `AniDB character #${character.id}`,
          appearance: episodeEvidence.linkedEpisodeIds.includes(episodeId)
            ? "reported_positive" as const : "unverified" as const,
          episodeEvidence
        };
      }).sort((a, b) =>
        Number(b.appearance === "reported_positive") - Number(a.appearance === "reported_positive") ||
        a.sourceRowIndex - b.sourceRowIndex)
    : [];
  const positiveReferenceCount = candidates.filter(c => c.appearance === "reported_positive").length;
  return {
    scope: "one_anidb_anime_episode",
    sourceAnimeId: anime.id,
    sourceAnimeTitle: anime.preferredTitle,
    sourceUrl: source.sourceUrl,
    retrievedAt: source.retrievedAt,
    requestedEpisodeId: episodeId,
    sourceEpisodeFound,
    reportedCharacterRows: anime.characters.length,
    totalCandidates: candidates.length,
    positiveReferenceCount,
    unverifiedCount: candidates.length - positiveReferenceCount,
    truncated: candidates.length > limit,
    candidates: candidates.slice(0, limit)
  };
}
