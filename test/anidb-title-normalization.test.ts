import assert from "node:assert/strict";
import test from "node:test";
import { parseAniDbTitleXml } from "../src/providers/anidb/title-index.js";
import {
  aniDbTitleLookupKeys,
  normalizeAniDbTitle
} from "../src/providers/anidb/title-normalization.js";

const sample = `<animetitles>
  <anime aid="77">
    <title type="main" xml:lang="x-jat">Choujikuu Yousai Macross</title>
    <title type="official" xml:lang="ja">超時空要塞マクロス</title>
    <title type="official" xml:lang="en">The Super Dimension Fortress Macross</title>
    <title type="syn" xml:lang="en">Macross</title>
  </anime>
  <anime aid="1088">
    <title type="main" xml:lang="x-jat">Macross</title>
    <title type="official" xml:lang="en">Macross: Do You Remember Love?</title>
  </anime>
  <anime aid="1725">
    <title type="main" xml:lang="x-jat">Viper GTS</title>
    <title type="official" xml:lang="en">Viper GTS</title>
    <title type="short" xml:lang="en">VGTS</title>
  </anime>
  <anime aid="50">
    <title type="main" xml:lang="x-jat">One-Piece</title>
    <title type="syn" xml:lang="ja">ガンダム</title>
  </anime>
  <anime aid="51">
    <title type="main" xml:lang="x-jat">One Piece</title>
    <title type="syn" xml:lang="ja">カンダム</title>
  </anime>
</animetitles>`;

test("case, width, punctuation, whitespace and title aliases yield stable lookup keys", () => {
  assert.equal(normalizeAniDbTitle("  ＶＩＰＥＲ—ＧＴＳ!!  "), "viper gts");
  assert.equal(normalizeAniDbTitle("Macross: Do You Remember Love?"),
    "macross do you remember love");
  assert.equal(normalizeAniDbTitle("Viper_GTS"), "viper gts");
  assert.equal(normalizeAniDbTitle("  "), "");
  assert.equal(normalizeAniDbTitle("超時空要塞マクロス"), "超時空要塞マクロス");
  assert.equal(normalizeAniDbTitle("ｶﾞﾝﾀﾞﾑ"), "ガンダム");
  assert.equal(normalizeAniDbTitle("カンダム"), "カンダム");
});

test("romanized macrons support ASCII long-vowel aliases without translating kanji", () => {
  assert.deepEqual(aniDbTitleLookupKeys("Chōjikū Yōsai Macross"), [
    "chojiku yosai macross", "choujikuu yousai macross"
  ]);
  assert.deepEqual(aniDbTitleLookupKeys("Choujikuu Yousai Macross"),
    ["choujikuu yousai macross"]);
  assert.deepEqual(aniDbTitleLookupKeys(""), []);
  assert.deepEqual(aniDbTitleLookupKeys("超時空要塞マクロス"),
    ["超時空要塞マクロス"]);
  // Voicing is lexical in Japanese, not a dispensable accent.
  assert.notEqual(normalizeAniDbTitle("ガンダム"), normalizeAniDbTitle("カンダム"));
});

test("normalized lookup retains AniDB identity and source-language evidence", () => {
  const index = parseAniDbTitleXml(sample);
  assert.deepEqual(index.findNormalizedTitle("chōjikū yōsai MACROSS").map(x => x.anidbId),
    [77]);
  assert.deepEqual(index.findNormalizedTitle("THE SUPER DIMENSION FORTRESS MACROSS").map(x => x.anidbId),
    [77]);
  assert.deepEqual(index.findNormalizedTitle("超時空要塞マクロス").map(x => x.anidbId),
    [77]);
  assert.deepEqual(index.findNormalizedTitle("  viper—GTS!").map(x => x.anidbId),
    [1725, 1725], "distinct source aliases remain visible as evidence");
  assert.equal(index.findNormalizedTitle("viper_gts")[0]?.matchedTitle.kind, "main");
  assert.deepEqual(index.findNormalizedTitle("ｖｇｔｓ").map(x => x.anidbId), [1725]);
  assert.deepEqual(index.findNormalizedTitle("Carrera"), [],
    "character names do not turn into title IDs");
});

test("different anime with the same normalized title remain separate candidates", () => {
  const index = parseAniDbTitleXml(sample);
  const matches = index.findNormalizedTitle("ONE—PIECE");
  assert.deepEqual(matches.map(x => x.anidbId), [50, 51]);
  assert.deepEqual(matches.map(x => x.matchedTitle.value), ["One-Piece", "One Piece"]);
  assert.deepEqual(index.findNormalizedTitle("macross").map(x => x.anidbId), [77, 1088]);
  assert.deepEqual(index.findNormalizedTitle("ガンダム").map(x => x.anidbId), [50]);
  assert.deepEqual(index.findNormalizedTitle("カンダム").map(x => x.anidbId), [51]);
});

test("NFKC normalization does not erase original titles or change exact lookups", () => {
  const index = parseAniDbTitleXml(sample);
  assert.deepEqual(index.findExactTitle("viper gts"), []);
  assert.equal(index.findNormalizedTitle("viper gts")[0]?.matchedTitle.value, "Viper GTS");
  assert.equal(index.getAnime(77)?.preferredTitle, "Choujikuu Yousai Macross");
  assert.deepEqual(index.findNormalizedTitle("unlisted original")[0], undefined);
});

test("same entry reached through two romanized keys is returned only once", () => {
  const index = parseAniDbTitleXml(`<animetitles><anime aid="33">
    <title type="main" xml:lang="x-jat">Chōjikū Yōsai</title>
  </anime></animetitles>`);
  assert.equal(index.findNormalizedTitle("Chōjikū Yōsai").length, 1);
  assert.equal(index.findNormalizedTitle("Choujikuu Yousai").length, 1);
  assert.equal(index.findNormalizedTitle("Chojiku Yosai").length, 1);
});
