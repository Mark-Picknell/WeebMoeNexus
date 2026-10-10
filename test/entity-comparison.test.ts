import assert from "node:assert/strict";
import test from "node:test";
import { entityComparisonResultSchema, type EntityAssertion } from "../src/domain/entity-comparison.js";
import { ProviderLookupError } from "../src/domain/provider-error.js";
import { mapAniDbAnimeXml } from "../src/providers/anidb/mapper.js";
import { compareAnimeEntities, compareEntityOccurrences, entityOccurrencesFromAnime } from "../src/services/entity-comparison-service.js";

// Entirely synthetic XML and character/contributor IDs. The real source work
// name/ID is a collision guardrail, not a claim of live AniDB character data.
const at = "2026-10-10T18:30:00.000Z";
const viper = mapAniDbAnimeXml(`<anime id="1725"><titles><title type="main">Viper GTS</title><title type="official">Viper -GTS-</title></titles>
  <creators><name id="500" type="Direction">Sample Performer</name><name id="500" type="Script"/><name id="501" type="Animation">Sample Performer</name></creators>
  <characters><character id="500"><name>Carrera</name><seiyuu id="500">Sample Performer</seiyuu></character></characters></anime>`, at);
const other = mapAniDbAnimeXml(`<anime id="9800"><titles><title type="main">That Time I Got Reincarnated as a Slime</title></titles>
  <characters><character id="501"><name>Carrera</name></character></characters></anime>`, at);
const pool = () => [...entityOccurrencesFromAnime(other), ...entityOccurrencesFromAnime(viper)];
const input = { anidbIds: [9800, 1725], query: "Carrera" };

test("explicit Viper work context outranks a homonym in another work without special-cased IDs", () => {
  const result = compareEntityOccurrences({ ...input, workTitle: "Viper GTS" }, pool());
  assert.ok(entityComparisonResultSchema.safeParse(result).success);
  assert.equal(result.resolution, "unique_in_examined_records");
  assert.equal(result.matchedCount, 1);
  assert.equal(result.conflictingCount, 1);
  assert.equal(result.candidates[0]!.occurrence.sourceAnimeId, 1725);
  const conflict = result.candidates[1]!;
  assert.equal(conflict.occurrence.sourceAnimeId, 9800);
  assert.equal(conflict.checks.find(c => c.field === "workTitle")!.reason, "different_source_work");
  // The same mechanism must work on arbitrary work/name combinations.
  const arbitrary = mapAniDbAnimeXml('<anime id="333"><titles><title type="main">Different Story</title></titles><characters><character id="900"><name>Carrera</name></character></characters></anime>', at);
  assert.equal(compareEntityOccurrences({ anidbIds: [333], query: "Carrera", workTitle: "Different Story" }, entityOccurrencesFromAnime(arbitrary)).matchedCount, 1);
});

test("bare homonyms and source occurrences remain ambiguous even when output limit hides candidates", () => {
  const result = compareEntityOccurrences({ ...input, limit: 1 }, pool());
  assert.equal(result.totalNameCandidates, 2);
  assert.equal(result.matchedCount, 2);
  assert.equal(result.resolution, "ambiguous");
  assert.equal(result.truncated, true);
  assert.equal(result.candidates.length, 1);
  assert.equal(compareEntityOccurrences(input, pool().reverse()).resolution, "ambiguous");
  const reused = structuredClone(other);
  reused.characters[0]!.id = 500;
  const occurrences = [...entityOccurrencesFromAnime(viper), ...entityOccurrencesFromAnime(reused)];
  assert.equal(compareEntityOccurrences(input, occurrences).totalNameCandidates, 2, "same source entity ID in two works retains both observations");
});

test("Viper/Carrera/succubus stays incomplete when AniDB species evidence is missing", () => {
  const result = compareEntityOccurrences({ ...input, workTitle: "Viper GTS", species: "Succubus" }, pool());
  assert.equal(result.resolution, "incomplete");
  assert.equal(result.matchedCount, 0);
  assert.equal(result.unverifiedCount, 1);
  assert.equal(result.conflictingCount, 1);
  assert.equal(result.candidates[0]!.occurrence.sourceAnimeId, 1725);
  const species = result.candidates[0]!.checks.find(c => c.field === "species")!;
  assert.equal(species.status, "unknown");
  assert.deepEqual(species.evidence, []);
});

