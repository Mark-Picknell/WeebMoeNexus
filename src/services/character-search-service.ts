import type { AnimeRecord } from "../domain/anime.js";
import { normalizeAniDbTitle } from "../providers/anidb/title-normalization.js";
import { normalizeCharacterEpisodeAppearances, type CharacterEpisodeEvidence } from "./episode-appearance-service.js";

export type CharacterNameMatchType =
  | "exact"
  | "normalized"
  | "prefix"
  | "contains";

export interface CharacterSearchMatch {
  anidbCharacterId: number;
  characterName: string;
  characterUrl: string;
  sourceAnimeId: number;
  sourceAnimeTitle: string;
  sourceAnimeUrl: string;
  /** Source anime record supplies the observation; not a standalone character fetch. */
  evidenceSourceUrl: string;
  retrievedAt: string;
  matchType: CharacterNameMatchType;
  role: string | null;
  gender: string | null;
  picture: string | null;
  /** Missing appearance metadata is unknown; never evidence of nonappearance. */
  episodeAppearancesRaw: string | null;
  episodeEvidence: CharacterEpisodeEvidence;
  voiceActor: {
    id: number | null;
    name: string;
    picture: string | null;
  } | null;
}

export interface CharacterSearchResult {
  query: string;
  scope: "one_anidb_anime";
  sourceAnimeId: number;
  sourceAnimeTitle: string;
  reportedCharacterCount: number;
  totalMatches: number;
  results: CharacterSearchMatch[];
}

export function findCharactersInAnime(
  anime: AnimeRecord,
  query: string,
  limit = 10
): CharacterSearchResult {
  const trimmed = query.trim();
  if (trimmed.length < 2 || trimmed.length > 120) {
    throw new RangeError("Character name query must contain 2–120 characters");
  }
  if (!Number.isInteger(limit) || limit < 1 || limit > 25) {
    throw new RangeError("Character search limit must be an integer between 1 and 25");
  }
  const normalizedQuery = normalizeAniDbTitle(trimmed);
  if (normalizedQuery.length < 2) {
    throw new RangeError("Character name query contains no meaningful characters");
  }

  const evidence = anime.provenance.find(p =>
    p.provider === "anidb" && p.providerId === String(anime.id)
  );
  if (!evidence) {
    throw new Error("Character search requires matching AniDB source provenance");
  }

  const matches: CharacterSearchMatch[] = [];
  for (const character of anime.characters) {
    const normalizedName = normalizeAniDbTitle(character.name);
    let matchType: CharacterNameMatchType | null = null;
    if (character.name === trimmed) matchType = "exact";
    else if (normalizedName === normalizedQuery) matchType = "normalized";
    else if (normalizedName.startsWith(normalizedQuery)) matchType = "prefix";
    else if (
      [...normalizedQuery].length >= 3 &&
      normalizedName.includes(normalizedQuery)
    ) {
      matchType = "contains";
    }

    if (!matchType) continue;
    matches.push({
      anidbCharacterId: character.id,
      characterName: character.name,
      characterUrl: `https://anidb.net/character/${character.id}`,
      sourceAnimeId: anime.id,
      sourceAnimeTitle: anime.preferredTitle,
      sourceAnimeUrl: `https://anidb.net/anime/${anime.id}`,
      evidenceSourceUrl: evidence.sourceUrl,
      retrievedAt: evidence.retrievedAt,
      matchType,
      role: character.role,
      gender: character.gender,
      picture: character.picture,
      episodeAppearancesRaw: character.episodeAppearancesRaw,
      episodeEvidence: normalizeCharacterEpisodeAppearances(anime, character.episodeAppearancesRaw),
      voiceActor: character.voiceActor
    });
  }

  // An exact hit should not drag unrelated substring/prefix names with it.
  // Keep multiple separate AniDB character IDs even when names are identical.
  const rank: Record<CharacterNameMatchType, number> = {
    exact: 0, normalized: 1, prefix: 2, contains: 3
  };
  const best = Math.min(...matches.map(m => rank[m.matchType]));
  const bestMatches = matches
    .filter(m => rank[m.matchType] === best)
    .sort((a, b) => a.anidbCharacterId - b.anidbCharacterId);

  return {
    query: trimmed,
    scope: "one_anidb_anime",
    sourceAnimeId: anime.id,
    sourceAnimeTitle: anime.preferredTitle,
    reportedCharacterCount: anime.characters.length,
    totalMatches: bestMatches.length,
    results: bestMatches.slice(0, limit)
  };
}
