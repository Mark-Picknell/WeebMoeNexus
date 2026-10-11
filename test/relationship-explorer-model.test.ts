import assert from "node:assert/strict";
import test from "node:test";
import { projectRelationshipExplorer, explorerGraphSchema } from "../src/ui/relationship-explorer-model.js";
import { traverseAnimeRelations } from "../src/services/relation-graph-service.js";
import { mapAniDbAnimeXml } from "../src/providers/anidb/mapper.js";

const stamp = "2026-10-11T22:00:00.000Z";
const xml = (id: number, links: [number, string, string?][] = []) =>
  mapAniDbAnimeXml(`<anime id="${id}"><titles><title type="main">Synthetic ${id}</title></titles>
  <relatedanime>${links.map(([target, type, name]) =>
    `<anime id="${target}" type="${type}">${name ?? ""}</anime>`).join("")}</relatedanime></anime>`, stamp);

test("projection preserves reported cycles, repeated source rows and distinct source provenance", async () => {
  const source = new Map([[1, xml(1, [[2, "sequel", "Incoming Title"], [2, "special"], [1, "related"]])], [2, xml(2, [[1, "prequel"]])]]);
  const graph = await traverseAnimeRelations({ anidbId: 1, maxDepth: 2, maxReads: 2 }, {
    async getByAniDbId(id) { return source.get(id)!; }
  });
  const view = projectRelationshipExplorer({ structuredContent: graph });
  assert.equal(view.scope, "offline_anidb_reported_work_relations");
  assert.equal(view.sourceNodeCount, 2);
  assert.equal(view.sourceEdgeCount, 4);
  assert.equal(view.edges.filter(e => e.source === 1 && e.target === 2).length, 2);
  assert.deepEqual(view.edges.map(e => e.sourceRowIndex), [0, 1, 2, 3]);
  assert.equal(view.edges[0]?.targetTitle, "Incoming Title");
  assert.equal(view.edges[0]?.evidenceSourceUrl, "https://anidb.net/anime/1");
  assert.equal(view.edges[0]?.retrievedAt, stamp);
  assert.equal(view.nodes[0]?.id, 1);
  assert.equal(view.nodes[0]?.x, view.width / 2);
  assert.equal(view.nodes[0]?.relationsComplete, true);
  assert.ok(explorerGraphSchema.safeParse(view).success);
});

test("unread frontier and stopped traversals keep partial status rather than invent source facts", async () => {
  const graph = await traverseAnimeRelations({ anidbId: 1, maxDepth: 2, maxReads: 1 }, {
    async getByAniDbId() { return xml(1, [[2, "sequel"]]); }
  });
  const view = projectRelationshipExplorer(graph);
  assert.equal(view.termination, "read_limit");
  assert.equal(view.truncated, true);
  assert.equal(view.frontierCount, 1);
  const unread = view.nodes.find(n => n.id === 2)!;
  assert.equal(unread.title, null);
  assert.equal(unread.recordRead, false);
  assert.equal(unread.relationsComplete, false);
  assert.equal(unread.frontierReason, "read_limit");
});

test("empty source graph remains a root node with no claims of global absence", async () => {
  const graph = await traverseAnimeRelations({ anidbId: 1 }, {
    async getByAniDbId() { return xml(1); }
  });
  const view = projectRelationshipExplorer(graph);
  assert.equal(view.sourceNodeCount, 1);
  assert.equal(view.sourceEdgeCount, 0);
  assert.equal(view.truncated, false);
  assert.equal(view.termination, "exhausted");
});

test("malformed untrusted graphs fail closed", async () => {
  const graph = await traverseAnimeRelations({ anidbId: 1 }, {
    async getByAniDbId() { return xml(1, [[2, "related"]]); }
  });
  for (const change of [
    { ...graph, rootAnimeId: 999 },
    { ...graph, nodes: [graph.nodes[0], graph.nodes[0]] },
    { ...graph, nodes: graph.nodes.map(n => ({ ...n, url: "https://invalid.example/x" })) },
    { ...graph, edges: [{ ...graph.edges[0], sourceAnimeId: 999 }] },
    { ...graph, edges: [{ ...graph.edges[0], evidenceSourceUrl: "https://invalid.example/x" }] },
    { ...graph, edges: [{ ...graph.edges[0], retrievedAt: "tomorrow" }] },
    { ...graph, frontier: [{ anidbId: 999, depth: 1, reason: "depth_limit" }] }
  ]) assert.throws(() => projectRelationshipExplorer(change));
  assert.throws(() => projectRelationshipExplorer({ isError: true, structuredContent: graph }));
  assert.throws(() => projectRelationshipExplorer({ content: [{ type: "text", text: "All done" }] }));
});
