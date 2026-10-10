import { animeRecordSchema, type AnimeRecord } from "../domain/anime.js";
import {
  entityComparisonInputSchema, entityComparisonResultSchema, entityOccurrenceSchema,
  type EntityAssertion, type EntityOccurrence, type EntityComparisonInput,
  type EntityComparisonResult
} from "../domain/entity-comparison.js";
import { ProviderLookupError } from "../domain/provider-error.js";
import { normalizeAniDbTitle } from "../providers/anidb/title-normalization.js";

function meaningful(value: string): string {
  const key = normalizeAniDbTitle(value);
  if ([...key].length < 2) throw new RangeError("Entity constraints need at least two meaningful characters");
  return key;
}

/** Project only fields already reported by a validated source anime record. */
export function entityOccurrencesFromAnime(raw: AnimeRecord): EntityOccurrence[] {
  const anime = animeRecordSchema.parse(raw);
  const source = anime.provenance.find(p => p.provider === "anidb" && p.providerId === String(anime.id));
  if (!source || source.sourceUrl !== `https://anidb.net/anime/${anime.id}` || !Number.isFinite(Date.parse(source.retrievedAt))) {
    throw new Error("Entity comparison requires matching AniDB source provenance");
  }
  const fact = (value: string, sourceField: string): EntityAssertion => ({
    value, sourceField, polarity: "positive", sourceUrl: source.sourceUrl, retrievedAt: source.retrievedAt
  });
  const workTitles = anime.titles.map((title, i) => fact(title.value, `titles[${i}]`));
  const make = (kind: EntityOccurrence["kind"], id: number | null, rowKey: string): EntityOccurrence => ({
    occurrenceKey: `${kind}:${id ?? rowKey}@anime:${anime.id}`,
    kind, namespace: kind === "character" ? "anidb_character" : "anidb_creator",
    entityId: id, sourceAnimeId: anime.id, sourceAnimeTitle: anime.titles.length ? anime.preferredTitle : null,
    sourceUrl: source.sourceUrl, retrievedAt: source.retrievedAt,
    names: [], workTitles, aliases: [], species: [], credits: []
  });
  const characters = new Map<number, EntityOccurrence>();
  anime.characters.forEach((character, i) => {
    // The existing mapper supplies this display fallback for missing names;
    // a generated label must not become a source-authored name assertion.
    if (character.name === `AniDB character #${character.id}`) return;
    const occurrence = characters.get(character.id) ?? make("character", character.id, "");
    occurrence.names.push(fact(character.name, `characters[${i}].name`));
    characters.set(character.id, occurrence);
  });
  const contributors: EntityOccurrence[] = [];
  const identified = new Map<number, EntityOccurrence>();
  function contributor(id: number | null, rowKey: string): EntityOccurrence {
    if (id !== null && identified.has(id)) return identified.get(id)!;
    const occurrence = make("contributor", id, rowKey);
    contributors.push(occurrence);
    if (id !== null) identified.set(id, occurrence);
    return occurrence;
  }
  anime.creators.forEach((credit, i) => {
    if (!credit.name && credit.id === null) return;
    const occurrence = contributor(credit.id, `production-row-${i}`);
    if (credit.name) occurrence.names.push(fact(credit.name, `creators[${i}].name`));
    occurrence.credits.push({ kind: "production", role: credit.role, characterId: null, sourceField: `creators[${i}]` });
  });
  anime.characters.forEach((character, i) => {
    const actor = character.voiceActor;
    if (!actor?.name.trim()) return;
    const occurrence = contributor(actor.id, `voice-row-${i}`);
    occurrence.names.push(fact(actor.name, `characters[${i}].voiceActor.name`));
    occurrence.credits.push({ kind: "voice", role: null, characterId: character.id, sourceField: `characters[${i}].voiceActor` });
  });
  // AniDB creators may be people or companies. Keep a contributor namespace;
  // a production role is not proof of personhood, kinship or an alias.
  return [...characters.values(), ...contributors.filter(c => c.names.length > 0)]
    .map(value => entityOccurrenceSchema.parse(value));
}

type Check = EntityComparisonResult["candidates"][number]["checks"][number];
function check(field: "name" | "workTitle" | "alias" | "species", requested: string, assertions: EntityAssertion[]): Check {
  const key = meaningful(requested);
  const same = assertions.filter(a => normalizeAniDbTitle(a.value) === key);
  const positive = same.some(a => a.polarity === "positive");
  const negative = same.some(a => a.polarity === "negative");
  if (positive && negative) return { field, requested, status: "conflicting", reason: "source_disagreement", evidence: same };
  if (negative) return { field, requested, status: "conflicting", reason: "explicit_negative", evidence: same };
  if (positive) return { field, requested, status: "matched", reason: "reported_match", evidence: same };
  if (field === "workTitle" && assertions.some(a => a.polarity === "positive")) {
    return { field, requested, status: "conflicting", reason: "different_source_work", evidence: assertions };
  }
  // A different reported species label is not a taxonomy-based contradiction.
  // Alias and species lists are not assumed exhaustive.
  return { field, requested, status: "unknown", reason: "not_reported", evidence: assertions };
}

