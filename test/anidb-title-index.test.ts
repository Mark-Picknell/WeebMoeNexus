import assert from "node:assert/strict";
import { promises as fs } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { gzipSync } from "node:zlib";
import {
  loadAniDbTitleIndex,
  parseAniDbTitleXml
} from "../src/providers/anidb/title-index.js";

const sample = `<?xml version="1.0" encoding="UTF-8"?>
<animetitles>
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
  <anime aid="15437">
    <title type="main" xml:lang="x-jat">Akudama Drive</title>
    <title type="syn" xml:lang="en">Akudama &amp; Friends</title>
  </anime>
</animetitles>`;

test("indexes original title variants with language, kind and source AniDB IDs", () => {
  const index = parseAniDbTitleXml(sample);
  assert.equal(index.animeCount, 4);
  assert.equal(index.titleCount, 11);
  assert.deepEqual(index.getAnime(77), {
    anidbId: 77,
    preferredTitle: "Choujikuu Yousai Macross",
    titles: [
      { value: "Choujikuu Yousai Macross", language: "x-jat", kind: "main" },
      { value: "超時空要塞マクロス", language: "ja", kind: "official" },
      { value: "The Super Dimension Fortress Macross", language: "en", kind: "official" },
      { value: "Macross", language: "en", kind: "syn" }
    ]
  });
  assert.equal(index.getAnime(9999), null);
  assert.deepEqual(index.findExactTitle("Akudama & Friends"), [{
    anidbId: 15437,
    preferredTitle: "Akudama Drive",
    matchedTitle: { value: "Akudama & Friends", language: "en", kind: "syn" }
  }]);
});

test("exact-title collisions retain both anime and each contributing alias", () => {
  const index = parseAniDbTitleXml(sample);
  assert.deepEqual(index.findExactTitle("Macross").map(m => m.anidbId), [77, 1088]);
  assert.deepEqual(index.findExactTitle("Viper GTS").map(m => m.matchedTitle.kind), ["main", "official"]);
  assert.deepEqual(index.findExactTitle("viper gts"), [], "case folding belongs to P2-03");
  assert.deepEqual(index.findExactTitle("Carrera"), [], "title index is not character search");
});

test("prefers the main source title, English only as fallback, otherwise first title", () => {
  const idx = parseAniDbTitleXml(`<animetitles>
    <anime aid="1"><title type="official" xml:lang="ja">日本</title>
      <title type="official" xml:lang="en">English</title></anime>
    <anime aid="2"><title type="official" xml:lang="ja">日本だけ</title></anime>
  </animetitles>`);
  assert.equal(idx.getAnime(1)?.preferredTitle, "English");
  assert.equal(idx.getAnime(2)?.preferredTitle, "日本だけ");
});

test("malformed XML and incomplete records fail instead of creating partial indexes", () => {
  const invalid = [
    "<not-titles/>",
    "<animetitles/>",
    '<animetitles><anime aid="2"/></animetitles>',
    '<animetitles><anime aid="0"><title type="main" xml:lang="en">X</title></anime></animetitles>',
    '<animetitles><anime aid="bad"><title type="main" xml:lang="en">X</title></anime></animetitles>',
    '<animetitles><anime aid="1"><title type="main" xml:lang="en">X</title></anime><anime aid="1"><title type="official" xml:lang="ja">X</title></anime></animetitles>',
    '<animetitles><anime aid="1"><title type="main">X</title></anime></animetitles>',
    '<animetitles><anime aid="1"><title xml:lang="en">X</title></anime></animetitles>',
    '<animetitles><anime aid="1"><title type="main" xml:lang="en">  </title></anime></animetitles>',
    '<animetitles><anime aid="1"><title type="main" xml:lang="en">bad</anime></animetitles>'
  ];
  for (const xml of invalid) {
    assert.throws(() => parseAniDbTitleXml(xml), undefined, xml);
  }
});

test("disk loader consumes the official compressed snapshot without HTTP calls", async () => {
  const folder = await fs.mkdtemp(join(tmpdir(), "weeb-index-"));
  const path = join(folder, "anime-titles.xml.gz");
  try {
    await fs.writeFile(path, gzipSync(sample));
    const index = await loadAniDbTitleIndex(path);
    assert.equal(index.animeCount, 4);
    assert.equal(index.findExactTitle("超時空要塞マクロス")[0]?.anidbId, 77);
    await fs.writeFile(path, gzipSync("<html>Error</html>"));
    await assert.rejects(() => loadAniDbTitleIndex(path));
  } finally {
    await fs.rm(folder, { recursive: true, force: true });
  }
});

test("index handles thousands of source records offline and does not collapse ID collisions", () => {
  const rows: string[] = [];
  for (let id = 1; id <= 1500; id++) {
    rows.push(`<anime aid="${id}"><title type="main" xml:lang="x-jat">A ${id}</title><title type="syn" xml:lang="en">Shared title</title></anime>`);
  }
  const index = parseAniDbTitleXml(`<animetitles>${rows.join("")}</animetitles>`);
  assert.equal(index.animeCount, 1500);
  assert.equal(index.titleCount, 3000);
  assert.equal(index.findExactTitle("Shared title").length, 1500);
  assert.equal(index.getAnime(1500)?.preferredTitle, "A 1500");
});
