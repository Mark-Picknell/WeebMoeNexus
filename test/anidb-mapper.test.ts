import assert from "node:assert/strict";
import test from "node:test";
import { mapAniDbAnimeXml } from "../src/providers/anidb/mapper.js";

const fixture = `<?xml version="1.0" encoding="UTF-8"?>
<anime id="123" restricted="0">
  <type>TV Series</type>
  <episodecount>12</episodecount>
  <startdate>2026-01-01</startdate>
  <enddate>2026-03-20</enddate>
  <titles>
    <title xml:lang="x-jat" type="main">Scalpel Pea Nexus</title>
    <title xml:lang="en" type="official">Scalpel Pea Nexus</title>
  </titles>
  <relatedanime>
    <anime id="124" type="sequel">Scalpel Pea Nexus II</anime>
  </relatedanime>
  <description>Absolutely normal laboratory activities.</description>
  <picture>example.jpg</picture>
  <url>https://example.invalid/anime</url>
  <characters>
    <character id="9001" type="main character in">
      <name>Doctor Pea</name>
      <gender>female</gender>
      <picture>doctor.jpg</picture>
      <episodes>1,3,5</episodes>
      <seiyuu id="77" picture="voice.jpg">Voice Actor</seiyuu>
    </character>
  </characters>
  <episodes>
    <episode id="5001">
      <epno type="1">1</epno>
      <length>24</length>
      <airdate>2026-01-01</airdate>
    </episode>
  </episodes>
</anime>`;

test("maps representative AniDB XML into the normalized domain model", () => {
  const anime = mapAniDbAnimeXml(fixture, "2026-10-08T00:00:00.000Z");

  assert.equal(anime.id, 123);
  assert.equal(anime.preferredTitle, "Scalpel Pea Nexus");
  assert.equal(anime.episodeCount, 12);
  assert.equal(anime.restricted, false);

  assert.deepEqual(anime.relations[0], {
    id: 124,
    relation: "sequel",
    title: "Scalpel Pea Nexus II"
  });

  assert.equal(anime.characters[0]?.name, "Doctor Pea");
  assert.equal(anime.characters[0]?.episodeAppearancesRaw, "1,3,5");
  assert.equal(anime.characters[0]?.voiceActor?.name, "Voice Actor");
  assert.equal(anime.episodes[0]?.number, "1");
  assert.equal(anime.provenance[0]?.provider, "anidb");
});

test("preserves absent character episode appearance as unknown, not no appearances", () => {
  const withoutEpisodeData = fixture.replace("      <episodes>1,3,5</episodes>\n", "");
  const anime = mapAniDbAnimeXml(withoutEpisodeData);
  assert.equal(anime.characters[0]?.episodeAppearancesRaw, null);
});
