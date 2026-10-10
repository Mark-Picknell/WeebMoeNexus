import assert from "node:assert/strict";
import test from "node:test";
import { relationshipEdgeSchema } from "../src/domain/relationship-edge.js";
import { mapAniDbAnimeXml } from "../src/providers/anidb/mapper.js";
import { projectAniDbRelationshipEdges } from "../src/providers/anidb/relationship-edges.js";
import { compareEntityOccurrences, entityOccurrencesFromAnime } from "../src/services/entity-comparison-service.js";
import { getRelatedAnimeFromRecord } from "../src/services/related-anime-service.js";
import { traverseAnimeRelations } from "../src/services/relation-graph-service.js";

// Author-authored synthetic contracts inspired by docs/GOLDEN-QUERIES.md.
// Titles describe the past mistake; ALL IDs/XML/credits here are invented test
// data, not provider observations or real-world biographical claims. No remote
// responses, audiovisual content or copied third-party catalog data are used.
const at = "2026-10-10T18:00:00.000Z";
const anime = (id: number, title: string, rows = "") => mapAniDbAnimeXml(`<anime id="${id}"><titles><title type="main">${title}</title></titles>${rows}</anime>`, at);

test("GQ-017: Carrera work context wins; missing succubus evidence cannot become verified", () => {
  const viper = anime(11, "Viper GTS", '<characters><character id="31"><name>Carrera</name></character></characters>');
  const tensura = anime(12, "That Time I Got Reincarnated as a Slime", '<characters><character id="32"><name>Carrera</name></character></characters>');
  const pool = [...entityOccurrencesFromAnime(tensura), ...entityOccurrencesFromAnime(viper)];
  const input = { anidbIds: [12, 11], query: "Carrera", workTitle: "Viper GTS", limit: 1 };
  const result = compareEntityOccurrences(input, pool);
  assert.equal(result.candidates[0]!.occurrence.entityId, 31);
  assert.equal(result.conflictingCount, 1, "Tensura homonym remains a separate occurrence");
  assert.equal(result.totalNameCandidates, 2, "output truncation cannot erase the collision");
  const withSpecies = compareEntityOccurrences({ ...input, species: "Succubus" }, pool);
  assert.equal(withSpecies.resolution, "incomplete");
  assert.equal(withSpecies.matchedCount, 0);
  assert.equal(withSpecies.candidates[0]!.checks.find(c => c.field === "species")!.status, "unknown");
});

test("GQ-002: reported name orders under one ID stay one contributor; strings cannot merge different IDs", () => {
  const work = anime(11, "Synthetic Cast", '<creators><name id="41">Ogata Megumi</name><name id="41">Megumi Ogata</name><name id="42">Megumi Ogata</name></creators>');
  const pool = entityOccurrencesFromAnime(work);
  assert.equal(pool.length, 2);
  assert.deepEqual(pool.find(c => c.entityId === 41)!.names.map(n => n.value), ["Ogata Megumi", "Megumi Ogata"]);
  for (const query of ["Ogata Megumi", "Megumi Ogata"]) {
    const result = compareEntityOccurrences({ anidbIds: [11], kind: "contributor", query }, pool);
    assert.ok(result.candidates.some(c => c.occurrence.entityId === 41));
    if (query === "Megumi Ogata") {
      assert.equal(result.resolution, "ambiguous");
      assert.deepEqual(result.candidates.map(c => c.occurrence.entityId), [41, 42]);
    }
  }
});

test("GQ-004: independent Ogata/Macross queries cannot create or transfer a voice credit", () => {
  const macross = anime(11, "The Super Dimension Fortress Macross", '<characters><character id="31"><name>Original Character</name><seiyuu id="42">Other Performer</seiyuu></character></characters>');
  const doctor = anime(12, "Akudama Drive", '<characters><character id="32"><name>Doctor</name><seiyuu id="41">Megumi Ogata</seiyuu></character></characters>');
  const comparison = compareEntityOccurrences({ anidbIds: [11, 12], kind: "contributor", query: "Megumi Ogata", workTitle: "The Super Dimension Fortress Macross" }, [...entityOccurrencesFromAnime(macross), ...entityOccurrencesFromAnime(doctor)]);
  assert.equal(comparison.matchedCount, 0);
  assert.equal(comparison.conflictingCount, 1, "credit in another selected work does not migrate");
  const originalEdges = projectAniDbRelationshipEdges(macross).edges;
  assert.equal(originalEdges.some(e => e.type === "voice_credit" && e.from.id === "41"), false);
  assert.ok(originalEdges.every(e => e.evidence.every(p => p.polarity === "positive")), "missing credit is not explicit negative evidence");
  const voice = projectAniDbRelationshipEdges(doctor).edges.find(e => e.type === "voice_credit")!;
  assert.equal(voice.from.id, "41");
  assert.equal(voice.work.id, "12");
});

