import assert from "node:assert/strict";
import test from "node:test";
import { animeRecordSchema } from "../src/domain/anime.js";
import { mapAniDbAnimeXml } from "../src/providers/anidb/mapper.js";

/**
 * Offline, hand-authored edge-case fixtures; no AniDB network calls or copied
 * upstream payloads. These cover optional/malformed metadata while retaining
 * unknown states rather than fabricating a negative claim.
 */
const at = "2026-10-09T00:00:00.000Z";

test("minimal anime retains unknown/missing fields and uses provider-ID title fallback", () => {
  const anime = mapAniDbAnimeXml('<anime id="1725"/>', at);
  assert.equal(anime.id, 1725);
  assert.equal(anime.preferredTitle, "AniDB #1725");
  assert.deepEqual(anime.titles, []);
  assert.deepEqual(anime.characters, []);
  assert.deepEqual(anime.relations, []);
  assert.deepEqual(anime.episodes, []);
  assert.equal(anime.type, null);
  assert.equal(anime.episodeCount, null);
  assert.equal(anime.startDate, null);
  assert.equal(anime.endDate, null);
  assert.equal(anime.description, null);
  assert.equal(anime.picture, null);
  assert.equal(anime.url, null);
  assert.equal(anime.restricted, false);
  assert.deepEqual(anime.provenance, [{
    provider: "anidb",
    providerId: "1725",
    sourceUrl: "https://anidb.net/anime/1725",
    retrievedAt: at
  }]);
  assert.equal(animeRecordSchema.safeParse(anime).success, true);
});

test("English title fallback does not collapse other language and alias evidence", () => {
  const anime = mapAniDbAnimeXml(`<anime id="77"><titles>
    <title xml:lang="ja" type="official">超時空要塞マクロス</title>
    <title xml:lang="en" type="official">The Super Dimension Fortress Macross</title>
    <title xml:lang="x-jat" type="syn">Choujikuu Yousai Macross</title>
    <title type="syn">   </title>
  </titles></anime>`, at);
  assert.equal(anime.preferredTitle, "The Super Dimension Fortress Macross");
  assert.equal(anime.titles.length, 3);
  assert.deepEqual(anime.titles.map(t => t.language), ["ja", "en", "x-jat"]);
  assert.equal(anime.titles[0]?.value, "超時空要塞マクロス");
  assert.equal(anime.titles[2]?.kind, "syn");
});

test("non-English only title remains usable and unknown title metadata is explicit", () => {
  const anime = mapAniDbAnimeXml(
    '<anime id="9"><titles><title>異世界</title></titles></anime>', at
  );
  assert.equal(anime.preferredTitle, "異世界");
  assert.deepEqual(anime.titles, [{ language: "und", kind: "unknown", value: "異世界" }]);
});

test("restricted source content, unusual episodes and raw appearance grammar survive mapping", () => {
  const anime = mapAniDbAnimeXml(`<anime id="1725" restricted="1">
    <titles><title xml:lang="en" type="main">Synthetic Example OVA</title></titles>
    <type>OVA</type><episodecount>3</episodecount>
    <characters><character id="42" type="main character in">
      <name>Carrera</name><gender>female</gender><episodes>1-3,!S1</episodes>
      <seiyuu picture="actor.png">Unknown Contributor</seiyuu>
    </character></characters>
    <episodes>
      <episode id="500"><epno type="2">S1</epno></episode>
      <episode id="501"><epno>2</epno><length>24</length></episode>
    </episodes>
  </anime>`, at);
  assert.equal(anime.restricted, true);
  assert.equal(anime.episodeCount, 3);
  assert.equal(anime.characters[0]?.episodeAppearancesRaw, "1-3,!S1");
  assert.equal(anime.characters[0]?.voiceActor?.id, null);
  assert.equal(anime.characters[0]?.voiceActor?.name, "Unknown Contributor");
  assert.equal(anime.characters[0]?.voiceActor?.picture, "actor.png");
  assert.equal(anime.episodes[0]?.number, "S1");
  assert.equal(anime.episodes[0]?.kind, 2);
  assert.equal(anime.episodes[0]?.airDate, null);
  assert.equal(anime.episodes[0]?.lengthMinutes, null);
  assert.equal(anime.episodes[1]?.kind, null);
  assert.equal(anime.episodes[1]?.lengthMinutes, 24);
  assert.equal(animeRecordSchema.safeParse(anime).success, true);
});

test("absent character tags remain unknown rather than proving nonappearance", () => {
  const anime = mapAniDbAnimeXml(`<anime id="31"><characters>
    <character id="108685"/>
  </characters></anime>`, at);
  assert.equal(anime.characters[0]?.name, "AniDB character #108685");
  assert.equal(anime.characters[0]?.episodeAppearancesRaw, null);
  assert.equal(anime.characters[0]?.role, null);
  assert.equal(anime.characters[0]?.gender, null);
  assert.equal(anime.characters[0]?.voiceActor, null);
  assert.equal(animeRecordSchema.safeParse(anime).success, true);
});

test("related anime retains source-defined relation and null title", () => {
  const anime = mapAniDbAnimeXml(`<anime id="77"><relatedanime>
    <anime id="1088" type="alternative version"/>
    <anime id="1725">Other</anime>
  </relatedanime></anime>`, at);
  assert.deepEqual(anime.relations, [
    { id: 1088, relation: "alternative version", title: null },
    { id: 1725, relation: "related", title: "Other" }
  ]);
});

test("API error payload is an error, not an empty catalog entry", () => {
  assert.throws(() => mapAniDbAnimeXml("<error>client banned</error>", at), /AniDB API error: client banned/);
});

test("missing anime record and invalid IDs are rejected instead of invented", () => {
  assert.throws(() => mapAniDbAnimeXml("<response/>", at), /did not contain/);
  assert.throws(() => mapAniDbAnimeXml('<anime id="0"/>', at), /invalid anime id/);
  assert.throws(() => mapAniDbAnimeXml('<anime id="bad"/>', at), /invalid anime id/);
  assert.throws(() => mapAniDbAnimeXml('<anime id="77"><characters><character id="-1"/></characters></anime>', at), /invalid character id/);
  assert.throws(() => mapAniDbAnimeXml('<anime id="77"><relatedanime><anime type="sequel"/></relatedanime></anime>', at), /invalid related anime id/);
});
