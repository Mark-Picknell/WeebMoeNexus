import type { AnimeRecord } from "../domain/anime.js";
import { normalizeCharacterEpisodeAppearances, type CharacterEpisodeEvidence } from "./episode-appearance-service.js";

export interface SourceCharacterDetail {
  anidbCharacterId: number;
  name: string;
  characterUrl: string;
  role: string | null;
  gender: string | null;
  picture: string | null;
  episodeAppearancesRaw: string | null;
  episodeEvidence: CharacterEpisodeEvidence;
  voiceActor: {
    id: number | null;
    name: string;
    picture: string | null;
  } | null;
}

export interface CharacterDetailResult {
  sourceAnimeId: number;
  sourceAnimeTitle: string;
  sourceAnimeUrl: string;
  evidenceSourceUrl: string;
  retrievedAt: string;
  requestedCharacterId: number;
  reportedCharacterCount: number;
  /** false = not reported in this work's character list, not global absence. */
  found: boolean;
  character: SourceCharacterDetail | null;
}

/**
 * Read a character by its stable AniDB character ID *within a known source
 * anime*. No standalone character API, cross-series identity inference,
 * character scraping, or target fetching occurs here.
 */
export function getCharacterInAnime(
  anime: AnimeRecord,
  anidbCharacterId: number
): CharacterDetailResult {
  if (!Number.isSafeInteger(anidbCharacterId) || anidbCharacterId < 1) {
    throw new RangeError("AniDB character ID must be a positive safe integer");
  }
  const evidence = anime.provenance.find(item =>
    item.provider === "anidb" && item.providerId === String(anime.id)
  );
  if (!evidence) {
    throw new Error("Character lookup requires matching AniDB source provenance");
  }

  const source = anime.characters.find(char => char.id === anidbCharacterId);
  const character: SourceCharacterDetail | null = source ? {
    anidbCharacterId: source.id,
    name: source.name,
    characterUrl: `https://anidb.net/character/${source.id}`,
    role: source.role,
    gender: source.gender,
    picture: source.picture,
    episodeAppearancesRaw: source.episodeAppearancesRaw,
    episodeEvidence: normalizeCharacterEpisodeAppearances(anime, source.episodeAppearancesRaw),
    voiceActor: source.voiceActor
  } : null;

  return {
    sourceAnimeId: anime.id,
    sourceAnimeTitle: anime.preferredTitle,
    sourceAnimeUrl: `https://anidb.net/anime/${anime.id}`,
    evidenceSourceUrl: evidence.sourceUrl,
    retrievedAt: evidence.retrievedAt,
    requestedCharacterId: anidbCharacterId,
    reportedCharacterCount: anime.characters.length,
    found: character !== null,
    character
  };
}
