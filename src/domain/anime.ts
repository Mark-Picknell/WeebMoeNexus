import * as z from "zod/v4";

export const titleSchema = z.object({
  language: z.string(),
  kind: z.string(),
  value: z.string()
});

export const relationSchema = z.object({
  id: z.number().int().positive(),
  relation: z.string(),
  title: z.string().nullable()
});

/**
 * Source-reported AniDB creator/work-credit row. One AniDB creator ID may
 * legitimately occur more than once with different production roles.
 * Null ID or name is missing source metadata, never a guessed identity.
 */
export const creatorCreditSchema = z.object({
  id: z.number().int().positive().nullable(),
  name: z.string().nullable(),
  role: z.string().nullable()
});

export const voiceActorSchema = z.object({
  id: z.number().int().positive().nullable(),
  name: z.string(),
  picture: z.string().nullable()
});

export const characterSchema = z.object({
  id: z.number().int().positive(),
  name: z.string(),
  role: z.string().nullable(),
  gender: z.string().nullable(),
  picture: z.string().nullable(),
  /** Optional for normalized records created before character profile ingestion. */
  description: z.string().nullable().optional(),
  /** AniDB character entity category is not a species or role inference. */
  characterType: z.strictObject({
    id: z.number().int().positive().safe().nullable(),
    name: z.string().nullable()
  }).nullable().optional(),
  // Preserve AniDB's per-character episode list verbatim until its grammar is validated.
  episodeAppearancesRaw: z.string().nullable(),
  voiceActor: voiceActorSchema.nullable()
});

export const episodeSchema = z.object({
  id: z.number().int().positive(),
  number: z.string(),
  kind: z.number().int().nullable(),
  airDate: z.string().nullable(),
  lengthMinutes: z.number().int().nonnegative().nullable()
});

export const provenanceSchema = z.object({
  provider: z.literal("anidb"),
  providerId: z.string(),
  sourceUrl: z.string().url(),
  retrievedAt: z.string()
});

/** AniDB's reported anime-wide tag. Missing metadata stays unknown. */
export const sourceTagSchema = z.object({
  id: z.number().int().positive().safe().nullable(),
  name: z.string().nullable(),
  approval: z.number().int().nonnegative().safe().nullable(),
  localSpoiler: z.boolean().nullable(),
  globalSpoiler: z.boolean().nullable()
});

/** Source category hierarchy/weight, not an inferred genre classification. */
export const sourceCategorySchema = z.object({
  id: z.number().int().positive().safe().nullable(),
  parentId: z.number().int().nonnegative().safe().nullable(),
  name: z.string().nullable(),
  description: z.string().nullable(),
  weight: z.number().int().nonnegative().safe().nullable(),
  restricted: z.boolean().nullable()
});

export const animeRecordSchema = z.object({
  id: z.number().int().positive(),
  titles: z.array(titleSchema),
  preferredTitle: z.string(),
  type: z.string().nullable(),
  episodeCount: z.number().int().nonnegative().nullable(),
  startDate: z.string().nullable(),
  endDate: z.string().nullable(),
  restricted: z.boolean(),
  description: z.string().nullable(),
  picture: z.string().nullable(),
  url: z.string().nullable(),
  relations: z.array(relationSchema),
  /** Optional for cached records normalized before source-theme ingestion. */
  tags: z.array(sourceTagSchema).optional(),
  categories: z.array(sourceCategorySchema).optional(),
  creators: z.array(creatorCreditSchema),
  characters: z.array(characterSchema),
  episodes: z.array(episodeSchema),
  provenance: z.array(provenanceSchema)
});

export type AnimeRecord = z.infer<typeof animeRecordSchema>;
