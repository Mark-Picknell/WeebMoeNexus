import type { AnimeRecord } from "../domain/anime.js";
import {
  relationGraphInputSchema,
  type RelationGraphInput,
  type RelationGraphResult
} from "../domain/relation-graph.js";
import { getRelatedAnimeFromRecord } from "./related-anime-service.js";
import { ProviderLookupError } from "../domain/provider-error.js";

export interface AnimeRecordReader {
  getByAniDbId(anidbId: number): Promise<AnimeRecord>;
}

/**
 * Sequential breadth-first traversal of outgoing source assertions only.
 * Production passes the existing paced/cached AnimeService. Each ID is read
 * at most once in this call. Bounds retain a deterministic source-order prefix;
 * they do not rank, invert, deduplicate typed rows, or establish canon/identity.
 */
export async function traverseAnimeRelations(
  input: RelationGraphInput,
  reader: AnimeRecordReader
): Promise<RelationGraphResult> {
  const { anidbId, ...limits } = relationGraphInputSchema.parse(input);
  const nodes: RelationGraphResult["nodes"] = [];
  const byId = new Map<number, RelationGraphResult["nodes"][number]>();
  const edges: RelationGraphResult["edges"] = [];
  const failures: RelationGraphResult["failures"] = [];
  const reasons = new Map<number, RelationGraphResult["frontier"][number]["reason"]>();
  let readAttempts = 0;
  let recordsRead = 0;
  let termination: RelationGraphResult["termination"] = "exhausted";

  function discover(id: number, depth: number): void {
    const node = {
      anidbId: id, depth, title: null, url: `https://anidb.net/anime/${id}`,
      recordRead: false, relationsComplete: false
    };
    nodes.push(node);
    byId.set(id, node);
  }
  discover(anidbId, 0);

  traversal: for (let cursor = 0; cursor < nodes.length; cursor++) {
    const node = nodes[cursor]!;
    if (node.depth >= limits.maxDepth) {
      reasons.set(node.anidbId, "depth_limit");
      continue;
    }
    if (readAttempts >= limits.maxReads || edges.length >= limits.maxEdges) {
      termination = readAttempts >= limits.maxReads ? "read_limit" : "edge_limit";
      reasons.set(node.anidbId, termination);
      break;
    }

    readAttempts++;
    let related: ReturnType<typeof getRelatedAnimeFromRecord>;
    try {
      const record = await reader.getByAniDbId(node.anidbId);
      if (record.id !== node.anidbId) {
        throw new Error("AniDB returned a record with an unexpected source ID");
      }
      related = getRelatedAnimeFromRecord(record);
    } catch (error) {
      // Root failure follows the existing tool error contract. Later failures
      // preserve recovered edges, stop all reads, and never retry or leak raw
      // upstream text through a partial graph response.
      if (cursor === 0) throw error;
      termination = "source_read_failed";
      reasons.set(node.anidbId, "source_read_failed");
      failures.push({
        anidbId: node.anidbId,
        code: "source_read_failed",
        message: "Source record could not be read or validated; traversal stopped without retry.",
        ...(error instanceof ProviderLookupError ? { providerError: error.details } : {})
      });
      break;
    }

    recordsRead++;
    node.recordRead = true;
    node.title = related.sourceTitle;
    for (const edge of related.relations) {
      if (edges.length >= limits.maxEdges) {
        termination = "edge_limit";
        reasons.set(node.anidbId, "edge_limit");
        break traversal;
      }
      if (!byId.has(edge.targetAnimeId)) {
        if (nodes.length >= limits.maxNodes) {
          termination = "node_limit";
          reasons.set(node.anidbId, "node_limit");
          break traversal;
        }
        discover(edge.targetAnimeId, node.depth + 1);
      }
      edges.push(edge);
    }
    node.relationsComplete = true;
  }

  if (termination === "exhausted" && nodes.some(n => !n.relationsComplete)) {
    termination = "depth_limit";
  }
  const frontier = nodes.filter(n => !n.relationsComplete).map(n => ({
    anidbId: n.anidbId,
    depth: n.depth,
    reason: reasons.get(n.anidbId) ?? (
      n.depth >= limits.maxDepth ? "depth_limit" : "halted"
    )
  }));

  return {
    rootAnimeId: anidbId, limits, readAttempts, recordsRead, termination,
    truncated: termination !== "exhausted", nodes, edges, frontier, failures
  };
}
