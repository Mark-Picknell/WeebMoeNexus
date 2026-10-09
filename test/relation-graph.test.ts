import assert from "node:assert/strict";
import test from "node:test";
import type { AnimeRecord } from "../src/domain/anime.js";
import { relationGraphResultSchema } from "../src/domain/relation-graph.js";
import { mapAniDbAnimeXml } from "../src/providers/anidb/mapper.js";
import { traverseAnimeRelations } from "../src/services/relation-graph-service.js";

const stamp = "2026-10-09T20:00:00.000Z";
// Entirely synthetic graphs; IDs, names and relations are not live AniDB facts.
function record(id: number, links: Array<[number, string, string?]> = []): AnimeRecord {
  return mapAniDbAnimeXml(`<anime id="${id}">
    <titles><title type="main">Synthetic ${id}</title></titles>
    <relatedanime>${links.map(([target, type, title]) =>
      `<anime id="${target}" type="${type}">${title ?? ""}</anime>`
    ).join("")}</relatedanime></anime>`, stamp);
}

function reader(records: AnimeRecord[]) {
  const byId = new Map(records.map(r => [r.id, r]));
  const reads: number[] = [];
  return {
    reads,
    async getByAniDbId(id: number) {
      reads.push(id);
      const value = byId.get(id);
      assert.ok(value, `Unexpected source read: ${id}`);
      return value;
    }
  };
}

test("default depth reads only the root and keeps boundary metadata unverified", async () => {
  const source = reader([record(1, [[2, "sequel", "Incoming source title"]])]);
  const result = await traverseAnimeRelations({ anidbId: 1 }, source);
  assert.deepEqual(source.reads, [1]);
  assert.equal(result.termination, "depth_limit");
  assert.equal(result.truncated, true);
  assert.deepEqual(result.frontier, [{ anidbId: 2, depth: 1, reason: "depth_limit" }]);
  assert.equal(result.nodes[1]!.title, null);
  assert.equal(result.nodes[1]!.recordRead, false);
  assert.equal(result.edges[0]!.targetTitle, "Incoming source title");
  assert.equal(result.edges[0]!.evidenceSourceUrl, "https://anidb.net/anime/1");
  assert.equal(result.edges[0]!.retrievedAt, stamp);
  assert.ok(relationGraphResultSchema.safeParse(result).success);
});

test("breadth-first traversal handles cycles, diamonds, self-links and repeated typed rows", async () => {
  const source = reader([
    record(1, [[2, "sequel"], [3, "alternative version"], [2, "other relation"], [1, "related"]]),
    record(2, [[4, "sequel"], [1, "prequel"]]),
    record(3, [[4, "related"], [4, "related"]]),
    record(4)
  ]);
  const result = await traverseAnimeRelations({ anidbId: 1, maxDepth: 3 }, source);
  assert.deepEqual(source.reads, [1, 2, 3, 4]);
  assert.deepEqual(result.nodes.map(n => [n.anidbId, n.depth]), [[1, 0], [2, 1], [3, 1], [4, 2]]);
  assert.equal(result.edges.length, 8, "original source rows are not merged or inverted");
  assert.equal(result.edges.filter(e => e.sourceAnimeId === 3 && e.targetAnimeId === 4).length, 2);
  assert.equal(result.edges.some(e => e.sourceAnimeId === 4), false);
  assert.equal(result.termination, "exhausted");
  assert.equal(result.truncated, false);
  assert.deepEqual(result.frontier, []);
  assert.ok(result.nodes.every(n => n.recordRead && n.relationsComplete));
  assert.ok(result.edges.every(e => e.evidenceSourceUrl === `https://anidb.net/anime/${e.sourceAnimeId}`));
});

test("source reads are sequential even when multiple eligible nodes are queued", async () => {
  const source = reader([record(1, [[2, "related"], [3, "related"]]), record(2), record(3)]);
  let active = 0;
  let peak = 0;
  const result = await traverseAnimeRelations({ anidbId: 1, maxDepth: 2 }, {
    async getByAniDbId(id) {
      active++;
      peak = Math.max(peak, active);
      await new Promise(resolve => setImmediate(resolve));
      const value = await source.getByAniDbId(id);
      active--;
      return value;
    }
  });
  assert.equal(peak, 1);
  assert.equal(result.recordsRead, 3);
  assert.deepEqual(source.reads, [1, 2, 3]);
});

test("read budget includes the root and reports eligible unread nodes without extra reads", async () => {
  const source = reader([record(1, [[2, "related"], [3, "related"]])]);
  const result = await traverseAnimeRelations({ anidbId: 1, maxDepth: 2, maxReads: 1 }, source);
  assert.deepEqual(source.reads, [1]);
  assert.equal(result.readAttempts, 1);
  assert.equal(result.termination, "read_limit");
  assert.deepEqual(result.frontier, [
    { anidbId: 2, depth: 1, reason: "read_limit" },
    { anidbId: 3, depth: 1, reason: "halted" }
  ]);
});

