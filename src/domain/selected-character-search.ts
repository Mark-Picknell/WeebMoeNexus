import * as z from "zod/v4";

const meaningfulQuery = z.string().trim().min(2).max(120);

export const selectedCharacterSearchInputSchema = z.strictObject({
  anidbIds: z.array(z.number().int().positive().safe()).min(1).max(5)
    .refine(ids => new Set(ids).size === ids.length, "Selected AniDB work IDs must be distinct"),
  query: meaningfulQuery,
  workTitle: meaningfulQuery.optional(),
  limit: z.number().int().min(1).max(25).default(10)
});
export type SelectedCharacterSearchInput = z.input<typeof selectedCharacterSearchInputSchema>;
export type ParsedSelectedCharacterSearchInput = z.output<typeof selectedCharacterSearchInputSchema>;

export const selectedCharacterSearchResultSchema = z.strictObject({
  scope: z.literal("explicit_selected_anidb_works"),
  query: z.string(),
  requestedWorkTitle: z.string().nullable(),
  examinedAnimeIds: z.array(z.number().int().positive().safe()).min(1).max(5),
  totalReportedCharacterRows: z.number().int().nonnegative(),
  totalNameMatches: z.number().int().nonnegative(),
  truncated: z.boolean(),
  /** A source row is a mention within a work, not a globally resolved character. */
  results: z.array(z.strictObject({
    sourceAnimeId: z.number().int().positive().safe(),
    sourceAnimeTitle: z.string().nullable(),
    sourceAnimeUrl: z.string().url(),
    anidbCharacterId: z.number().int().positive().safe(),
    sourceRowIndex: z.number().int().nonnegative(),
    characterName: z.string().min(1),
    characterUrl: z.string().url(),
    evidenceSourceField: z.string().min(1),
    retrievedAt: z.string(),
    nameMatch: z.enum(["exact", "normalized", "prefix", "contains"]),
    workTitleMatch: z.enum(["not_requested", "reported_match", "not_reported", "different_source_work"]),
    role: z.string().nullable(),
    gender: z.string().nullable(),
    voiceActor: z.strictObject({
      id: z.number().int().positive().nullable(),
      name: z.string(),
      picture: z.string().nullable()
    }).nullable()
  }))
});
export type SelectedCharacterSearchResult = z.infer<typeof selectedCharacterSearchResultSchema>;
