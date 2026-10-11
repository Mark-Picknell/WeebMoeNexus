import { animeRecordSchema, type AnimeRecord } from "../domain/anime.js";
import { ProviderLookupError } from "../domain/provider-error.js";
import {
  selectedCharacterSearchInputSchema, selectedCharacterSearchResultSchema,
  type SelectedCharacterSearchInput, type ParsedSelectedCharacterSearchInput,
  type SelectedCharacterSearchResult
} from "../domain/selected-character-search.js";
import { normalizeAniDbTitle } from "../providers/anidb/title-normalization.js";

function meaningful(value: string): string {
  const key = normalizeAniDbTitle(value);
  if ([...key].length < 2) throw new RangeError("Character and work title constraints need at least two meaningful characters");
  return key;
}

function parseRequest(raw: SelectedCharacterSearchInput): ParsedSelectedCharacterSearchInput {
  const input = selectedCharacterSearchInputSchema.parse(raw);
  meaningful(input.query);
  if (input.workTitle !== undefined) meaningful(input.workTitle);
  return input;
}

type Candidate = SelectedCharacterSearchResult["results"][number];
const nameRank: Record<Candidate["nameMatch"], number> = { exact: 0, normalized: 1, prefix: 2, contains: 3 };
const workRank: Record<Candidate["workTitleMatch"], number> = {
  reported_match: 0, not_reported: 1, different_source_work: 2, not_requested: 0
};

/**
 * Search ONLY the character-name rows reported by explicitly selected works.
 * Ranking is evidence-based within this bounded pool; no cross-work identity,
 * assumed species, character aliases, or global catalog completeness.
 */
export function searchSelectedCharacterRecords(
  raw: SelectedCharacterSearchInput, records: AnimeRecord[]
): SelectedCharacterSearchResult {
  const input = parseRequest(raw);
  if (records.length !== input.anidbIds.length || records.some((r, i) => r.id !== input.anidbIds[i])) {
    throw new Error("Selected source records must be complete and ordered exactly as requested");
  }
  const q = meaningful(input.query);
  const requestedTitle = input.workTitle === undefined ? null : meaningful(input.workTitle);
  const results: Candidate[] = [];
  let totalReportedCharacterRows = 0;

  for (const rawRecord of records) {
    const anime = animeRecordSchema.parse(rawRecord);
    const provenance = anime.provenance.find(p =>
      p.provider === "anidb" && p.providerId === String(anime.id) &&
      p.sourceUrl === `https://anidb.net/anime/${anime.id}` &&
      Number.isFinite(Date.parse(p.retrievedAt))
    );
    if (!provenance) throw new Error("Selected source record lacks matching AniDB provenance");
    totalReportedCharacterRows += anime.characters.length;

    const workTitleMatch: Candidate["workTitleMatch"] = requestedTitle === null ? "not_requested"
      : anime.titles.some(t => normalizeAniDbTitle(t.value) === requestedTitle) ? "reported_match"
      : anime.titles.length ? "different_source_work" : "not_reported";
    const sourceAnimeTitle = anime.titles.length ? anime.preferredTitle : null;

    anime.characters.forEach((character, sourceRowIndex) => {
      if (character.name === `AniDB character #${character.id}`) return; // Generated display label, not an authored name.
      const key = normalizeAniDbTitle(character.name);
      const nameMatch: Candidate["nameMatch"] | null = character.name === input.query ? "exact"
        : key === q ? "normalized"
        : key.startsWith(q) ? "prefix"
        : [...q].length >= 3 && key.includes(q) ? "contains"
        : null;
      if (!nameMatch) return;
      results.push({
        sourceAnimeId: anime.id, sourceAnimeTitle,
        sourceAnimeUrl: provenance.sourceUrl,
        anidbCharacterId: character.id,
        sourceRowIndex,
        characterName: character.name,
        characterUrl: `https://anidb.net/character/${character.id}`,
        evidenceSourceField: `characters[${sourceRowIndex}].name`,
        retrievedAt: provenance.retrievedAt,
        nameMatch, workTitleMatch, role: character.role, gender: character.gender,
        voiceActor: character.voiceActor
      });
    });
  }

  results.sort((a, b) => workRank[a.workTitleMatch] - workRank[b.workTitleMatch]
    || nameRank[a.nameMatch] - nameRank[b.nameMatch]
    || a.sourceAnimeId - b.sourceAnimeId || a.anidbCharacterId - b.anidbCharacterId
    || a.sourceRowIndex - b.sourceRowIndex);
  return selectedCharacterSearchResultSchema.parse({
    scope: "explicit_selected_anidb_works",
    query: input.query, requestedWorkTitle: input.workTitle ?? null,
    examinedAnimeIds: input.anidbIds,
    totalReportedCharacterRows,
    totalNameMatches: results.length,
    truncated: results.length > input.limit,
    results: results.slice(0, input.limit)
  });
}

/** Fail closed on a bad source record, read sequentially and never fetch unselected works. */
export async function searchCharactersAcrossSelectedAnime(
  raw: SelectedCharacterSearchInput,
  reader: { getByAniDbId(id: number): Promise<AnimeRecord> }
): Promise<SelectedCharacterSearchResult> {
  const input = parseRequest(raw); // Validate all constraints BEFORE any source reads.
  const records: AnimeRecord[] = [];
  for (const id of input.anidbIds) {
    const record = await reader.getByAniDbId(id);
    try {
      if (record.id !== id) throw new Error("Requested source ID mismatch");
      animeRecordSchema.parse(record);
      records.push(record);
    } catch {
      throw new ProviderLookupError({
        code: "unavailable", reason: "invalid_response",
        message: "Selected character search could not validate a requested source record. No retry was attempted.",
        httpStatus: null, apiCode: null
      });
    }
  }
  try {
    return searchSelectedCharacterRecords(input, records);
  } catch {
    throw new ProviderLookupError({
      code: "unavailable", reason: "invalid_response",
      message: "Selected character search could not validate source evidence. No retry was attempted.",
      httpStatus: null, apiCode: null
    });
  }
}
