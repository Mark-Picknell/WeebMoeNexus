import * as z from "zod/v4";

/**
 * A source ID join is evidence of a repeated AniDB contributor reference,
 * not evidence of human personhood, kinship, role equivalence or a character merge.
 */
export const sharedContributorInputSchema = z.strictObject({
  anidbIds: z.array(z.number().int().positive().safe()).min(2).max(5)
    .refine(ids => new Set(ids).size === ids.length, "Source work IDs must be distinct"),
  limit: z.number().int().min(1).max(25).default(10)
});
export type SharedContributorInput = z.input<typeof sharedContributorInputSchema>;

const creditSchema = z.strictObject({
  sourceAnimeId: z.number().int().positive().safe(),
  sourceAnimeTitle: z.string().nullable(),
  sourceUrl: z.string().url(),
  retrievedAt: z.string(),
  sourceField: z.string().min(1),
  type: z.enum(["production", "voice"]),
  contributorName: z.string().nullable(),
  reportedRole: z.string().nullable(),
  characterId: z.number().int().positive().safe().nullable(),
  characterName: z.string().nullable()
});

export const sharedContributorResultSchema = z.strictObject({
  scope: z.literal("explicit_selected_anidb_works"),
  examinedAnimeIds: z.array(z.number().int().positive().safe()).min(2).max(5),
  reportedCreditRows: z.number().int().nonnegative(),
  unresolvedIdCreditRows: z.number().int().nonnegative(),
  distinctNamedIdCollisionCount: z.number().int().nonnegative(),
  sharedContributorCount: z.number().int().nonnegative(),
  truncated: z.boolean(),
  results: z.array(z.strictObject({
    anidbContributorId: z.number().int().positive().safe(),
    contributorUrl: z.string().url(),
    reportedNames: z.array(z.string().min(1)),
    nameVariance: z.enum(["consistent_or_unreported", "different_reported_names"]),
    sourceWorkCount: z.number().int().min(2).max(5),
    sourceAnimeIds: z.array(z.number().int().positive().safe()).min(2).max(5),
    credits: z.array(creditSchema).min(2)
  })).max(25)
});
export type SharedContributorResult = z.infer<typeof sharedContributorResultSchema>;
