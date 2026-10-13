import * as z from "zod/v4";
const id = z.number().int().positive().safe();
export const sourcePathRefSchema = z.strictObject({
  kind: z.enum(["work", "character", "contributor"]),
  id
});
const sourcePathInput = {
  anidbIds: z.array(id).min(1).max(5).refine(ids => new Set(ids).size === ids.length, "Selected work IDs must be distinct"),
  from: sourcePathRefSchema,
  to: sourcePathRefSchema,
  maxHops: z.number().int().min(1).max(8).default(6)
};
export const sourceRelationshipPathInputSchema = z.strictObject(sourcePathInput);
export type SourceRelationshipPathInput = z.input<typeof sourceRelationshipPathInputSchema>;
export type ParsedSourceRelationshipPathInput = z.output<typeof sourceRelationshipPathInputSchema>;
const node = sourcePathRefSchema.extend({
  sourceNames: z.array(z.string()),
  /** Character and contributor IDs remain kind-local; unknown is not "studio". */
  entityClass: z.literal("source_reference_only"),
  sourceRecords: z.array(id)
});
const edge = z.strictObject({
  type: z.enum(["character_in_work", "production_credit", "voice_credit", "reported_work_relation"]),
  from: sourcePathRefSchema,
  to: sourcePathRefSchema,
  sourceAnimeId: id,
  sourceUrl: z.string().url(),
  retrievedAt: z.iso.datetime({ offset: true }),
  sourceField: z.string().min(1),
  /** Original source role/relation label is never rewritten into a semantic relationship. */
  reportedLabel: z.string().nullable()
});
export const sourceRelationshipPathResultSchema = z.strictObject({
  scope: z.literal("explicit_selected_anidb_source_path"),
  examinedAnimeIds: z.array(id).min(1).max(5),
  from: sourcePathRefSchema, to: sourcePathRefSchema,
  maxHops: z.number().int().min(1).max(8),
  status: z.enum(["found", "endpoint_not_reported", "no_path_within_limit"]),
  pathHops: z.number().int().nonnegative().nullable(),
  sourceNodeCount: z.number().int().nonnegative(),
  sourceEdgeCount: z.number().int().nonnegative(),
  /** These are retained source nodes visited as BFS evidence, not global catalog completeness. */
  path: z.array(z.strictObject({
    edge,
    /** An undirected *graph-navigation* step, not a new inverse source assertion. */
    navigation: z.enum(["along_reported_direction", "against_reported_direction"])
  })),
  nodesOnPath: z.array(node),
  unresolvedCreditRows: z.number().int().nonnegative(),
  workRelationsOutsideSelection: z.number().int().nonnegative(),
  /** Always true: a returned no-path never proves global disconnection. */
  selectedPoolOnly: z.literal(true)
});
export type SourceRelationshipPathResult = z.infer<typeof sourceRelationshipPathResultSchema>;
export type SourcePathRef = z.infer<typeof sourcePathRefSchema>;
export type SourcePathEdge = z.infer<typeof edge>;
