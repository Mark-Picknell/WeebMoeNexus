import assert from "node:assert/strict";
import test from "node:test";
import { relationshipEdgeSchema } from "../src/domain/relationship-edge.js";

const ref = (kind: string, id = "7") => ({ provider: "synthetic", kind, id });
const evidence = [{ sourceRecord: ref("work"), sourceUrl: "https://example.test/fixture", retrievedAt: "2026-10-10T18:00:00Z", sourceField: "synthetic.explicit_assertion", reportedValue: "synthetic row", polarity: "positive" }];
const edges = [
  { type: "voice_credit", from: ref("contributor"), to: ref("character"), work: ref("work"), language: null },
  { type: "production_credit", from: ref("contributor"), to: ref("work"), role: "Script" },
  { type: "portrayal_of", from: ref("character"), to: ref("historical_person"), work: ref("work") },
  { type: "adaptation_of", from: ref("work", "8"), to: ref("work") },
  { type: "inherits_name_from", from: ref("character", "8"), to: ref("character") },
  { type: "cameo_in", from: ref("character"), to: ref("work") },
  { type: "crossover_with", from: ref("work", "8"), to: ref("work") },
  { type: "reported_work_relation", from: ref("work", "8"), to: ref("work"), label: "related" }
];

test("every typed edge requires evidence and preserves its reported direction", () => {
  for (const edge of edges) {
    const parsed = relationshipEdgeSchema.parse({ ...edge, evidence });
    assert.deepEqual(parsed.from, edge.from);
    assert.deepEqual(parsed.to, edge.to);
    assert.deepEqual(parsed.evidence, evidence);
    assert.equal(relationshipEdgeSchema.safeParse({ ...edge, evidence: [] }).success, false);
    assert.equal(relationshipEdgeSchema.safeParse(edge).success, false);
  }
});

test("voice credits keep same-number contributor/character/work namespaces distinct", () => {
  const parsed = relationshipEdgeSchema.parse({ ...edges[0], evidence });
  assert.notDeepEqual(parsed.from, parsed.to);
  assert.equal(relationshipEdgeSchema.safeParse({ ...edges[0], from: ref("character"), evidence }).success, false);
  assert.equal(relationshipEdgeSchema.safeParse({ ...edges[0], work: ref("contributor"), evidence }).success, false);
});

test("negative and conflicting evidence remain separate assertions", () => {
  const negative = { ...evidence[0], polarity: "negative" };
  const parsed = relationshipEdgeSchema.parse({ ...edges[3], evidence: [evidence[0], negative] });
  assert.deepEqual(parsed.evidence.map(e => e.polarity), ["positive", "negative"]);
});

test("malformed evidence and undeclared relationship kinds cannot validate", () => {
  for (const change of [{ sourceUrl: "file:///private" }, { retrievedAt: "yesterday" }, { sourceField: " " }, { reportedValue: "" }, { sourceRecord: ref("work", " ") }]) {
    assert.equal(relationshipEdgeSchema.safeParse({ ...edges[0], evidence: [{ ...evidence[0], ...change }] }).success, false);
  }
  for (const type of ["same_person", "kinship", "is_canonically_identical_to"]) {
    assert.equal(relationshipEdgeSchema.safeParse({ ...edges[3], type, evidence }).success, false);
  }
});

test("portrayal, inherited names, adaptations and cameos cannot swap endpoint kinds", () => {
  for (const edge of edges.slice(2)) {
    assert.equal(relationshipEdgeSchema.safeParse({ ...edge, from: ref("contributor"), evidence }).success, false);
  }
  assert.ok(relationshipEdgeSchema.safeParse({ ...edges[2], to: ref("character", "99"), evidence }).success);
  assert.equal(relationshipEdgeSchema.safeParse({ ...edges[2], to: ref("contributor"), evidence }).success, false);
});

test("unknown language/role stays null and undeclared identity shortcuts reject", () => {
  assert.ok(relationshipEdgeSchema.safeParse({ ...edges[1], role: null, evidence }).success);
  assert.equal(relationshipEdgeSchema.safeParse({ ...edges[0], sameIdentity: true, evidence }).success, false);
});
