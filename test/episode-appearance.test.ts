import assert from "node:assert/strict";
import test from "node:test";
import { mapAniDbAnimeXml } from "../src/providers/anidb/mapper.js";
import { normalizeCharacterEpisodeAppearances } from "../src/services/episode-appearance-service.js";

/** All IDs and character appearances are invented offline fixture data. */
const anime = mapAniDbAnimeXml(`<anime id="220">
  <titles><title xml:lang="en" type="main">Example Story</title></titles>
  <episodes>
    <episode id="101"><epno type="1">01</epno></episode>
    <episode id="102"><epno type="1">2</epno></episode>
    <episode id="103"><epno type="1">3</epno></episode>
    <episode id="201"><epno type="2">1</epno></episode>
    <episode id="202"><epno type="2">S2</epno></episode>
    <episode id="301"><epno type="3">C1</epno></episode>
  </episodes>
</anime>`);

test("parses padded numbers, ranges, specials and credits into source-listed EIDs", () => {
  const evidence = normalizeCharacterEpisodeAppearances(anime, "01-03,S1-S2,C1");
  assert.equal(evidence.raw, "01-03,S1-S2,C1");
  assert.equal(evidence.parseStatus, "complete");
  assert.equal(evidence.coverage, "all_references_listed");
  assert.deepEqual(evidence.references, ["1", "2", "3", "S1", "S2", "C1"]);
  assert.deepEqual(evidence.linkedEpisodeIds, [101, 102, 103, 201, 202, 301]);
  assert.deepEqual(evidence.unresolvedReferences, []);
  assert.deepEqual(evidence.unparsedTokens, []);
  assert.equal(evidence.sourceEpisodeMetadataCount, 6);
});

test("unrecognized syntax remains attached as partial source evidence, not guessed", () => {
  const evidence = normalizeCharacterEpisodeAppearances(anime, "1-5,!S1,S1-");
  assert.equal(evidence.parseStatus, "partial");
  assert.equal(evidence.coverage, "some_references_unlisted");
  assert.deepEqual(evidence.references, ["1", "2", "3", "4", "5"]);
  assert.deepEqual(evidence.linkedEpisodeIds, [101, 102, 103]);
  assert.deepEqual(evidence.unresolvedReferences, ["4", "5"]);
  assert.deepEqual(evidence.unparsedTokens, ["!S1", "S1-"]);
});

test("missing source character episode field is unknown, not an empty appearance assertion", () => {
  const evidence = normalizeCharacterEpisodeAppearances(anime, null);
  assert.equal(evidence.parseStatus, "unknown");
  assert.equal(evidence.coverage, "unknown");
  assert.deepEqual(evidence.references, []);
  assert.deepEqual(evidence.linkedEpisodeIds, []);
  assert.deepEqual(evidence.unresolvedReferences, []);
});

test("missing source episode metadata produces unknown coverage even for parsed references", () => {
  const emptyEpisodes = mapAniDbAnimeXml('<anime id="220"/>');
  const evidence = normalizeCharacterEpisodeAppearances(emptyEpisodes, "1-3");
  assert.equal(evidence.parseStatus, "complete");
  assert.equal(evidence.coverage, "unknown");
  assert.deepEqual(evidence.linkedEpisodeIds, []);
  assert.deepEqual(evidence.unresolvedReferences, ["1", "2", "3"]);
});

test("never infer appearance in regular episode from a similarly numbered special", () => {
  const evidence = normalizeCharacterEpisodeAppearances(anime, "S1,C1");
  assert.deepEqual(evidence.linkedEpisodeIds, [201, 301]);
  assert.equal(evidence.linkedEpisodeIds.includes(101), false);
});

test("deduplicates references while keeping all source-listed matching IDs", () => {
  const evidence = normalizeCharacterEpisodeAppearances(anime, "1,01,1-3,3,S1,S01");
  assert.deepEqual(evidence.references, ["1", "2", "3", "S1"]);
  assert.deepEqual(evidence.linkedEpisodeIds, [101, 102, 103, 201]);
});

test("unsupported cross-type, reversed and unbounded ranges remain unresolved", () => {
  const evidence = normalizeCharacterEpisodeAppearances(anime, "5-S3,5-2,S1-,7-9999");
  assert.equal(evidence.parseStatus, "partial");
  assert.deepEqual(evidence.unparsedTokens, ["5-S3", "5-2", "S1-", "7-9999"]);
  assert.deepEqual(evidence.references, []);
  assert.deepEqual(evidence.linkedEpisodeIds, []);
});

test("hard bounds prevent excessive range expansion without losing raw evidence", () => {
  const evidence = normalizeCharacterEpisodeAppearances(anime, "1-999999");
  assert.equal(evidence.parseStatus, "partial");
  assert.deepEqual(evidence.unparsedTokens, ["1-999999"]);
  assert.deepEqual(evidence.references, []);
  const long = normalizeCharacterEpisodeAppearances(anime, "1,".repeat(3000));
  assert.equal(long.parseStatus, "partial");
  assert.equal(long.references.length, 0);
  assert.equal(long.raw?.length, 6000);
});

test("unknown source episode type cannot be misjoined as a regular episode", () => {
  const record = mapAniDbAnimeXml(`<anime id="5"><episodes>
    <episode id="15"><epno type="9">1</epno></episode>
    <episode id="16"><epno type="1">1</epno></episode>
  </episodes></anime>`);
  const evidence = normalizeCharacterEpisodeAppearances(record, "1");
  assert.deepEqual(evidence.linkedEpisodeIds, [16]);
});