function assertion(value: string, polarity: EntityAssertion["polarity"] = "positive"): EntityAssertion {
  return { value, polarity, sourceUrl: "https://example.test/synthetic-evidence", retrievedAt: at, sourceField: "synthetic-contract-fixture" };
}

test("synthetic assertion contract accepts explicit species evidence without inventing taxonomy", () => {
  const occurrences = pool();
  occurrences.find(c => c.kind === "character" && c.sourceAnimeId === 1725)!.species = [assertion("Succubus")];
  occurrences.find(c => c.kind === "character" && c.sourceAnimeId === 9800)!.species = [assertion("Demon")];
  const result = compareEntityOccurrences({ ...input, species: "succubus" }, occurrences);
  assert.equal(result.matchedCount, 1);
  assert.equal(result.unverifiedCount, 1, "Demon is not an explicit denial of Succubus");
  assert.equal(result.resolution, "incomplete");
  const viperCandidate = result.candidates.find(c => c.occurrence.sourceAnimeId === 1725)!;
  assert.equal(viperCandidate.checks.find(c => c.field === "species")!.evidence[0]!.sourceUrl, "https://example.test/synthetic-evidence");
});

test("explicit negative and disagreeing assertions remain visible conflicts", () => {
  for (const assertions of [[assertion("Succubus", "negative")], [assertion("Succubus"), assertion("Succubus", "negative")]]) {
    const occurrence = entityOccurrencesFromAnime(viper).find(c => c.kind === "character")!;
    occurrence.species = assertions;
    const result = compareEntityOccurrences({ anidbIds: [1725], query: "Carrera", species: "Succubus" }, [occurrence]);
    assert.equal(result.conflictingCount, 1);
    assert.equal(result.matchedCount, 0);
    assert.equal(result.candidates[0]!.checks.find(c => c.field === "species")!.evidence.length, assertions.length);
  }
});

test("source names and title aliases normalize without guessed character aliases or name-order swaps", () => {
  const result = compareEntityOccurrences({ ...input, query: "ＣＡＲＲＥＲＡ!", workTitle: "VIPER -GTS-" }, pool());
  assert.equal(result.matchedCount, 1);
  assert.equal(result.candidates[0]!.nameMatch, "normalized");
  assert.equal(compareEntityOccurrences({ ...input, query: "Carr" }, pool()).totalNameCandidates, 0);
  const names = mapAniDbAnimeXml('<anime id="22"><creators><name id="8">Yuu Asakawa</name><name id="9">Asakawa Yuu</name></creators></anime>', at);
  const found = compareEntityOccurrences({ anidbIds: [22], kind: "contributor", query: "Yuu Asakawa" }, entityOccurrencesFromAnime(names));
  assert.deepEqual(found.candidates.map(c => c.occurrence.entityId), [8]);
  assert.equal(compareEntityOccurrences({ ...input, alias: "カレラ" }, pool()).unverifiedCount, 2);
});

test("synthetic alias assertions support matching but do not silently rewrite the primary source name", () => {
  const occurrence = entityOccurrencesFromAnime(viper).find(c => c.kind === "character")!;
  occurrence.aliases = [assertion("カレラ")];
  const result = compareEntityOccurrences({ anidbIds: [1725], query: "カレラ", alias: "カレラ" }, [occurrence]);
  assert.equal(result.matchedCount, 1);
  assert.equal(result.candidates[0]!.occurrence.names[0]!.value, "Carrera");
  assert.equal(result.candidates[0]!.checks[0]!.evidence[0]!.sourceField, "synthetic-contract-fixture");
});

test("creator and character namespaces never merge; same creator ID preserves every production/voice row", () => {
  const occurrences = entityOccurrencesFromAnime(viper);
  const result = compareEntityOccurrences({ anidbIds: [1725], kind: "contributor", query: "Sample Performer" }, occurrences);
  assert.equal(result.resolution, "ambiguous");
  assert.deepEqual(result.candidates.map(c => c.occurrence.entityId), [500, 501]);
  const contributor = result.candidates[0]!.occurrence;
  assert.equal(contributor.namespace, "anidb_creator");
  assert.deepEqual(contributor.credits.map(c => [c.kind, c.role, c.characterId]), [["production", "Direction", null], ["production", "Script", null], ["voice", null, 500]]);
  assert.ok(contributor.names.every(n => n.sourceUrl === "https://anidb.net/anime/1725" && n.retrievedAt === at));
  assert.equal(compareEntityOccurrences({ anidbIds: [1725], kind: "character", query: "Carrera" }, occurrences).candidates[0]!.occurrence.namespace, "anidb_character");
});

