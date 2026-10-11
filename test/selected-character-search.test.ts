import assert from "node:assert/strict";
import test from "node:test";
import { mapAniDbAnimeXml } from "../src/providers/anidb/mapper.js";
import {
  searchSelectedCharacterRecords, searchCharactersAcrossSelectedAnime
} from "../src/services/selected-character-search-service.js";
import { selectedCharacterSearchResultSchema } from "../src/domain/selected-character-search.js";
import { ProviderLookupError } from "../src/domain/provider-error.js";

const stamp = "2026-10-11T04:00:00Z";
const viper = mapAniDbAnimeXml(`<anime id="1725"><titles><title type="main">Viper GTS</title><title type="official">Viper -GTS-</title></titles>
  <characters><character id="7"><name>Carrera</name><seiyuu id="8">Sample Actress</seiyuu></character>
  <character id="7"><name>Carrera</name></character><character id="9"><name>Carrera MK II</name></character>
  <character id="11"/><character id="12"><name>Special Carrera</name></character></characters></anime>`, stamp);
const other = mapAniDbAnimeXml(`<anime id="9800"><titles><title type="main">Different Anime</title></titles>
  <characters><character id="7"><name>Carrera</name></character><character id="13"><name>Carrera Other</name></character></characters></anime>`, stamp);
const input = { anidbIds: [9800, 1725], query: "Carrera" };

test("explicit work context outranks exact homonyms without merging identities", () => {
  const result = searchSelectedCharacterRecords({ ...input, workTitle: "Viper GTS" }, [other, viper]);
  assert.ok(selectedCharacterSearchResultSchema.safeParse(result).success);
  assert.equal(result.scope, "explicit_selected_anidb_works");
  assert.equal(result.totalNameMatches, 6);
  assert.equal(result.totalReportedCharacterRows, 7);
  assert.deepEqual(result.results.map(r => [r.sourceAnimeId, r.anidbCharacterId, r.nameMatch]),
    [[1725, 7, "exact"], [1725, 7, "exact"], [1725, 9, "prefix"], [1725, 12, "contains"], [9800, 7, "exact"], [9800, 13, "prefix"]]);
  assert.equal(result.results[0]?.sourceAnimeUrl, "https://anidb.net/anime/1725");
  assert.equal(result.results[0]?.characterUrl, "https://anidb.net/character/7");
  assert.equal(result.results[0]?.retrievedAt, stamp);
  assert.equal(result.results[0]?.evidenceSourceField, "characters[0].name");
  assert.equal(result.results[0]?.voiceActor?.name, "Sample Actress");
  assert.equal(result.results[4]?.workTitleMatch, "different_source_work");
});

test("name matching precedence and stable source row evidence survive equal IDs and punctuation normalization", () => {
  const normalized = searchSelectedCharacterRecords({ ...input, query: "CARRERA" }, [other, viper]);
  assert.equal(normalized.totalNameMatches, 6);
  assert.equal(normalized.results[0]!.nameMatch, "normalized");
  assert.deepEqual(normalized.results.filter(r => r.sourceAnimeId === 1725 && r.anidbCharacterId === 7)
    .map(r => r.sourceRowIndex), [0, 1]);
  assert.equal(searchSelectedCharacterRecords({ ...input, query: "Carr" }, [other, viper]).results[0]?.nameMatch, "prefix");
  assert.equal(searchSelectedCharacterRecords({ ...input, query: "special carrera" }, [other, viper]).totalNameMatches, 1);
  assert.equal(searchSelectedCharacterRecords({ ...input, query: "Karrera" }, [other, viper]).totalNameMatches, 0, "fuzzy identity guesses are not made");
});

test("counts, source grouping and match classes reflect whole pool before truncation", () => {
  const result = searchSelectedCharacterRecords({ ...input, limit: 1 }, [other, viper]);
  assert.equal(result.totalNameMatches, 6);
  assert.equal(result.truncated, true);
  assert.equal(result.results.length, 1);
  assert.equal(result.results[0]!.sourceAnimeId, 1725, "without work preference, source-ID sort is stable");
});

test("unreported work titles stay unknown and generated labels are not searchable facts", () => {
  const untitled = mapAniDbAnimeXml('<anime id="33"><characters><character id="7"><name>Carrera</name></character></characters></anime>', stamp);
  const result = searchSelectedCharacterRecords({ anidbIds: [33], query: "Carrera", workTitle: "Viper GTS" }, [untitled]);
  assert.equal(result.results[0]!.workTitleMatch, "not_reported");
  assert.equal(result.results[0]!.sourceAnimeTitle, null);
  assert.equal(searchSelectedCharacterRecords({ anidbIds: [1725], query: "AniDB character" }, [viper]).totalNameMatches, 0);
});

test("invalid inputs, misordered source IDs and unsupported metadata reject before fabricating results", () => {
  assert.throws(() => searchSelectedCharacterRecords(input, [viper, other]), /ordered/);
  assert.throws(() => searchSelectedCharacterRecords({ ...input, anidbIds: [1725, 1725] }, [viper, viper]));
  assert.throws(() => searchSelectedCharacterRecords({ ...input, query: "??" }, [other, viper]), RangeError);
  assert.throws(() => searchSelectedCharacterRecords({ ...input, workTitle: ".." }, [other, viper]), RangeError);
  const wrong = structuredClone(viper); wrong.provenance[0]!.providerId = "other";
  assert.throws(() => searchSelectedCharacterRecords({ anidbIds: [1725], query: "Carrera" }, [wrong]), /provenance/);
});

test("bounded reads remain sequential, fail closed, and stop on the first upstream failure", async () => {
  const reads: number[] = [];
  const reader = { getByAniDbId: async (id: number) => {
    reads.push(id);
    if (id === 9800) throw new ProviderLookupError({
      code: "banned", reason: "local_backoff", message: "Synthetic source ban",
      httpStatus: null, apiCode: null
    });
    return viper;
  } };
  await assert.rejects(searchCharactersAcrossSelectedAnime({ anidbIds: [1725, 9800, 42], query: "Carrera" }, reader),
    (error: unknown) => error instanceof ProviderLookupError && error.details.code === "banned");
  assert.deepEqual(reads, [1725, 9800]);
  reads.length = 0;
  await assert.rejects(searchCharactersAcrossSelectedAnime({ anidbIds: [1725, 1725], query: "Carrera" }, reader));
  await assert.rejects(searchCharactersAcrossSelectedAnime({ anidbIds: [1725], query: "??" }, reader));
  assert.deepEqual(reads, []);
});