test("GQ-015: shared Oda surname never creates historical kinship or a credit", () => {
  const work = anime(11, "Synthetic Oda Portrayals", '<characters><character id="31"><name>Oda Nobunaga</name></character><character id="32"><name>Oda Sakunosuke</name></character></characters>');
  assert.deepEqual(projectAniDbRelationshipEdges(work).edges, []);
  const pool = entityOccurrencesFromAnime(work);
  assert.equal(pool.length, 2);
  assert.notEqual(pool[0]!.entityId, pool[1]!.entityId);
  assert.equal(compareEntityOccurrences({ anidbIds: [11], query: "Oda" }, pool).totalNameCandidates, 0, "surname-only substring is not identity evidence");
});

test("GQ-005: explicit Macross→Robotech row survives projection and traversal without a literal title match", async () => {
  const original = anime(11, "The Super Dimension Fortress Macross", '<relatedanime><anime id="12" type="adapted into">Robotech: The Macross Saga</anime></relatedanime>');
  const related = getRelatedAnimeFromRecord(original);
  assert.equal(related.relations[0]!.targetTitle, "Robotech: The Macross Saga");
  const typed = projectAniDbRelationshipEdges(original).edges[0]!;
  assert.equal(typed.type, "reported_work_relation");
  assert.equal(typed.from.id, "11");
  assert.equal(typed.to.id, "12");
  assert.equal(JSON.parse(typed.evidence[0]!.reportedValue).title, "Robotech: The Macross Saga");
  const reads: number[] = [];
  const graph = await traverseAnimeRelations({ anidbId: 11, maxDepth: 1 }, { async getByAniDbId(id) { reads.push(id); assert.equal(id, 11); return original; } });
  assert.deepEqual(reads, [11]);
  assert.equal(graph.edges.length, 1, "omitting the explicit adaptation candidate must fail this contract");
  assert.equal(graph.edges[0]!.targetTitle, "Robotech: The Macross Saga");
  assert.equal(graph.nodes.find(n => n.anidbId === 12)!.recordRead, false);
  assert.ok(graph.edges.every(e => e.sourceAnimeId === 11), "no inverse relationship is invented");
});

test("GQ-005 coverage: absent relation stays unknown; missing target title retains ID without guessing Robotech", async () => {
  const empty = anime(11, "The Super Dimension Fortress Macross");
  assert.equal(getRelatedAnimeFromRecord(empty).reportedRelationCount, 0);
  assert.deepEqual(projectAniDbRelationshipEdges(empty).edges, []);
  const unnamed = anime(11, "The Super Dimension Fortress Macross", '<relatedanime><anime id="12" type="adapted into"/></relatedanime>');
  const graph = await traverseAnimeRelations({ anidbId: 11, maxDepth: 1 }, { async getByAniDbId() { return unnamed; } });
  assert.equal(graph.edges[0]!.targetAnimeId, 12);
  assert.equal(graph.edges[0]!.targetTitle, null);
  assert.equal(graph.nodes.find(n => n.anidbId === 12)!.title, null);
});

const ref = (kind: string, id: string) => ({ provider: "synthetic", kind, id });
const proof = [{ sourceRecord: ref("work", "fixture"), sourceUrl: "https://example.test/identity-contract", retrievedAt: at, sourceField: "synthetic.explicit_assertion", reportedValue: "fixture relationship", polarity: "positive" }];

test("GQ-014: multiple fictional portrayals retain distinct IDs and receive their own voice credits", () => {
  const referent = ref("historical_person", "nobunaga");
  const first = ref("character", "portrayal-a"), second = ref("character", "portrayal-b");
  const portrayals = [first, second].map((from, i) => relationshipEdgeSchema.parse({ type: "portrayal_of", from, to: referent, work: ref("work", `work-${i}`), evidence: proof }));
  assert.notDeepEqual(portrayals[0]!.from, portrayals[1]!.from);
  assert.deepEqual(portrayals[0]!.to, portrayals[1]!.to);
  const voice = { type: "voice_credit", from: ref("contributor", "actor"), to: first, work: ref("work", "work-0"), language: null, evidence: proof };
  assert.ok(relationshipEdgeSchema.safeParse(voice).success);
  assert.equal(relationshipEdgeSchema.safeParse({ ...voice, to: referent }).success, false, "portrayal actor is not a credit for the historical person");
});

test("GQ-011/GQ-013: inherited name, cameo and crossover assertions preserve separate endpoints", () => {
  const older = ref("character", "yoshimitsu-older"), newer = ref("character", "yoshimitsu-newer");
  const inheritance = relationshipEdgeSchema.parse({ type: "inherits_name_from", from: newer, to: older, evidence: proof });
  assert.notDeepEqual(inheritance.from, inheritance.to);
  const cameo = relationshipEdgeSchema.parse({ type: "cameo_in", from: ref("character", "plue-rave"), to: ref("work", "crossover"), evidence: proof });
  assert.equal(cameo.to.kind, "work");
  const crossover = relationshipEdgeSchema.parse({ type: "crossover_with", from: ref("work", "rave"), to: ref("work", "fairy-tail"), evidence: proof });
  assert.notDeepEqual(crossover.from, crossover.to);
  assert.equal(relationshipEdgeSchema.safeParse({ ...crossover, type: "same_person" }).success, false);
});
