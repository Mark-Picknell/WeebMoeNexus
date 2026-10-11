import assert from "node:assert/strict";
import test from "node:test";
import { mapAniDbAnimeXml } from "../src/providers/anidb/mapper.js";
import { rankEpisodeCharacters } from "../src/services/episode-character-ranking-service.js";

const at = "2026-10-10T20:00:00.000Z";
const anime = mapAniDbAnimeXml(`<anime id="42">
  <titles><title type="main">Synthetic Work</title></titles>
  <episodes>
    <episode id="101"><epno type="1">1</epno></episode>
    <episode id="102"><epno type="1">2</epno></episode>
    <episode id="103"><epno type="2">1</epno></episode>
  </episodes>
  <characters>
    <character id="5"><name>Undocumented</name></character>
    <character id="6"><name>Partial</name><episodes>2, unsupported</episodes></character>
    <character id="7"><name>Referenced</name><episodes>1,2</episodes></character>
    <character id="8"><name>Unlisted</name><episodes>9</episodes></character>
    <character id="7"><name>Alternate source row</name><episodes>S1</episodes></character>
  </characters>
</anime>`, at);

test("only positive linked references rise in episode ranking; missing data remains unverified", () => {
  const result = rankEpisodeCharacters(anime, 102);
  assert.equal(result.scope, "one_anidb_anime_episode");
  assert.equal(result.sourceEpisodeFound, true);
  assert.equal(result.reportedCharacterRows, 5);
  assert.equal(result.totalCandidates, 5);
  assert.equal(result.positiveReferenceCount, 2);
  assert.deepEqual(result.candidates.slice(0, 2).map(c => c.anidbCharacterId), [6, 7]);
  assert.deepEqual(result.candidates.slice(0, 2).map(c => c.appearance), ["reported_positive", "reported_positive"]);
  assert.ok(result.candidates.slice(2).every(c => c.appearance === "unverified"));
  assert.equal(result.candidates[0]!.episodeEvidence.parseStatus, "partial");
  assert.equal(result.sourceUrl, "https://anidb.net/anime/42");
  assert.equal(result.retrievedAt, at);
});

test("different episode kinds do not join; duplicate character IDs remain independent source rows", () => {
  const result = rankEpisodeCharacters(anime, 103);
  assert.equal(result.positiveReferenceCount, 1);
  assert.equal(result.candidates[0]!.sourceRowIndex, 4);
  assert.equal(result.candidates[0]!.anidbCharacterId, 7);
  assert.deepEqual(result.candidates.filter(c => c.anidbCharacterId === 7).map(c => c.sourceRowIndex), [4, 2]);
});

test("truncation does not distort global positive and unverified counts", () => {
  const result = rankEpisodeCharacters(anime, 102, 1);
  assert.equal(result.candidates.length, 1);
  assert.equal(result.truncated, true);
  assert.equal(result.positiveReferenceCount, 2);
  assert.equal(result.unverifiedCount, 3);
});

test("unknown episode returns no candidate predictions, not negative presence claims", () => {
  const result = rankEpisodeCharacters(anime, 999);
  assert.equal(result.sourceEpisodeFound, false);
  assert.equal(result.totalCandidates, 0);
  assert.deepEqual(result.candidates, []);
  assert.equal(result.reportedCharacterRows, 5);
});

test("source generated display labels are not counted as authored names", () => {
  const unnamed = mapAniDbAnimeXml('<anime id="1"><episodes><episode id="4"><epno type="1">1</epno></episode></episodes><characters><character id="7"><episodes>1</episodes></character></characters></anime>', at);
  const result = rankEpisodeCharacters(unnamed, 4);
  assert.equal(result.candidates[0]!.nameIsSourceReported, false);
  assert.equal(result.candidates[0]!.appearance, "reported_positive");
});

test("rejects unsafe bounds and mismatched provenance", () => {
  for (const id of [0, -1, 1.4, Number.MAX_SAFE_INTEGER + 1]) {
    assert.throws(() => rankEpisodeCharacters(anime, id), RangeError);
  }
  assert.throws(() => rankEpisodeCharacters(anime, 101, 101), RangeError);
  const wrong = structuredClone(anime);
  wrong.provenance[0]!.providerId = "999";
  assert.throws(() => rankEpisodeCharacters(wrong, 101), /provenance/);
});
