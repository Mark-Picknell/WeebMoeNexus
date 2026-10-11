import * as z from "zod/v4";
import { relationGraphResultSchema, type RelationGraphResult } from "../domain/relation-graph.js";

export const explorerNodeSchema = z.strictObject({
  id: z.number().int().positive().safe(),
  title: z.string().nullable(),
  depth: z.number().int().nonnegative(),
  recordRead: z.boolean(),
  relationsComplete: z.boolean(),
  frontierReason: z.string().nullable(),
  x: z.number().finite(),
  y: z.number().finite()
});
export const explorerEdgeSchema = z.strictObject({
  source: z.number().int().positive().safe(),
  target: z.number().int().positive().safe(),
  label: z.string(),
  targetTitle: z.string().nullable(),
  evidenceSourceUrl: z.string().url(),
  retrievedAt: z.string(),
  /** Source row index is deliberately retained; duplicate links are distinct. */
  sourceRowIndex: z.number().int().nonnegative()
});
export const explorerGraphSchema = z.strictObject({
  version: z.literal(1),
  scope: z.literal("offline_anidb_reported_work_relations"),
  rootAnimeId: z.number().int().positive().safe(),
  termination: relationGraphResultSchema.shape.termination,
  truncated: z.boolean(),
  recordsRead: z.number().int().nonnegative(),
  readAttempts: z.number().int().nonnegative(),
  sourceNodeCount: z.number().int().nonnegative(),
  sourceEdgeCount: z.number().int().nonnegative(),
  frontierCount: z.number().int().nonnegative(),
  failureCount: z.number().int().nonnegative(),
  width: z.number().int().positive(),
  height: z.number().int().positive(),
  nodes: z.array(explorerNodeSchema),
  edges: z.array(explorerEdgeSchema),
  failures: relationGraphResultSchema.shape.failures
});
export type ExplorerGraph = z.infer<typeof explorerGraphSchema>;

/**
 * Project one already-fetched MCP traversal. No network, reverse links,
 * inferred complete nodes or global identity assumptions.
 */
export function projectRelationshipExplorer(raw: unknown): ExplorerGraph {
  // MCP callTool envelopes must contain structuredContent, not merely a
  // truncated narrative message. A failed call must never render as success.
  let data = raw;
  if (raw && typeof raw === "object" && "structuredContent" in raw) {
    const envelope = raw as { structuredContent: unknown; isError?: unknown };
    if (envelope.isError === true) throw new Error("MCP tool returned an error, not a graph");
    data = envelope.structuredContent;
  }
  const graph: RelationGraphResult = relationGraphResultSchema.parse(data);
  if (graph.nodes.length < 1 || graph.nodes.length > 50 ||
      graph.edges.length > 200 || graph.frontier.length > 50 || graph.failures.length > 50) {
    throw new Error("Traversal exceeds its documented graph limits");
  }
  const ids = new Set<number>();
  for (const node of graph.nodes) {
    if (ids.has(node.anidbId)) throw new Error("Duplicate source graph node");
    ids.add(node.anidbId);
    if (node.url !== `https://anidb.net/anime/${node.anidbId}`) throw new Error("Invalid source node URL");
  }
  if (!ids.has(graph.rootAnimeId)) throw new Error("Graph root is not among the source nodes");
  for (const edge of graph.edges) {
    if (!ids.has(edge.sourceAnimeId) || !ids.has(edge.targetAnimeId)) throw new Error("Dangling source edge");
    if (edge.evidenceSourceUrl !== `https://anidb.net/anime/${edge.sourceAnimeId}`) {
      throw new Error("Source edge evidence is not tied to its stated source anime");
    }
    if (!Number.isFinite(Date.parse(edge.retrievedAt))) throw new Error("Invalid source evidence timestamp");
  }
  const frontier = new Map<number, string>();
  for (const item of graph.frontier) {
    if (!ids.has(item.anidbId)) throw new Error("Frontier refers to an unknown node");
    frontier.set(item.anidbId, item.reason);
  }
  // Layout uses only reported depth, not a claimed ancestry or chronology.
  const levels = new Map<number, typeof graph.nodes>();
  for (const node of graph.nodes) levels.set(node.depth, [...(levels.get(node.depth) ?? []), node]);
  const maxLevelCount = Math.max(...[...levels.values()].map(level => level.length));
  const width = Math.max(760, (maxLevelCount + 1) * 190);
  const height = Math.max(450, (Math.max(...levels.keys()) + 1) * 180 + 100);
  const nodes = graph.nodes.map(node => {
    const group = levels.get(node.depth)!;
    const index = group.findIndex(other => other.anidbId === node.anidbId);
    return {
      id: node.anidbId, title: node.title,
      depth: node.depth, recordRead: node.recordRead,
      relationsComplete: node.relationsComplete,
      frontierReason: frontier.get(node.anidbId) ?? null,
      x: Math.round(width / 2 + (index - (group.length - 1) / 2) * 185),
      y: 105 + node.depth * 180
    };
  });
  return explorerGraphSchema.parse({
    version: 1, scope: "offline_anidb_reported_work_relations",
    rootAnimeId: graph.rootAnimeId,
    termination: graph.termination, truncated: graph.truncated,
    recordsRead: graph.recordsRead, readAttempts: graph.readAttempts,
    sourceNodeCount: graph.nodes.length, sourceEdgeCount: graph.edges.length,
    frontierCount: graph.frontier.length, failureCount: graph.failures.length,
    width, height,
    nodes,
    edges: graph.edges.map((edge, sourceRowIndex) => ({
      source: edge.sourceAnimeId, target: edge.targetAnimeId,
      label: edge.relationType, targetTitle: edge.targetTitle,
      evidenceSourceUrl: edge.evidenceSourceUrl, retrievedAt: edge.retrievedAt,
      sourceRowIndex
    })),
    failures: graph.failures
  });
}