test("node bound includes the root and never returns dangling edges", async () => {
  const source = reader([record(1, [[2, "sequel"], [3, "related"]])]);
  const result = await traverseAnimeRelations({ anidbId: 1, maxDepth: 2, maxNodes: 2 }, source);
  assert.deepEqual(source.reads, [1]);
  assert.equal(result.termination, "node_limit");
  assert.equal(result.nodes.length, 2);
  assert.equal(result.edges.length, 1);
  assert.equal(result.nodes[0]!.recordRead, true);
  assert.equal(result.nodes[0]!.relationsComplete, false);
  assert.equal(result.frontier[0]!.reason, "node_limit");
  const ids = new Set(result.nodes.map(n => n.anidbId));
  assert.ok(result.edges.every(e => ids.has(e.sourceAnimeId) && ids.has(e.targetAnimeId)));

  const rootOnly = await traverseAnimeRelations({ anidbId: 1, maxNodes: 1 }, source);
  assert.equal(rootOnly.edges.length, 0);
  assert.equal(rootOnly.nodes.length, 1);
});

test("edge bound exposes a partial source and stops further expansion", async () => {
  const source = reader([record(1, [[2, "sequel"], [2, "other relation"]])]);
  const result = await traverseAnimeRelations({ anidbId: 1, maxDepth: 2, maxEdges: 1 }, source);
  assert.deepEqual(source.reads, [1]);
  assert.equal(result.termination, "edge_limit");
  assert.equal(result.edges.length, 1);
  assert.equal(result.nodes[0]!.relationsComplete, false);
  assert.equal(result.frontier[0]!.reason, "edge_limit");
});

test("filled edge budget prevents an unnecessary queued source read", async () => {
  const source = reader([record(1, [[2, "sequel"]])]);
  const result = await traverseAnimeRelations({ anidbId: 1, maxDepth: 2, maxEdges: 1 }, source);
  assert.deepEqual(source.reads, [1]);
  assert.equal(result.nodes[0]!.relationsComplete, true);
  assert.equal(result.termination, "edge_limit");
  assert.equal(result.frontier[0]!.anidbId, 2);
});

test("late source failure retains evidence, stops all reads and does not expose upstream text", async () => {
  const reads: number[] = [];
  const result = await traverseAnimeRelations({ anidbId: 1, maxDepth: 2 }, {
    async getByAniDbId(id) {
      reads.push(id);
      if (id === 1) return record(1, [[2, "sequel"], [3, "related"]]);
      throw new Error("Synthetic ban/backoff; raw upstream material");
    }
  });
  assert.deepEqual(reads, [1, 2]);
  assert.equal(result.termination, "source_read_failed");
  assert.equal(result.recordsRead, 1);
  assert.equal(result.readAttempts, 2);
  assert.equal(result.edges.length, 2);
  assert.equal(result.failures[0]!.anidbId, 2);
  assert.equal(result.frontier[0]!.reason, "source_read_failed");
  assert.equal(result.frontier[1]!.reason, "halted");
  assert.equal(JSON.stringify(result).includes("raw upstream"), false);
});

test("root failures reject and mismatched fetched target IDs cannot supply false edges", async () => {
  await assert.rejects(traverseAnimeRelations({ anidbId: 1 }, {
    async getByAniDbId() { throw new Error("Synthetic unavailable root"); }
  }), /unavailable root/);
  const result = await traverseAnimeRelations({ anidbId: 1, maxDepth: 2 }, {
    async getByAniDbId(id) { return id === 1 ? record(1, [[2, "sequel"]]) : record(99, [[100, "related"]]); }
  });
  assert.equal(result.termination, "source_read_failed");
  assert.equal(result.edges.length, 1);
  assert.equal(result.nodes.some(n => n.anidbId === 99 || n.anidbId === 100), false);
});

test("empty source metadata exhausts the reported graph without a universal negative assertion", async () => {
  const result = await traverseAnimeRelations({ anidbId: 1, maxNodes: 1 }, reader([record(1)]));
  assert.equal(result.termination, "exhausted");
  assert.equal(result.truncated, false);
  assert.deepEqual(result.edges, []);
  assert.deepEqual(result.frontier, []);
});

test("invalid IDs, fractional limits and excessive budgets reject before any read", async () => {
  const source = reader([]);
  for (const input of [
    { anidbId: 0 }, { anidbId: 1, maxDepth: 0 }, { anidbId: 1, maxDepth: 4 },
    { anidbId: 1, maxNodes: 51 }, { anidbId: 1, maxEdges: 201 },
    { anidbId: 1, maxReads: 11 }, { anidbId: 1, maxReads: 1.5 }
  ]) await assert.rejects(traverseAnimeRelations(input, source));
  assert.deepEqual(source.reads, []);
});
