import { animeRecordSchema, type AnimeRecord } from "../domain/anime.js";
import { ProviderLookupError } from "../domain/provider-error.js";
import {
  sharedContributorInputSchema, sharedContributorResultSchema,
  type SharedContributorInput, type SharedContributorResult
} from "../domain/shared-contributors.js";
import { normalizeAniDbTitle } from "../providers/anidb/title-normalization.js";

type Row = SharedContributorResult["results"][number]["credits"][number];
type Group = { contributorId: number; credits: Row[]; sourceAnimeIds: Set<number>; names: Set<string> };

/** All matching source evidence comes from caller-selected work records only. */
export function findSharedContributorsInRecords(
  raw: SharedContributorInput,
  records: AnimeRecord[]
): SharedContributorResult {
  const input = sharedContributorInputSchema.parse(raw);
  if (records.length !== input.anidbIds.length ||
      records.some((record, i) => record.id !== input.anidbIds[i])) {
    throw new Error("All and only requested source anime records must be supplied in order");
  }
  const groups = new Map<number, Group>();
  const nameToIds = new Map<string, Set<number>>();
  let reportedCreditRows = 0;
  let unresolvedIdCreditRows = 0;

  for (const rawAnime of records) {
    const anime = animeRecordSchema.parse(rawAnime);
    const provenance = anime.provenance.find(p =>
      p.provider === "anidb" && p.providerId === String(anime.id) &&
      p.sourceUrl === `https://anidb.net/anime/${anime.id}` &&
      Number.isFinite(Date.parse(p.retrievedAt))
    );
    if (!provenance) throw new Error("Source record lacks matching AniDB provenance");

    const common = {
      sourceAnimeId: anime.id,
      sourceAnimeTitle: anime.titles.length ? anime.preferredTitle : null,
      sourceUrl: provenance.sourceUrl,
      retrievedAt: provenance.retrievedAt
    };

    function accept(id: number | null, row: Row): void {
      reportedCreditRows++;
      if (reportedCreditRows > 2000) throw new RangeError("Source credit pool exceeds 2,000 rows");
      if (id === null) { unresolvedIdCreditRows++; return; }
      const group = groups.get(id) ?? {
        contributorId: id, credits: [], sourceAnimeIds: new Set<number>(), names: new Set<string>()
      };
      group.credits.push(row);
      group.sourceAnimeIds.add(anime.id);
      const name = row.contributorName?.trim();
      if (name) {
        group.names.add(name);
        const normalized = normalizeAniDbTitle(name);
        if (normalized) {
          const ids = nameToIds.get(normalized) ?? new Set<number>();
          ids.add(id);
          nameToIds.set(normalized, ids);
        }
      }
      groups.set(id, group);
    }

    anime.creators.forEach((credit, i) => {
      accept(credit.id, {
        ...common, sourceField: `creators[${i}]`, type: "production",
        contributorName: credit.name, reportedRole: credit.role,
        characterId: null, characterName: null
      });
    });
    anime.characters.forEach((character, i) => {
      if (!character.voiceActor) return;
      accept(character.voiceActor.id, {
        ...common, sourceField: `characters[${i}].voiceActor`, type: "voice",
        contributorName: character.voiceActor.name,
        reportedRole: null, characterId: character.id,
        characterName: character.name === `AniDB character #${character.id}` ? null : character.name
      });
    });
  }

  const shared = [...groups.values()].filter(group => group.sourceAnimeIds.size >= 2)
    .sort((a, b) => b.sourceAnimeIds.size - a.sourceAnimeIds.size || a.contributorId - b.contributorId);
  const results = shared.slice(0, input.limit).map(group => {
    const reportedNames = [...group.names].sort((a, b) => a.localeCompare(b, "en"));
    return {
      anidbContributorId: group.contributorId,
      contributorUrl: `https://anidb.net/creator/${group.contributorId}`,
      reportedNames,
      nameVariance: new Set(reportedNames.map(normalizeAniDbTitle)).size > 1
        ? "different_reported_names" as const : "consistent_or_unreported" as const,
      sourceWorkCount: group.sourceAnimeIds.size,
      sourceAnimeIds: input.anidbIds.filter(id => group.sourceAnimeIds.has(id)),
      credits: group.credits
    };
  });

  return sharedContributorResultSchema.parse({
    scope: "explicit_selected_anidb_works",
    examinedAnimeIds: input.anidbIds,
    reportedCreditRows,
    unresolvedIdCreditRows,
    distinctNamedIdCollisionCount: [...nameToIds.values()].filter(ids => ids.size > 1).length,
    sharedContributorCount: shared.length,
    truncated: shared.length > input.limit,
    results
  });
}

/** Sequential reads preserve provider errors; no unrequested or parallel lookups. */
export async function findSharedContributors(
  raw: SharedContributorInput,
  reader: { getByAniDbId(id: number): Promise<AnimeRecord> }
): Promise<SharedContributorResult> {
  const input = sharedContributorInputSchema.parse(raw);
  const records: AnimeRecord[] = [];
  for (const id of input.anidbIds) {
    const anime = await reader.getByAniDbId(id);
    try {
      if (anime.id !== id) throw new Error("Mismatched source ID");
      records.push(animeRecordSchema.parse(anime));
    } catch {
      throw new ProviderLookupError({
        code: "unavailable", reason: "invalid_response",
        message: "Shared contributor comparison received an invalid requested source record. No retry was attempted.",
        httpStatus: null, apiCode: null
      });
    }
  }
  try {
    return findSharedContributorsInRecords(input, records);
  } catch {
    throw new ProviderLookupError({
      code: "unavailable", reason: "invalid_response",
      message: "Shared contributor comparison could not verify source evidence. No retry was attempted.",
      httpStatus: null, apiCode: null
    });
  }
}
