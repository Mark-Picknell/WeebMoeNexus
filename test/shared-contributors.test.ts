import assert from "node:assert/strict";
import test from "node:test";
import { mapAniDbAnimeXml } from "../src/providers/anidb/mapper.js";
import { findSharedContributorsInRecords, findSharedContributors } from "../src/services/shared-contributors-service.js";
import { sharedContributorResultSchema } from "../src/domain/shared-contributors.js";
import { ProviderLookupError } from "../src/domain/provider-error.js";

const t = "2026-10-11T20:00:00Z";
const one = mapAniDbAnimeXml(`<anime id="101">
  <titles><title type="main">First Work</title></titles>
  <creators><name id="10" type="Direction">A. Sample</name><name id="10" type="Writing">A. Sample</name>
    <name id="20" type="Art">Same Name</name><name type="Music">Unknown ID</name>
    <name id="90" type="Production">Organization Name</name></creators>
  <characters><character id="500"><name>Hero</name><seiyuu id="10">A. Sample</seiyuu></character>
    <character id="501"><name>Rival</name><seiyuu id="50">Voice One</seiyuu></character>
    <character id="502"><name>Mystery</name><seiyuu>Same Name</seiyuu></character>
  </characters></anime>`, t);
const two = mapAniDbAnimeXml(`<anime id="102">
  <titles><title type="main">Second Work</title></titles>
  <creators><name id="10" type="Animation">A Different Name</name>
    <name id="30" type="Direction">Same Name</name>
    <name id="90" type="Production">Organization Name</name></creators>
  <characters><character id="700"><name>Another Hero</name><seiyuu id="50">Voice One</seiyuu></character>
    <character id="701"><name>Double</name><seiyuu id="30">Same Name</seiyuu></character></characters></anime>`, t);
const three = mapAniDbAnimeXml(`<anime id="103">
  <creators><name id="90" type="Work">Organization Name</name>
    <name id="40" type="Music">Same Name</name></creators></anime>`, t);

test("shared identity uses stable source contributor IDs, never matching display names or character IDs", () => {
  const result = findSharedContributorsInRecords({ anidbIds: [102, 101] }, [two, one]);
  assert.equal(result.scope, "explicit_selected_anidb_works");
  assert.equal(result.reportedCreditRows, 13);
  assert.equal(result.unresolvedIdCreditRows, 2);
  assert.equal(result.distinctNamedIdCollisionCount, 1);
  assert.equal(result.sharedContributorCount, 3);
  assert.deepEqual(result.results.map(c => c.anidbContributorId), [10, 50, 90]);
  assert.deepEqual(result.results[0]!.sourceAnimeIds, [102, 101]);
  assert.equal(result.results[0]!.nameVariance, "different_reported_names");
  assert.equal(result.results[0]!.credits.filter(c => c.type === "production").length, 3);
  assert.equal(result.results[0]!.credits.filter(c => c.type === "voice").length, 1);
  assert.equal(result.results[0]!.credits.find(c => c.characterId === 500)?.sourceField, "characters[0].voiceActor");
  assert.equal(result.results[1]!.credits.filter(c => c.type === "voice").length, 2);
  assert.equal(result.results[2]!.credits[0]!.contributorName, "Organization Name");
  assert.ok(sharedContributorResultSchema.safeParse(result).success);
});

test("shared-in-three outranks shared-in-two and truncated results retain full pool counts", () => {
  const result = findSharedContributorsInRecords({ anidbIds: [101, 102, 103], limit: 1 }, [one, two, three]);
  assert.equal(result.sharedContributorCount, 3);
  assert.equal(result.truncated, true);
  assert.equal(result.results.length, 1);
  assert.equal(result.results[0]!.anidbContributorId, 90);
  assert.equal(result.results[0]!.sourceWorkCount, 3);
  assert.deepEqual(result.results[0]!.sourceAnimeIds, [101, 102, 103]);
});

test("null identifiers and same-name different IDs never become shared people", () => {
  const x = mapAniDbAnimeXml('<anime id="11"><creators><name type="Music">Nobody</name><name id="22">Same Name</name></creators></anime>', t);
  const y = mapAniDbAnimeXml('<anime id="12"><creators><name type="Music">Nobody</name><name id="33">Same Name</name></creators></anime>', t);
  const result = findSharedContributorsInRecords({ anidbIds: [11, 12] }, [x, y]);
  assert.equal(result.sharedContributorCount, 0);
  assert.equal(result.unresolvedIdCreditRows, 2);
  assert.equal(result.distinctNamedIdCollisionCount, 1);
  assert.deepEqual(result.results, []);
});

test("mismatched records or missing provenance are errors, not incomplete-looking results", () => {
  assert.throws(() => findSharedContributorsInRecords({ anidbIds: [101, 102] }, [two, one]));
  assert.throws(() => findSharedContributorsInRecords({ anidbIds: [101, 101] }, [one, one]));
  const falseSource = structuredClone(one);
  falseSource.provenance[0]!.providerId = "999";
  assert.throws(() => findSharedContributorsInRecords({ anidbIds: [101, 102] }, [falseSource, two]), /provenance/);
  const oversized = structuredClone(one); oversized.creators = Array.from({ length: 2001 }, () => ({id: 10, name: "Noisy", role: null}));
  assert.throws(() => findSharedContributorsInRecords({ anidbIds: [101, 102] }, [oversized, two]), /2,000/);
});

test("invalid input prevents reads; provider failures stop subsequent requested reads", async () => {
  const ids: number[] = [];
  const reader = { getByAniDbId: async (id: number) => {
    ids.push(id);
    if (id === 102) throw new ProviderLookupError({
      code: "banned", reason: "local_backoff", message: "Synthetic ban", httpStatus: null, apiCode: null
    });
    return one;
  } };
  await assert.rejects(findSharedContributors({ anidbIds: [101, 102, 103] }, reader),
    (err: unknown) => err instanceof ProviderLookupError && err.details.code === "banned");
  assert.deepEqual(ids, [101, 102]);
  ids.length = 0;
  await assert.rejects(findSharedContributors({ anidbIds: [101, 101] }, reader));
  await assert.rejects(findSharedContributors({ anidbIds: [101, 102], limit: 0 }, reader));
  assert.deepEqual(ids, []);
});
