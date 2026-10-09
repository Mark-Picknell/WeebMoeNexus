import assert from "node:assert/strict";
import { promises as fs } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { gzipSync } from "node:zlib";
import { parseAniDbTitleXml } from "../src/providers/anidb/title-index.js";
import {
  LocalAnimeTitleSearch,
  searchAniDbTitles
} from "../src/services/title-search-service.js";

/** Synthetic AniDB-like source data; not downloaded or scraped catalog rows. */
const xml = `<animetitles>
  <anime aid="77">
    <title xml:lang="x-jat" type="main">Choujikuu Yousai Macross</title>
    <title xml:lang="ja" type="official">超時空要塞マクロス</title>
    <title xml:lang="en" type="official">The Super Dimension Fortress Macross</title>
    <title xml:lang="en" type="syn">Macross</title>
  </anime>
  <anime aid="1088">
    <title xml:lang="x-jat" type="main">Macross</title>
    <title xml:lang="en" type="official">Macross - Another Work</title>
  </anime>
  <anime aid="1725">
    <title xml:lang="x-jat" type="main">Viper GTS</title>
    <title xml:lang="en" type="official">Viper GTS</title>
    <title xml:lang="en" type="short">VGTS</title>
  </anime>
  <anime aid="15437">
    <title xml:lang="x-jat" type="main">Akudama Drive</title>
  </anime>
</animetitles>`;

const index = parseAniDbTitleXml(xml);

test("local title search returns distinct anime, not one row per alias", () => {
  const found = searchAniDbTitles(index, "viper_gts", 10);
  assert.equal(found.query, "viper_gts");
  assert.equal(found.totalMatches, 1);
  assert.deepEqual(found.results.map(m => m.anidbId), [1725]);
  assert.equal(found.results[0]?.matchedTitle, "Viper GTS");
  assert.equal(found.results[0]?.matchedKind, "main");
  assert.equal(found.results[0]?.matchedLanguage, "x-jat");
  assert.equal(found.results[0]?.matchType, "normalized");
  assert.equal(found.results[0]?.sourceUrl, "https://anidb.net/anime/1725");
  assert.equal(searchAniDbTitles(index, "Viper GTS", 10).results[0]?.matchType, "exact");
});

test("same-name anime remain distinct with exact matches before normalized ones", () => {
  const result = searchAniDbTitles(index, "Macross", 1);
  assert.equal(result.totalMatches, 2, "limit must not hide total distinct candidates");
  assert.equal(result.results.length, 1);
  assert.deepEqual(searchAniDbTitles(index, "Macross", 10).results.map(m => m.anidbId),
    [77, 1088], "both distinct IDs retained");
  assert.deepEqual(searchAniDbTitles(index, "MACROSS", 10).results.map(m => m.anidbId),
    [77, 1088], "normalized case searches retain both entities");
});

test("English, Japanese and macron-bearing romanized query match source aliases", () => {
  const queries = [
    "The Super Dimension Fortress Macross",
    "超時空要塞マクロス",
    "Chōjikū Yōsai Macross"
  ];
  for (const query of queries) {
    const result = searchAniDbTitles(index, query, 10);
    assert.equal(result.totalMatches, 1, query);
    assert.equal(result.results[0]?.anidbId, 77, query);
  }
});

test("unknown titles and character names return empty (not fabricated) candidates", () => {
  for (const query of ["Carrera", "hot pink-haired doctor with scalpel", "???"]) {
    assert.deepEqual(searchAniDbTitles(index, query, 10), {
      query, totalMatches: 0, results: []
    });
  }
});

test("search parameters are validated before the index or disk is accessed", async () => {
  for (const query of ["", " ", "a".repeat(161)]) {
    assert.throws(() => searchAniDbTitles(index, query, 10), RangeError);
  }
  for (const limit of [0, -1, 26, 1.5, NaN]) {
    assert.throws(() => searchAniDbTitles(index, "Akudama Drive", limit), RangeError);
  }
  const local = new LocalAnimeTitleSearch("/definitely-not-here/ani-titles.xml.gz");
  await assert.rejects(() => local.search("   "), RangeError);
  await assert.rejects(() => local.search("Macross", 26), RangeError);
  await assert.rejects(() => local.search("Macross"), /titles:refresh/);
});

test("local service loads a cached gzip, then observes atomic replacement", async () => {
  const dir = await fs.mkdtemp(join(tmpdir(), "weeb-search-"));
  const path = join(dir, "anime-titles.xml.gz");
  try {
    await fs.writeFile(path, gzipSync(xml));
    const local = new LocalAnimeTitleSearch(path);
    assert.equal((await local.search("Akudama Drive")).results[0]?.anidbId, 15437);
    assert.equal((await local.search("Viper GTS")).totalMatches, 1);
    const replacement = `<animetitles><anime aid="3">
      <title type="main" xml:lang="en">A different title</title>
    </anime></animetitles>`;
    await fs.writeFile(join(dir, "next.gz"), gzipSync(replacement));
    await fs.rename(join(dir, "next.gz"), path);
    assert.equal((await local.search("Akudama Drive")).totalMatches, 0);
    assert.equal((await local.search("A different title")).results[0]?.anidbId, 3);
  } finally {
    await fs.rm(dir, { recursive: true, force: true });
  }
});

test("malformed on-disk title index fails closed instead of using guessed data", async () => {
  const dir = await fs.mkdtemp(join(tmpdir(), "weeb-bad-search-"));
  const path = join(dir, "titles.gz");
  try {
    await fs.writeFile(path, gzipSync("<html>Forbidden</html>"));
    const local = new LocalAnimeTitleSearch(path);
    await assert.rejects(() => local.search("Macross"));
  } finally {
    await fs.rm(dir, { recursive: true, force: true });
  }
});
