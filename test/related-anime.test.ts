import assert from "node:assert/strict";
import test from "node:test";
import { mapAniDbAnimeXml } from "../src/providers/anidb/mapper.js";
import { getRelatedAnimeFromRecord } from "../src/services/related-anime-service.js";

const stamp = "2026-10-09T20:00:00.000Z";

/** Synthetic data, not a claim about actual AniDB anime relations. */
const withLinks = `<anime id="501">
  <titles><title xml:lang="en" type="main">Example Nexus Story</title></titles>
  <relatedanime>
    <anime id="503" type="sequel">Example Nexus Story II</anime>
    <anime id="508" type="alternative version"></anime>
    <anime id="503" type="other relation">An additional typed edge</anime>
  </relatedanime>
</anime>`;

test("direct anime relation mapping preserves direction, kind, ID, nullable label and provenance", () => {
  const anime = mapAniDbAnimeXml(withLinks, stamp);
  const output = getRelatedAnimeFromRecord(anime);
  assert.equal(output.sourceAnimeId, 501);
  assert.equal(output.sourceTitle, "Example Nexus Story");
  assert.equal(output.sourceUrl, "https://anidb.net/anime/501");
  assert.equal(output.reportedRelationCount, 3);
  assert.deepEqual(output.relations, [
    {
      sourceAnimeId: 501,
      targetAnimeId: 503,
      relationType: "sequel",
      targetTitle: "Example Nexus Story II",
      targetUrl: "https://anidb.net/anime/503",
      evidenceSourceUrl: "https://anidb.net/anime/501",
      retrievedAt: stamp
    },
    {
      sourceAnimeId: 501,
      targetAnimeId: 508,
      relationType: "alternative version",
      targetTitle: null,
      targetUrl: "https://anidb.net/anime/508",
      evidenceSourceUrl: "https://anidb.net/anime/501",
      retrievedAt: stamp
    },
    {
      sourceAnimeId: 501,
      targetAnimeId: 503,
      relationType: "other relation",
      targetTitle: "An additional typed edge",
      targetUrl: "https://anidb.net/anime/503",
      evidenceSourceUrl: "https://anidb.net/anime/501",
      retrievedAt: stamp
    }
  ]);
  assert.equal(output.relations.some(r => r.sourceAnimeId === 503), false,
    "the relation projection must never silently invert edges");
});

test("empty source metadata is zero reported relations, not a negative graph conclusion", () => {
  const record = mapAniDbAnimeXml('<anime id="1725"><titles><title type="main">Example</title></titles></anime>', stamp);
  const output = getRelatedAnimeFromRecord(record);
  assert.equal(output.reportedRelationCount, 0);
  assert.deepEqual(output.relations, []);
  assert.equal(output.sourceUrl, "https://anidb.net/anime/1725");
});

test("relation projection refuses records whose source provenance does not agree", () => {
  const record = mapAniDbAnimeXml(withLinks, stamp);
  record.provenance[0]!.providerId = "999";
  assert.throws(() => getRelatedAnimeFromRecord(record), /matching source provenance/);
});