test("missing source IDs remain separate unverified credit rows, never a name-based identity merge", () => {
  const anime = mapAniDbAnimeXml('<anime id="3"><creators><name type="Direction">Same Name</name><name type="Script">Same Name</name></creators></anime>', at);
  const result = compareEntityOccurrences({ anidbIds: [3], kind: "contributor", query: "Same Name" }, entityOccurrencesFromAnime(anime));
  assert.equal(result.unverifiedCount, 2);
  assert.equal(result.resolution, "incomplete");
  assert.equal(new Set(result.candidates.map(c => c.occurrence.occurrenceKey)).size, 2);
  assert.ok(result.candidates.every(c => c.occurrence.entityId === null));
});

test("generated name/title display fallbacks cannot become source-authored match evidence", () => {
  const anime = mapAniDbAnimeXml('<anime id="3"><characters><character id="5"/><character id="6"><name>Named</name></character><character id="6"><name>Second Name</name></character></characters></anime>', at);
  const occurrences = entityOccurrencesFromAnime(anime);
  assert.equal(occurrences.length, 1);
  assert.equal(occurrences[0]!.names.length, 2, "repeated source ID preserves both name rows");
  const result = compareEntityOccurrences({ anidbIds: [3], query: "Named", workTitle: "AniDB #3" }, occurrences);
  assert.equal(result.unverifiedCount, 1);
  assert.equal(result.candidates[0]!.occurrence.sourceAnimeTitle, null);
  assert.deepEqual(result.candidates[0]!.checks.find(c => c.field === "workTitle")!.evidence, []);
});

test("bounded source reads are sequential and stop at the first failure without returning false completeness", async () => {
  let active = 0;
  const reads: number[] = [];
  const reader = { async getByAniDbId(id: number) {
    assert.equal(active, 0); active++; reads.push(id);
    await Promise.resolve(); active--;
    if (id === 9800) throw new ProviderLookupError({ code: "banned", reason: "api_error", message: "Synthetic ban", httpStatus: 200, apiCode: null });
    return viper;
  } };
  await assert.rejects(() => compareAnimeEntities({ anidbIds: [1725, 9800, 9999], query: "Carrera" }, reader), ProviderLookupError);
  assert.deepEqual(reads, [1725, 9800]);
  const success = await compareAnimeEntities(input, { async getByAniDbId(id) { return id === 1725 ? viper : other; } });
  assert.equal(success.matchedCount, 2);
});

test("invalid bounds/constraints reject before reads; mismatched records produce sanitized provider errors", async () => {
  let calls = 0;
  const reader = { async getByAniDbId() { calls++; return viper; } };
  for (const invalid of [{ anidbIds: [] }, { anidbIds: [1, 1] }, { anidbIds: [1, 2, 3, 4, 5, 6] }, { query: "!?" }, { species: "!!" }, { alias: "?" }, { limit: 26 }]) {
    await assert.rejects(() => compareAnimeEntities({ ...input, ...invalid }, reader));
  }
  assert.equal(calls, 0);
  await assert.rejects(() => compareAnimeEntities({ anidbIds: [99], query: "Carrera" }, reader), (e: unknown) => {
    assert.ok(e instanceof ProviderLookupError); assert.equal(e.details.reason, "invalid_response"); return true;
  });
  const bad = structuredClone(viper); bad.provenance[0]!.sourceUrl = "https://example.test/private";
  await assert.rejects(() => compareAnimeEntities({ anidbIds: [1725], query: "Carrera" }, { async getByAniDbId() { return bad; } }), (e: unknown) => {
    assert.ok(e instanceof ProviderLookupError); assert.equal(e.message.includes("private"), false); return true;
  });
});

test("duplicate occurrence keys, unexpected sources and namespace confusion reject inconsistent pools", () => {
  const occurrence = entityOccurrencesFromAnime(viper)[0]!;
  assert.throws(() => compareEntityOccurrences(input, [occurrence, occurrence]), /Duplicate/);
  assert.throws(() => compareEntityOccurrences({ anidbIds: [99], query: "Carrera" }, [occurrence]), /unrequested/);
  assert.throws(() => compareEntityOccurrences(input, [{ ...occurrence, namespace: "anidb_creator" }]), /namespace/);
});
