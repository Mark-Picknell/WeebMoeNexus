import assert from "node:assert/strict";
import test from "node:test";
import { parseAniDbTitleXml } from "../src/providers/anidb/title-index.js";
import {
  boundedTitleEditDistance,
  titleEditBudget
} from "../src/providers/anidb/title-fuzzy.js";
import { searchAniDbTitles } from "../src/services/title-search-service.js";

// All rows are synthetic test examples rather than upstream AniDB responses.
const index = parseAniDbTitleXml(`<animetitles>
  <anime aid="77">
    <title type="main" xml:lang="x-jat">Choujikuu Yousai Macross</title>
    <title type="syn" xml:lang="en">Macross</title>
  </anime>
  <anime aid="1088">
    <title type="main" xml:lang="x-jat">Macross</title>
  </anime>
  <anime aid="3000">
    <title type="main" xml:lang="x-jat">Macrosss</title>
  </anime>
  <anime aid="1725">
    <title type="main" xml:lang="x-jat">Viper GTS</title>
    <title type="official" xml:lang="en">Viper GTS</title>
  </anime>
  <anime aid="15437">
    <title type="main" xml:lang="x-jat">Akudama Drive</title>
  </anime>
  <anime aid="20">
    <title type="main" xml:lang="ja">ガンダム</title>
  </anime>
  <anime aid="21">
    <title type="main" xml:lang="ja">カンダム</title>
  </anime>
  <anime aid="90">
    <title type="main" xml:lang="en">ABC</title>
  </anime>
</animetitles>`);

test("bounded typo distance supports insertion, deletion, substitution and swaps", () => {
  assert.equal(boundedTitleEditDistance("macorss", "macross", 1), 1);
  assert.equal(boundedTitleEditDistance("maccross", "macross", 1), 1);
  assert.equal(boundedTitleEditDistance("macros", "macross", 1), 1);
  assert.equal(boundedTitleEditDistance("viper gtx", "viper gts", 1), 1);
  assert.equal(boundedTitleEditDistance("macorss", "macross", 0), null);
  assert.equal(boundedTitleEditDistance("mac", "macross", 1), null);
  assert.equal(boundedTitleEditDistance("macross", "macross", 0), 0);
  assert.equal(boundedTitleEditDistance("wat", "macross", 3), null);
  assert.throws(() => boundedTitleEditDistance("a", "b", 4), RangeError);
});

test("fuzzy budgets are bounded and short titles are not guessed", () => {
  assert.equal(titleEditBudget(1), 0);
  assert.equal(titleEditBudget(3), 0);
  assert.equal(titleEditBudget(4), 1);
  assert.equal(titleEditBudget(7), 1);
  assert.equal(titleEditBudget(8), 2);
  assert.equal(titleEditBudget(14), 2);
  assert.equal(titleEditBudget(15), 3);
  assert.deepEqual(searchAniDbTitles(index, "ABD", 10).results, []);
});

test("misspelled Latin title returns source evidence and a measured distance", () => {
  const viper = searchAniDbTitles(index, "Viper GTX", 10);
  assert.equal(viper.totalMatches, 1);
  assert.deepEqual(viper.results, [{
    anidbId: 1725,
    title: "Viper GTS",
    matchedTitle: "Viper GTS",
    matchedLanguage: "x-jat",
    matchedKind: "main",
    matchType: "fuzzy",
    editDistance: 1,
    sourceUrl: "https://anidb.net/anime/1725"
  }]);

  const akudama = searchAniDbTitles(index, "Akudama Drvie", 10);
  assert.equal(akudama.results[0]?.anidbId, 15437);
  assert.equal(akudama.results[0]?.editDistance, 1);
  assert.equal(akudama.results[0]?.matchType, "fuzzy");
});

test("misspelled shared titles still yield multiple distinct anime identities", () => {
  const found = searchAniDbTitles(index, "macorss", 10);
  assert.deepEqual(found.results.map(r => r.anidbId), [77, 1088]);
  assert.equal(found.totalMatches, 2);
  assert.ok(found.results.every(r => r.matchType === "fuzzy"));
  assert.ok(found.results.every(r => r.editDistance === 1));
  assert.deepEqual(searchAniDbTitles(index, "macorss", 1).results.map(r => r.anidbId),
    [77], "limit must not collapse total count");
});

test("deterministic matches suppress plausible but unrelated fuzzy names", () => {
  const exact = searchAniDbTitles(index, "Macross", 25);
  assert.deepEqual(exact.results.map(r => r.anidbId), [77, 1088]);
  assert.equal(exact.totalMatches, 2, "nearby Macrosss must not pollute exact results");
  assert.ok(exact.results.every(r => r.matchType === "exact"));
  const normalized = searchAniDbTitles(index, "MACROSS!", 25);
  assert.deepEqual(normalized.results.map(r => r.anidbId), [77, 1088]);
  assert.ok(normalized.results.every(r => r.matchType === "normalized"));
});

test("Japanese voicing and mixed-script text are not guessed by Latin fuzzy rules", () => {
  assert.deepEqual(searchAniDbTitles(index, "ガンダム", 10).results.map(r => r.anidbId),
    [20]);
  assert.deepEqual(searchAniDbTitles(index, "カンダム", 10).results.map(r => r.anidbId),
    [21]);
  assert.deepEqual(searchAniDbTitles(index, "ガンタム", 10).results, []);
  assert.deepEqual(searchAniDbTitles(index, "超時空要塞マクロスx", 10).results, []);
});

test("no false match for unrelated words, short fragments, or character names", () => {
  for (const query of ["Carrera", "XYZ", "Bungo", "STAR WARS"]) {
    assert.deepEqual(searchAniDbTitles(index, query, 10).results, [], query);
  }
});

test("bounded candidate scans handle many length-neighboring aliases", () => {
  const rows: string[] = [];
  for (let i = 1; i <= 1500; i++) {
    rows.push(`<anime aid="${i}"><title type="main" xml:lang="x-jat">Made Up Anime ${i}</title></anime>`);
  }
  const indexLarge = parseAniDbTitleXml(`<animetitles>${rows.join("")}</animetitles>`);
  const match = searchAniDbTitles(indexLarge, "Made Up Anmie 1001", 10);
  assert.equal(match.results[0]?.anidbId, 1001);
  assert.equal(match.results[0]?.editDistance, 1);
  assert.equal(match.results[0]?.matchType, "fuzzy");
});
