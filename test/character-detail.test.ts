import assert from "node:assert/strict";
import test from "node:test";
import { mapAniDbAnimeXml } from "../src/providers/anidb/mapper.js";
import { getCharacterInAnime } from "../src/services/character-detail-service.js";

/** Synthetic test records, not asserted actual AniDB catalog details. */
const anime = mapAniDbAnimeXml(`<anime id="1725" restricted="1">
  <titles><title type="main" xml:lang="en">Viper GTS</title></titles>
  <characters>
    <character id="501" type="main character in">
      <name>Carrera</name><gender>female</gender><episodes>1-3</episodes>
      <seiyuu id="88" picture="example.jpg">Sample Performer</seiyuu>
    </character>
    <character id="502">
      <name>Carrera</name>
    </character>
  </characters>
</anime>`, "2026-10-09T20:00:00.000Z");

test("stable character ID reads exactly one member of a work without conflating names", () => {
  const first = getCharacterInAnime(anime, 501);
  assert.equal(first.found, true);
  assert.equal(first.sourceAnimeId, 1725);
  assert.equal(first.sourceAnimeTitle, "Viper GTS");
  assert.equal(first.sourceAnimeUrl, "https://anidb.net/anime/1725");
  assert.equal(first.evidenceSourceUrl, "https://anidb.net/anime/1725");
  assert.equal(first.retrievedAt, "2026-10-09T20:00:00.000Z");
  assert.equal(first.reportedCharacterCount, 2);
  assert.deepEqual(first.character, {
    anidbCharacterId: 501,
    name: "Carrera",
    characterUrl: "https://anidb.net/character/501",
    role: "main character in",
    gender: "female",
    picture: null,
    episodeAppearancesRaw: "1-3",
    voiceActor: { id: 88, name: "Sample Performer", picture: "example.jpg" }
  });
  const second = getCharacterInAnime(anime, 502);
  assert.equal(second.found, true);
  assert.equal(second.character?.name, first.character?.name);
  assert.notEqual(second.character?.anidbCharacterId, first.character?.anidbCharacterId);
  assert.equal(second.character?.voiceActor, null);
  assert.equal(second.character?.episodeAppearancesRaw, null);
  assert.equal(second.character?.gender, null);
});

test("unknown ID is not reported, rather than inferred to be nonexistent everywhere", () => {
  const result = getCharacterInAnime(anime, 999);
  assert.equal(result.found, false);
  assert.equal(result.reportedCharacterCount, 2);
  assert.equal(result.requestedCharacterId, 999);
  assert.equal(result.character, null);
  assert.equal(result.sourceAnimeId, 1725);
});

test("reject unsafe, noninteger and nonpositive character IDs", () => {
  for (const id of [-1, 0, Number.NaN, 1.1, Number.MAX_SAFE_INTEGER + 1]) {
    assert.throws(() => getCharacterInAnime(anime, id), RangeError);
  }
});

test("cannot treat unrelated or forged source provenance as AniDB character evidence", () => {
  const bad = mapAniDbAnimeXml('<anime id="77"><characters><character id="501"><name>Other</name></character></characters></anime>');
  bad.provenance[0]!.providerId = "1725";
  assert.throws(() => getCharacterInAnime(bad, 501), /matching AniDB source provenance/);
});
