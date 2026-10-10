import assert from "node:assert/strict";
import test from "node:test";
import { mapAniDbAnimeXml } from "../src/providers/anidb/mapper.js";
import { aniDbRelationshipProjectionSchema, projectAniDbRelationshipEdges } from "../src/providers/anidb/relationship-edges.js";

const at = "2026-10-10T18:00:00.000Z";
const record = () => mapAniDbAnimeXml(`<anime id="7"><titles><title type="main">Synthetic Work</title></titles>
  <creators><name id="7" type="Direction">Same Name</name><name id="7" type="Script"/><name id="8" type="Animation">Same Name</name><name type="Script">Same Name</name></creators>
  <characters><character id="7"><name>Same Name</name><seiyuu id="7">Same Name</seiyuu></character>
    <character id="8"><name>Other</name><seiyuu>Unknown ID</seiyuu></character><character id="9"><name>Uncredited</name></character></characters>
  <relatedanime><anime id="8" type="adaptation">Other Work</anime><anime id="8" type="related"/><anime id="7" type="other"/></relatedanime></anime>`, at);

test("projection preserves every creator/voice/work row with original normalized evidence", () => {
  const anime = record();
  const result = projectAniDbRelationshipEdges(anime);
  assert.ok(aniDbRelationshipProjectionSchema.safeParse(result).success);
  assert.equal(result.reportedRows, 9);
  assert.equal(result.edges.length, 7);
  assert.equal(result.unresolved.length, 2);
  const production = result.edges.filter(e => e.type === "production_credit");
  assert.deepEqual(production.map(e => [e.from.id, e.role]), [["7", "Direction"], ["7", "Script"], ["8", "Animation"]]);
  assert.deepEqual(JSON.parse(production[1]!.evidence[0]!.reportedValue), anime.creators[1]);
  for (const edge of result.edges) {
    assert.equal(edge.evidence[0]!.sourceUrl, "https://anidb.net/anime/7");
    assert.equal(edge.evidence[0]!.retrievedAt, at);
    assert.deepEqual(edge.evidence[0]!.sourceRecord, result.sourceWork);
    assert.equal(edge.evidence[0]!.polarity, "positive");
  }
});

test("voice projection separates contributor/character IDs and keeps language unknown", () => {
  const voice = projectAniDbRelationshipEdges(record()).edges.find(e => e.type === "voice_credit")!;
  assert.equal(voice.from.id, voice.to.id);
  assert.notDeepEqual(voice.from, voice.to);
  assert.equal(voice.from.kind, "contributor");
  assert.equal(voice.to.kind, "character");
  assert.equal(voice.language, null);
  assert.equal(voice.work.id, "7");
  assert.equal(voice.evidence[0]!.sourceField, "characters[0].voiceActor");
});

test("missing IDs retain unresolved source rows without a fabricated name identity", () => {
  const result = projectAniDbRelationshipEdges(record());
  assert.deepEqual(result.unresolved.map(r => [r.type, r.reason, r.evidence[0]!.sourceField]), [
    ["production_credit", "missing_contributor_id", "creators[3]"],
    ["voice_credit", "missing_contributor_id", "characters[1].voiceActor"]
  ]);
  assert.equal(JSON.parse(result.unresolved[0]!.evidence[0]!.reportedValue).id, null);
  assert.equal(JSON.parse(result.unresolved[1]!.evidence[0]!.reportedValue).characterId, 8);
  assert.equal(result.edges.filter(e => e.type === "voice_credit").length, 1);
});

test("work labels, duplicate targets and self links stay directed uninterpreted rows", () => {
  const result = projectAniDbRelationshipEdges(record());
  const links = result.edges.filter(e => e.type === "reported_work_relation");
  assert.deepEqual(links.map(e => [e.from.id, e.to.id, e.label]), [["7", "8", "adaptation"], ["7", "8", "related"], ["7", "7", "other"]]);
  assert.equal(result.edges.some(e => e.type === "adaptation_of" || e.type === "crossover_with" || e.type === "portrayal_of"), false);
  assert.ok(links.every(e => e.evidence[0]!.sourceUrl.endsWith("/7")));
  assert.equal(JSON.parse(links[1]!.evidence[0]!.reportedValue).title, null);
});

test("empty record reports zero assertions rather than a negative claim", () => {
  const result = projectAniDbRelationshipEdges(mapAniDbAnimeXml('<anime id="7"/>', at));
  assert.equal(result.reportedRows, 0);
  assert.deepEqual(result.edges, []);
  assert.deepEqual(result.unresolved, []);
});

test("mismatched provenance, malformed timestamp and unsafe IDs reject before projection", () => {
  for (const mutate of [
    (a: ReturnType<typeof record>) => { a.provenance = []; },
    (a: ReturnType<typeof record>) => { a.provenance[0]!.providerId = "8"; },
    (a: ReturnType<typeof record>) => { a.provenance[0]!.sourceUrl = "https://anidb.net/anime/8"; },
    (a: ReturnType<typeof record>) => { a.provenance[0]!.retrievedAt = "yesterday"; },
    (a: ReturnType<typeof record>) => { a.creators[0]!.id = Number.MAX_SAFE_INTEGER + 1; },
    (a: ReturnType<typeof record>) => { a.characters[0]!.id = Number.MAX_SAFE_INTEGER + 1; },
    (a: ReturnType<typeof record>) => { a.relations[0]!.id = Number.MAX_SAFE_INTEGER + 1; }
  ]) {
    const anime = record(); mutate(anime);
    assert.throws(() => projectAniDbRelationshipEdges(anime));
  }
  const empty = mapAniDbAnimeXml('<anime id="7"/>', at);
  empty.provenance[0]!.retrievedAt = "yesterday";
  assert.throws(() => projectAniDbRelationshipEdges(empty));
});

test("projection preserves input and rejects an unaccounted reported row", () => {
  const before = record();
  const snapshot = structuredClone(before);
  const result = projectAniDbRelationshipEdges(before);
  assert.deepEqual(before, snapshot);
  assert.equal(aniDbRelationshipProjectionSchema.safeParse({ ...result, reportedRows: result.reportedRows + 1 }).success, false);
});

test("projection neither fetches source records nor related targets", () => {
  const original = globalThis.fetch;
  let calls = 0;
  globalThis.fetch = () => { calls++; throw new Error("Unexpected network read"); };
  try {
    projectAniDbRelationshipEdges(record());
    assert.equal(calls, 0);
  } finally { globalThis.fetch = original; }
});
