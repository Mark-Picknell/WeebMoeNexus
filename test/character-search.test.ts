import assert from "node:assert/strict";
import test from "node:test";
import { mapAniDbAnimeXml } from "../src/providers/anidb/mapper.js";
import { findCharactersInAnime } from "../src/services/character-search-service.js";

const observedAt = "2026-10-09T19:30:00.000Z";
/** All characters below are synthetic fixtures, not assertions about AniDB. */
const viper = mapAniDbAnimeXml(`<anime id="1725" restricted="1">
  <titles><title type="main" xml:lang="en">Viper GTS</title></titles>
  <characters>
    <character id="7001" type="main character in">
      <name>Carrera</name><gender>female</gender><episodes>1,3,5</episodes>
      <seiyuu id="70">Sample Performer</seiyuu>
    </character>
    <character id="7002" type="secondary">
      <name>Carrera</name><gender>female</gender>
    </character>
    <character id="7003">
      <name>Carrera II</name><episodes>S1</episodes>
    </character>
    <character id="7004">
      <name>Viper</name>
    </character>
    <character id="7005">
      <name>カレラ</name>
    </character>
  </characters>
</anime>`, observedAt);
const other = mapAniDbAnimeXml(`<anime id="8008">
  <titles><title xml:lang="en" type="main">Entirely Different Franchise</title></titles>
  <characters><character id="9001"><name>Carrera</name></character></characters>
</anime>`, observedAt);

test("exact scoped character search keeps two IDs and source metadata, without false merges", () => {
  const found = findCharactersInAnime(viper, "Carrera", 10);
  assert.equal(found.query, "Carrera");
  assert.equal(found.scope, "one_anidb_anime");
  assert.equal(found.sourceAnimeId, 1725);
  assert.equal(found.sourceAnimeTitle, "Viper GTS");
  assert.equal(found.reportedCharacterCount, 5);
  assert.equal(found.totalMatches, 2);
  assert.deepEqual(found.results.map(r => r.anidbCharacterId), [7001, 7002]);
  assert.ok(found.results.every(r =>
    r.matchType === "exact" &&
    r.sourceAnimeId === 1725 &&
    r.sourceAnimeUrl === "https://anidb.net/anime/1725" &&
    r.evidenceSourceUrl === "https://anidb.net/anime/1725" &&
    r.retrievedAt === observedAt
  ));
  assert.equal(found.results[0]?.characterUrl, "https://anidb.net/character/7001");
  assert.equal(found.results[0]?.episodeAppearancesRaw, "1,3,5");
  assert.equal(found.results[1]?.episodeAppearancesRaw, null);
  assert.equal(found.results[0]?.voiceActor?.name, "Sample Performer");
  assert.equal(found.results[0]?.voiceActor?.id, 70);
  assert.equal(found.results[1]?.voiceActor, null);
  assert.equal(found.results[0]?.role, "main character in");
  assert.equal(found.results[0]?.gender, "female");
});

test("different anime scopes do not accidentally equate identically named fictional people", () => {
  const first = findCharactersInAnime(viper, "Carrera", 10);
  const second = findCharactersInAnime(other, "Carrera", 10);
  assert.deepEqual(first.results.map(x => x.anidbCharacterId), [7001, 7002]);
  assert.deepEqual(second.results.map(x => x.anidbCharacterId), [9001]);
  assert.equal(second.results[0]?.sourceAnimeId, 8008);
  assert.notEqual(first.results[0]?.evidenceSourceUrl, second.results[0]?.evidenceSourceUrl);
});

test("prefer exact, then normalized, prefix and contains — never mix weaker classes", () => {
  const exact = findCharactersInAnime(viper, "Carrera", 10);
  assert.deepEqual(exact.results.map(r => r.characterName), ["Carrera", "Carrera"]);
  const normalized = findCharactersInAnime(viper, "ＣＡＲＲＥＲＡ!", 10);
  assert.equal(normalized.totalMatches, 2);
  assert.ok(normalized.results.every(r => r.matchType === "normalized"));
  assert.equal(findCharactersInAnime(viper, "Carr", 10).totalMatches, 3);
  assert.ok(findCharactersInAnime(viper, "Carr", 10).results.every(r =>
    r.matchType === "prefix"
  ));
  const contains = findCharactersInAnime(viper, "rer", 10);
  assert.equal(contains.totalMatches, 3);
  assert.ok(contains.results.every(r => r.matchType === "contains"));
});

test("Japanese name spelling stays separate and is not invented from Latin alias", () => {
  const japanese = findCharactersInAnime(viper, "カレラ", 10);
  assert.deepEqual(japanese.results.map(r => r.anidbCharacterId), [7005]);
  assert.deepEqual(findCharactersInAnime(viper, "カレーラ", 10).results, []);
  assert.ok(findCharactersInAnime(viper, "Carrera", 10).results.every(x =>
    x.anidbCharacterId !== 7005
  ));
});

test("missing name means not reported in this anime; count and truncation remain explicit", () => {
  const found = findCharactersInAnime(viper, "Sephiroth", 10);
  assert.equal(found.reportedCharacterCount, 5);
  assert.equal(found.totalMatches, 0);
  assert.deepEqual(found.results, []);
  const limited = findCharactersInAnime(viper, "Carrera", 1);
  assert.equal(limited.totalMatches, 2);
  assert.equal(limited.results.length, 1);
  assert.equal(limited.results[0]?.anidbCharacterId, 7001);
  const empty = mapAniDbAnimeXml('<anime id="6"><titles><title type="main">No character records</title></titles></anime>');
  assert.equal(findCharactersInAnime(empty, "Carrera").reportedCharacterCount, 0);
});

test("validation refuses too short, punctuation-only, long queries and invalid limits", () => {
  for (const query of ["", " ", "C", "?!!", "A".repeat(121)]) {
    assert.throws(() => findCharactersInAnime(viper, query), RangeError);
  }
  for (const limit of [0, -1, 26, 1.5, Number.NaN]) {
    assert.throws(() => findCharactersInAnime(viper, "Carrera", limit), RangeError);
  }
});

test("source provenance is required and does not silently allow a mismatched anime ID", () => {
  const fake = mapAniDbAnimeXml('<anime id="14"><characters><character id="6"><name>One</name></character></characters></anime>');
  fake.provenance[0]!.providerId = "15";
  assert.throws(() => findCharactersInAnime(fake, "One"), /matching AniDB source provenance/);
});
