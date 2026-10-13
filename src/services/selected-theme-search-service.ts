import { animeRecordSchema, type AnimeRecord } from "../domain/anime.js";
import { ProviderLookupError } from "../domain/provider-error.js";
import { normalizeAniDbTitle } from "../providers/anidb/title-normalization.js";
import {
  selectedThemeSearchInputSchema, selectedThemeSearchResultSchema,
  type SelectedThemeSearchInput, type ParsedSelectedThemeSearchInput, type SelectedThemeSearchResult
} from "../domain/selected-theme-search.js";

function parse(raw: SelectedThemeSearchInput): ParsedSelectedThemeSearchInput {
  const input = selectedThemeSearchInputSchema.parse(raw);
  if ([...normalizeAniDbTitle(input.query)].length < 2) {
    throw new RangeError("Theme search needs two meaningful characters");
  }
  return input;
}
type Match = SelectedThemeSearchResult["results"][number];
const rank = { exact: 0, normalized: 1, prefix: 2, contains: 3 } satisfies Record<Match["matchType"], number>;

/**
 * Search strictly source-reported AniDB anime-wide tag/category labels among
 * explicitly supplied works. Never parse a description into inferred tropes
 * or treat omitted labels as a negative statement about a work's themes.
 */
export function searchSelectedThemeRecords(
  raw: SelectedThemeSearchInput, records: AnimeRecord[]
): SelectedThemeSearchResult {
  const input = parse(raw);
  if (records.length !== input.anidbIds.length ||
      records.some((r,i) => r.id !== input.anidbIds[i])) {
    throw new Error("Selected source records must match requested work IDs and order");
  }
  const query = normalizeAniDbTitle(input.query);
  let totalReportedTagRows = 0, totalReportedCategoryRows = 0;
  let excludedKnownSpoilerRows = 0;
  const coverageGaps: SelectedThemeSearchResult["coverageGaps"] = [];
  const matches: Match[] = [];
  for (const record of records) {
    const anime = animeRecordSchema.parse(record);
    const p = anime.provenance.find(p =>
      p.provider === "anidb" && p.providerId === String(anime.id) &&
      p.sourceUrl === `https://anidb.net/anime/${anime.id}` &&
      Number.isFinite(Date.parse(p.retrievedAt))
    );
    if (!p) throw new Error("Selected source record lacks matching AniDB provenance");
    const sourceUrl = p.sourceUrl, retrievedAt = p.retrievedAt;
    const missingArrays: ("tags" | "categories")[] = [];
    if (anime.tags === undefined) missingArrays.push("tags");
    if (anime.categories === undefined) missingArrays.push("categories");
    if (missingArrays.length) coverageGaps.push({sourceAnimeId: anime.id, missingArrays});
    totalReportedTagRows += anime.tags?.length ?? 0;
    totalReportedCategoryRows += anime.categories?.length ?? 0;
    const title = anime.titles.length ? anime.preferredTitle : null;

    function collect(kind: Match["kind"], terms: {id: number | null; name: string | null;
      approval?: number | null; weight?: number | null;
      localSpoiler?: boolean | null; globalSpoiler?: boolean | null;
      restricted?: boolean | null}[] | undefined) {
      if (terms === undefined) return;
      terms.forEach((term, index) => {
        if (term.name === null) return;
        const sourceKey = normalizeAniDbTitle(term.name);
        const matchType: Match["matchType"] | null = term.name === input.query ? "exact"
          : sourceKey === query ? "normalized"
          : sourceKey.startsWith(query) ? "prefix"
          : [...query].length >= 3 && sourceKey.includes(query) ? "contains"
          : null;
        if (!matchType) return;
        if (!input.includeKnownSpoilers && (term.localSpoiler === true || term.globalSpoiler === true)) {
          excludedKnownSpoilerRows++;
          return;
        }
        matches.push({
          sourceAnimeId: anime.id,
          sourceAnimeTitle: title,
          sourceAnimeUrl: sourceUrl,
          retrievedAt: retrievedAt,
          kind, sourceRowIndex: index,
          evidenceSourceField: `${kind === "tag" ? "tags" : "categories"}[${index}].name`,
          sourceTermId: term.id, label: term.name, matchType,
          approval: term.approval ?? null, weight: term.weight ?? null,
          localSpoiler: term.localSpoiler ?? null,
          globalSpoiler: term.globalSpoiler ?? null,
          restrictedCategory: term.restricted ?? null
        });
      });
    }
    if (input.sourceKinds !== "categories") collect("tag", anime.tags);
    if (input.sourceKinds !== "tags") collect("category", anime.categories);
  }
  matches.sort((a,b) => rank[a.matchType] - rank[b.matchType] ||
    a.sourceAnimeId - b.sourceAnimeId ||
    (a.kind === b.kind ? 0 : a.kind === "tag" ? -1 : 1) ||
    a.sourceRowIndex - b.sourceRowIndex);
  return selectedThemeSearchResultSchema.parse({
    scope: "selected_anidb_anime_source_tags_and_categories_only",
    query: input.query, examinedAnimeIds: input.anidbIds,
    sourceKinds: input.sourceKinds, includeKnownSpoilers: input.includeKnownSpoilers,
    totalReportedTagRows, totalReportedCategoryRows,
    totalLabelMatches: matches.length, excludedKnownSpoilerRows,
    coverageGaps, truncated: matches.length > input.limit,
    results: matches.slice(0, input.limit)
  });
}

/** Source errors stop downstream reads; no background catalog scan or retries. */
export async function searchThemesAcrossSelectedAnime(raw: SelectedThemeSearchInput,
  reader: {getByAniDbId(id: number): Promise<AnimeRecord>}
): Promise<SelectedThemeSearchResult> {
  const input = parse(raw);
  const records: AnimeRecord[] = [];
  for (const id of input.anidbIds) {
    const record = await reader.getByAniDbId(id);
    try {
      if (record.id !== id) throw new Error("Unexpected selected source record ID");
      animeRecordSchema.parse(record);
      records.push(record);
    } catch {
      throw new ProviderLookupError({
        code: "unavailable", reason: "invalid_response",
        message: "Selected theme lookup could not validate a requested source record; no retry attempted.",
        httpStatus: null, apiCode: null
      });
    }
  }
  try { return searchSelectedThemeRecords(input, records); }
  catch {
    throw new ProviderLookupError({
      code: "unavailable", reason: "invalid_response",
      message: "Selected theme lookup could not validate source evidence; no retry attempted.",
      httpStatus: null, apiCode: null
    });
  }
}
