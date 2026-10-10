import * as z from "zod/v4";

const textConstraint = z.string().trim().min(2).max(120);
export const entityComparisonInputSchema = z.object({
  anidbIds: z.array(z.number().int().positive().safe()).min(1).max(5)
    .refine(ids => new Set(ids).size === ids.length, "Source anime IDs must be distinct"),
  query: textConstraint,
  kind: z.enum(["character", "contributor"]).default("character"),
  workTitle: textConstraint.optional(),
  alias: textConstraint.optional(),
  species: textConstraint.optional(),
  limit: z.number().int().min(1).max(25).default(10)
});
export type EntityComparisonInput = z.input<typeof entityComparisonInputSchema>;

/** Assertions need field-level evidence. An absent field is not a negative. */
export const entityAssertionSchema = z.object({
  value: z.string().min(1),
  polarity: z.enum(["positive", "negative"]),
  sourceUrl: z.string().url(),
  retrievedAt: z.string(),
  sourceField: z.string().min(1)
});
export type EntityAssertion = z.infer<typeof entityAssertionSchema>;

export const entityOccurrenceSchema = z.object({
  occurrenceKey: z.string(),
  kind: z.enum(["character", "contributor"]),
  namespace: z.enum(["anidb_character", "anidb_creator"]),
  entityId: z.number().int().positive().safe().nullable(),
  sourceAnimeId: z.number().int().positive().safe(),
  sourceAnimeTitle: z.string().nullable(),
  sourceUrl: z.string().url(),
  retrievedAt: z.string(),
  names: z.array(entityAssertionSchema).min(1),
  workTitles: z.array(entityAssertionSchema),
  aliases: z.array(entityAssertionSchema),
  species: z.array(entityAssertionSchema),
  credits: z.array(z.object({
    kind: z.enum(["production", "voice"]),
    role: z.string().nullable(),
    characterId: z.number().int().positive().safe().nullable(),
    sourceField: z.string()
  }))
}).refine(value => (value.kind === "character") === (value.namespace === "anidb_character"), "Entity kind and namespace must agree");
export type EntityOccurrence = z.infer<typeof entityOccurrenceSchema>;

const constraintCheckSchema = z.object({
  field: z.enum(["identity", "name", "workTitle", "alias", "species"]),
  requested: z.string(),
  status: z.enum(["matched", "unknown", "conflicting"]),
  reason: z.enum(["reported_match", "not_reported", "missing_source_id", "different_source_work", "explicit_negative", "source_disagreement"]),
  evidence: z.array(entityAssertionSchema)
});

export const entityComparisonResultSchema = z.object({
  scope: z.literal("selected_anidb_records"),
  query: z.string(),
  kind: z.enum(["character", "contributor"]),
  examinedAnimeIds: z.array(z.number().int().positive().safe()),
  reportedOccurrences: z.number().int().nonnegative(),
  totalNameCandidates: z.number().int().nonnegative(),
  matchedCount: z.number().int().nonnegative(),
  unverifiedCount: z.number().int().nonnegative(),
  conflictingCount: z.number().int().nonnegative(),
  resolution: z.enum(["unique_in_examined_records", "ambiguous", "incomplete", "no_match_in_examined_records"]),
  truncated: z.boolean(),
  candidates: z.array(z.object({
    occurrence: entityOccurrenceSchema,
    nameMatch: z.enum(["exact", "normalized"]),
    status: z.enum(["matched", "unverified", "conflicting"]),
    checks: z.array(constraintCheckSchema)
  }))
});
export type EntityComparisonResult = z.infer<typeof entityComparisonResultSchema>;
