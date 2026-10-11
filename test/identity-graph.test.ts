import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { buildIdentityGraph } from "../src/services/identity-graph-service.js";
import { identityGraphInputSchema } from "../src/domain/identity-graph.js";
import { relationshipEdgeSchema } from "../src/domain/relationship-edge.js";
import { assessFieldClaims } from "../src/services/field-assessment-service.js";

const corpus = JSON.parse(readFileSync(new URL("./fixtures/identity-graph-cases.json", import.meta.url), "utf8"));

test("authored cross-provider mappings bind only supplied kind-local identities", () => {
  const fixture = corpus.cases.find((c: any) => c.id === "explicit_mapping");
  const result = buildIdentityGraph(fixture.input);
  assert.equal(result.components.length, 1);
  assert.equal(result.components[0]!.canonicalId, "synthetic:character:carrera-a");
  assert.equal(result.components[0]!.members.length, 2);
  assert.equal(result.components[0]!.resolution, "resolved_from_supplied_evidence");
  assert.deepEqual(result.input, fixture.input);
});

test("same labels and same-number provider/kind IDs stay independent without mapping evidence", () => {
  const fixture = corpus.cases.find((c: any) => c.id === "false_name_collision");
  assert.equal(new Set(fixture.labels.map((l: any) => l.name)).size, 1);
  const result = buildIdentityGraph(fixture.input);
  assert.equal(result.components.length, 4);
  assert.ok(result.components.every(c => c.members.length === 1 && c.canonicalId === null && c.resolution === "unassigned"));
});

test("transitive mappings retain an explicit contrary assertion and withhold canonical resolution", () => {
  const fixture = corpus.cases.find((c: any) => c.id === "contradictory_mapping");
  const result = buildIdentityGraph(fixture.input);
  assert.equal(result.components.length, 1);
  assert.equal(result.components[0]!.members.length, 3);
  assert.equal(result.components[0]!.resolution, "conflicting");
  assert.equal(result.components[0]!.canonicalId, null);
  assert.deepEqual(result.components[0]!.conflicts, [{ type: "different_entity_inside_component", assertionIndex: 2 }]);
  assert.equal(result.input.assertions.length, 3);
});

test("conflicting canonical assignments and shared-anchor contradictions remain visible", () => {
  const fixture = corpus.cases.find((c: any) => c.id === "explicit_mapping");
  const input = structuredClone(fixture.input);
  input.anchors.push({ ...input.anchors[0], canonicalId: "synthetic:character:other", entity: input.nodes[1] });
  let result = buildIdentityGraph(input);
  assert.equal(result.components[0]!.resolution, "conflicting");
  assert.deepEqual(result.components[0]!.canonicalIds, ["synthetic:character:carrera-a", "synthetic:character:other"]);
  input.assertions = [{ ...input.assertions[0], type: "different_entity" }];
  input.anchors[1].canonicalId = input.anchors[0].canonicalId;
  result = buildIdentityGraph(input);
  assert.equal(result.components[0]!.resolution, "conflicting");
  assert.equal(result.components[0]!.conflicts[0]!.type, "different_entity_inside_component");
});

test("cross-media adaptation and fictional portrayal edges retain direction without becoming identity", () => {
  const fixture = corpus.cases.find((c: any) => c.id === "cross_media_links");
  const relationships = fixture.relationships.map((r: any) => relationshipEdgeSchema.parse(r));
  const result = buildIdentityGraph(fixture.input);
  assert.equal(result.components.length, 4);
  assert.deepEqual(relationships.map((r: any) => r.type), ["adaptation_of", "portrayal_of"]);
  assert.ok(result.components.every(c => c.canonicalId === null));
  assert.equal(relationships[0].from.provider, "synthetic_b");
  assert.equal(relationships[1].to.kind, "historical_person");
});

test("contradictory provider fields remain a field conflict after explicit identity grouping", () => {
  const fixture = corpus.fieldDisagreement;
  const graph = buildIdentityGraph(corpus.cases[0].input);
  const result = assessFieldClaims({ ...fixture.request, subjects: graph.components[0]!.members }, fixture.claims);
  assert.equal(result.status, "conflicting");
  assert.equal(result.claims.length, 2);
  assert.deepEqual(result.claims.map(c => c.evidence.sourceRecord.provider), ["synthetic_a", "synthetic_b"]);
});

test("invalid identity endpoints/kinds/evidence/budgets reject and component keys are stable", () => {
  const input = structuredClone(corpus.cases[0].input);
  assert.equal(identityGraphInputSchema.safeParse({ ...input, nodes: [...input.nodes, input.nodes[0]] }).success, false);
  assert.throws(() => buildIdentityGraph({ ...input, nodes: input.nodes.slice(1) }));
  const mixed = structuredClone(input); mixed.nodes[1].kind = "contributor"; mixed.assertions[0].to = mixed.nodes[1];
  assert.throws(() => buildIdentityGraph(mixed));
  const proofless = structuredClone(input); proofless.assertions[0].evidence = [];
  assert.throws(() => buildIdentityGraph(proofless));
  const many = Array.from({ length: 501 }, (_, i) => ({ ...input.nodes[0], id: String(i) }));
  assert.throws(() => buildIdentityGraph({ nodes: many, assertions: [], anchors: [] }));
  const before = structuredClone(input), result = buildIdentityGraph(input);
  const reordered = buildIdentityGraph({ ...input, nodes: [...input.nodes].reverse() });
  assert.equal(result.components[0]!.componentId, reordered.components[0]!.componentId);
  result.input.nodes[0]!.id = "changed";
  assert.deepEqual(input, before);
  assert.deepEqual(buildIdentityGraph({ nodes: [], assertions: [], anchors: [] }).components, []);
});
