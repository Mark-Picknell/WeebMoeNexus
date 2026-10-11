import type { AnimeRecord } from "../domain/anime.js";
import {
  titledCharacterSearchInputSchema, titledCharacterSearchResultSchema,
  titleCandidateSchema,
  type TitledCharacterSearchInput, type TitledCharacterSearchResult
} from "../domain/titled-character-search.js";
import type { AnimeTitleSearchResult } from "./title-search-service.js";
import { searchCharactersAcrossSelectedAnime } from "./selected-character-search-service.js";
import { normalizeAniDbTitle } from "../providers/anidb/title-normalization.js";

/**
 * Bridge a *local* title lookup to an already implemented bounded source
 * character search. Never guess among multiple work IDs or silently follow
 * fuzzy title candidates to an upstream provider.
 */
export async function searchCharactersInUniqueTitledAnime(
  raw: TitledCharacterSearchInput,
  titleReader: { search(query: string, limit: number): Promise<AnimeTitleSearchResult> },
  animeReader: { getByAniDbId(id: number): Promise<AnimeRecord> }
): Promise<TitledCharacterSearchResult> {
  const input = titledCharacterSearchInputSchema.parse(raw);
  if ([...normalizeAniDbTitle(input.animeTitle)].length < 2 ||
      [...normalizeAniDbTitle(input.characterName)].length < 2) {
    throw new RangeError("Title and character queries each need two meaningful characters");
  }

  // Validate before local index reads; no network read happens during title search.
  const titleHits = await titleReader.search(input.animeTitle, 25);
  if (!Number.isSafeInteger(titleHits.totalMatches) || titleHits.totalMatches < titleHits.results.length ||
      titleHits.totalMatches < 0 || titleHits.results.length > 25) {
    throw new Error("Local title search returned invalid result counts");
  }
  const candidates = titleHits.results.map(x => titleCandidateSchema.parse(x));
  if (new Set(candidates.map(c => c.anidbId)).size !== candidates.length) {
    throw new Error("Local title search returned duplicate work IDs");
  }
  const chosen = titleHits.totalMatches === 1 ? candidates[0] : undefined;
  const status: TitledCharacterSearchResult["status"] =
    titleHits.totalMatches === 0 ? "no_local_work_match"
    : titleHits.totalMatches > 1 ? "ambiguous_work_requires_selection"
    : !chosen || chosen.matchType === "fuzzy" ? "fuzzy_work_requires_selection"
    : "unique_work_searched";

  const characterSearch = status === "unique_work_searched" && chosen
    ? await searchCharactersAcrossSelectedAnime({
        anidbIds: [chosen.anidbId], query: input.characterName, limit: input.limit
      }, animeReader)
    : null;
  return titledCharacterSearchResultSchema.parse({
    scope: "local_title_index_to_one_anidb_work",
    animeTitleQuery: input.animeTitle,
    characterNameQuery: input.characterName,
    titleMatchCount: titleHits.totalMatches,
    workCandidates: candidates,
    status,
    selectedAnimeId: characterSearch?.sourceAnimeId ?? null,
    characterSearch
  });
}
