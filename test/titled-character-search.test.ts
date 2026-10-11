import assert from "node:assert/strict";
import test from "node:test";
import { mapAniDbAnimeXml } from "../src/providers/anidb/mapper.js";
import { parseAniDbTitleXml } from "../src/providers/anidb/title-index.js";
import { searchAniDbTitles } from "../src/services/title-search-service.js";
import { searchCharactersInUniqueTitledAnime } from "../src/services/titled-character-search-service.js";
import { titledCharacterSearchInputSchema, titledCharacterSearchResultSchema } from "../src/domain/titled-character-search.js";

const index = parseAniDbTitleXml(`<animetitles>
  <anime aid="1725"><title xml:lang="en" type="main">Viper GTS</title></anime>
  <anime aid="80"><title xml:lang="en" type="main">Macross</title></anime>
  <anime aid="81"><title xml:lang="en" type="main">Macross</title></anime>
</animetitles>`);
const titleReader = { search: async (q: string, limit: number) => searchAniDbTitles(index, q, limit) };
const now = "2026-10-11T04:00:00Z";
const anime = mapAniDbAnimeXml(`<anime id="1725"><titles><title type="main">Viper GTS</title></titles>
  <characters><character id="7"><name>Carrera</name></character>
  <character id="8"><name>Carrera</name></character>
  <character id="9"><name>Carrera Child</name></character></characters></anime>`, now);

test("unique literal work selects exactly its reported source characters with separate IDs", async () => {
  const reads: number[] = [];
  const result = await searchCharactersInUniqueTitledAnime(
    { animeTitle: "Viper GTS", characterName: "Carrera", limit: 2 }, titleReader,
    { getByAniDbId: async id => { reads.push(id); return anime; } }
  );
  assert.deepEqual(reads, [1725]);
  assert.equal(result.status, "unique_work_searched");
  assert.equal(result.titleMatchCount, 1);
  assert.equal(result.workCandidates[0]!.matchedTitle, "Viper GTS");
  assert.equal(result.selectedAnimeId, 1725);
  assert.equal(result.characterSearch!.totalNameMatches, 3);
  assert.equal(result.characterSearch!.truncated, true);
  assert.deepEqual(result.characterSearch!.results.map(x => x.anidbCharacterId), [7, 8]);
  assert.ok(titledCharacterSearchResultSchema.safeParse(result).success);
});

test("normalization is permitted but reported same-name works must not trigger source reads", async () => {
  let reads = 0;
  const reader = { getByAniDbId: async () => { reads++; return anime; } };
  const unique = await searchCharactersInUniqueTitledAnime(
    { animeTitle: "VIPER_GTS", characterName: "Carrera" }, titleReader, reader
  );
  assert.equal(unique.status, "unique_work_searched");
  const ambiguous = await searchCharactersInUniqueTitledAnime(
    { animeTitle: "Macross", characterName: "Carrera" }, titleReader, reader
  );
  assert.equal(ambiguous.status, "ambiguous_work_requires_selection");
  assert.equal(ambiguous.titleMatchCount, 2);
  assert.deepEqual(ambiguous.workCandidates.map(c => c.anidbId), [80, 81]);
  assert.equal(ambiguous.characterSearch, null);
  assert.equal(ambiguous.selectedAnimeId, null);
  assert.equal(reads, 1);
});

test("no title match remains unverified, not a global nonexistence claim", async () => {
  let reads = 0;
  const result = await searchCharactersInUniqueTitledAnime(
    { animeTitle: "Unknown show", characterName: "Carrera" }, titleReader,
    { getByAniDbId: async () => { reads++; return anime; } }
  );
  assert.equal(result.status, "no_local_work_match");
  assert.equal(result.titleMatchCount, 0);
  assert.deepEqual(result.workCandidates, []);
  assert.equal(reads, 0);
});

test("even a lone fuzzy work match requires caller confirmation before source fetch", async () => {
  const title = searchAniDbTitles(index, "Viper GTS", 25).results[0]!;
  let reads = 0;
  const result = await searchCharactersInUniqueTitledAnime(
    { animeTitle: "Viper GTS", characterName: "Carrera" },
    { search: async () => ({ query: "Viper GTS", totalMatches: 1, results: [{ ...title, matchType: "fuzzy", editDistance: 1 }] }) },
    { getByAniDbId: async () => { reads++; return anime; } }
  );
  assert.equal(result.status, "fuzzy_work_requires_selection");
  assert.equal(result.selectedAnimeId, null);
  assert.equal(reads, 0);
});

test("all validation occurs before index or upstream calls", async () => {
  let titleReads = 0, animeReads = 0;
  const reader = { search: async (q: string, limit: number) => { titleReads++; return searchAniDbTitles(index, q, limit); } };
  const animeReader = { getByAniDbId: async () => { animeReads++; return anime; } };
  for (const input of [
    { animeTitle: "?", characterName: "Carrera" },
    { animeTitle: "Viper GTS", characterName: "??" },
    { animeTitle: "Viper GTS", characterName: "Carrera", limit: 26 }
  ]) {
    await assert.rejects(searchCharactersInUniqueTitledAnime(input, reader, animeReader));
  }
  assert.equal(titleReads, 0);
  assert.equal(animeReads, 0);
  assert.equal(titledCharacterSearchInputSchema.safeParse({ animeTitle: "Viper GTS", characterName: "Carrera", allowFuzzyAutoSelect: true }).success, false);
});

test("malformed title index results fail before API calls rather than inferring source identity", async () => {
  let reads = 0;
  const malformed = { search: async () => ({ query: "Viper GTS", totalMatches: 1, results: [
    { anidbId: -1, title: "bad", matchedTitle: "bad", matchedLanguage: "en", matchedKind: "main", matchType: "exact" as const, sourceUrl: "https://anidb.net/anime/-1" }
  ] }) };
  await assert.rejects(searchCharactersInUniqueTitledAnime(
    { animeTitle: "Viper GTS", characterName: "Carrera" }, malformed,
    { getByAniDbId: async () => { reads++; return anime; } }
  ));
  assert.equal(reads, 0);
});