/** Compare an explicit bounded pool; never claim global identity/catalog coverage. */
export function compareEntityOccurrences(input: EntityComparisonInput, raw: EntityOccurrence[]): EntityComparisonResult {
  const request = entityComparisonInputSchema.parse(input);
  meaningful(request.query);
  for (const value of [request.workTitle, request.alias, request.species]) if (value !== undefined) meaningful(value);
  const all = raw.map(value => entityOccurrenceSchema.parse(value));
  const keys = new Set<string>();
  for (const occurrence of all) {
    if (!request.anidbIds.includes(occurrence.sourceAnimeId)) throw new Error("Entity pool includes an unrequested source anime");
    if (keys.has(occurrence.occurrenceKey)) throw new Error("Duplicate source occurrence key");
    keys.add(occurrence.occurrenceKey);
  }
  const relevant = all.filter(value => value.kind === request.kind);
  const candidates: EntityComparisonResult["candidates"] = [];
  for (const occurrence of relevant) {
    const nameAssertions = [...occurrence.names, ...occurrence.aliases];
    const nameCheck = check("name", request.query, nameAssertions);
    // No prefix/fuzzy/token-order match establishes a candidate identity.
    if (nameCheck.status === "unknown") continue;
    const nameMatch = nameCheck.evidence.some(a => a.polarity === "positive" && a.value === request.query) ? "exact" : "normalized";
    const checks: Check[] = [nameCheck];
    if (occurrence.entityId === null) checks.push({ field: "identity", requested: "stable source ID", status: "unknown", reason: "missing_source_id", evidence: [] });
    if (request.workTitle !== undefined) checks.push(check("workTitle", request.workTitle, occurrence.workTitles));
    if (request.alias !== undefined) checks.push(check("alias", request.alias, occurrence.aliases));
    if (request.species !== undefined) checks.push(check("species", request.species, occurrence.species));
    const status = checks.some(c => c.status === "conflicting") ? "conflicting"
      : checks.some(c => c.status === "unknown") ? "unverified" : "matched";
    candidates.push({ occurrence, nameMatch, status, checks });
  }
  const rank = { matched: 0, unverified: 1, conflicting: 2 };
  candidates.sort((a, b) => rank[a.status] - rank[b.status] ||
    Number(a.nameMatch !== "exact") - Number(b.nameMatch !== "exact") ||
    a.occurrence.sourceAnimeId - b.occurrence.sourceAnimeId ||
    (a.occurrence.entityId ?? Number.MAX_SAFE_INTEGER) - (b.occurrence.entityId ?? Number.MAX_SAFE_INTEGER) ||
    a.occurrence.occurrenceKey.localeCompare(b.occurrence.occurrenceKey, "en"));
  const matchedCount = candidates.filter(c => c.status === "matched").length;
  const unverifiedCount = candidates.filter(c => c.status === "unverified").length;
  const conflictingCount = candidates.filter(c => c.status === "conflicting").length;
  const resolution = unverifiedCount > 0 ? "incomplete" : matchedCount > 1 ? "ambiguous"
    : matchedCount === 1 ? "unique_in_examined_records" : "no_match_in_examined_records";
  return entityComparisonResultSchema.parse({
    scope: "selected_anidb_records", query: request.query, kind: request.kind,
    examinedAnimeIds: request.anidbIds, reportedOccurrences: relevant.length,
    totalNameCandidates: candidates.length, matchedCount, unverifiedCount, conflictingCount,
    resolution, truncated: candidates.length > request.limit, candidates: candidates.slice(0, request.limit)
  });
}

/** Read only explicitly supplied records, sequentially, with no retries/related fetches. */
export async function compareAnimeEntities(
  input: EntityComparisonInput,
  reader: { getByAniDbId(id: number): Promise<AnimeRecord> }
): Promise<EntityComparisonResult> {
  const request = entityComparisonInputSchema.parse(input);
  meaningful(request.query);
  for (const value of [request.workTitle, request.alias, request.species]) if (value !== undefined) meaningful(value);
  const occurrences: EntityOccurrence[] = [];
  for (const id of request.anidbIds) {
    const anime = await reader.getByAniDbId(id);
    try {
      if (anime.id !== id) throw new Error("Source ID mismatch");
      occurrences.push(...entityOccurrencesFromAnime(anime));
    } catch {
      throw new ProviderLookupError({ code: "unavailable", reason: "invalid_response",
        message: "AniDB entity comparison could not validate a requested source record. No retry was attempted.",
        httpStatus: null, apiCode: null });
    }
  }
  return compareEntityOccurrences(request, occurrences);
}
