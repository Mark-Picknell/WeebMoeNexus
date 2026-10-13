import * as z from "zod/v4";

export const selectedThemeSearchInputSchema = z.strictObject({
  anidbIds: z.array(z.number().int().positive().safe()).min(1).max(5)
    .refine(ids => new Set(ids).size === ids.length, "Selected AniDB work IDs must be distinct"),
  query: z.string().trim().min(2).max(120),
  sourceKinds: z.enum(["both", "tags", "categories"]).default("both"),
  includeKnownSpoilers: z.boolean().default(false),
  limit: z.number().int().min(1).max(30).default(10)
});
export type SelectedThemeSearchInput = z.input<typeof selectedThemeSearchInputSchema>;
export type ParsedSelectedThemeSearchInput = z.output<typeof selectedThemeSearchInputSchema>;

const sourceThemeMatchSchema = z.strictObject({
  sourceAnimeId: z.number().int().positive().safe(),
  sourceAnimeTitle: z.string().nullable(),
  sourceAnimeUrl: z.string().url(),
  retrievedAt: z.string(),
  kind: z.enum(["tag", "category"]),
  sourceRowIndex: z.number().int().nonnegative(),
  evidenceSourceField: z.string(),
  sourceTermId: z.number().int().positive().safe().nullable(),
  label: z.string().min(1),
  matchType: z.enum(["exact", "normalized", "prefix", "contains"]),
  approval: z.number().int().nonnegative().safe().nullable(),
  weight: z.number().int().nonnegative().safe().nullable(),
  localSpoiler: z.boolean().nullable(),
  globalSpoiler: z.boolean().nullable(),
  restrictedCategory: z.boolean().nullable()
});
export const selectedThemeSearchResultSchema = z.strictObject({
  scope: z.literal("selected_anidb_anime_source_tags_and_categories_only"),
  query: z.string(),
  examinedAnimeIds: z.array(z.number().int().positive().safe()).min(1).max(5),
  sourceKinds: z.enum(["both", "tags", "categories"]),
  includeKnownSpoilers: z.boolean(),
  totalReportedTagRows: z.number().int().nonnegative(),
  totalReportedCategoryRows: z.number().int().nonnegative(),
  totalLabelMatches: z.number().int().nonnegative(),
  excludedKnownSpoilerRows: z.number().int().nonnegative(),
  coverageGaps: z.array(z.strictObject({
    sourceAnimeId: z.number().int().positive().safe(),
    missingArrays: z.array(z.enum(["tags", "categories"])).min(1)
  })),
  truncated: z.boolean(),
  results: z.array(sourceThemeMatchSchema)
});
export type SelectedThemeSearchResult = z.infer<typeof selectedThemeSearchResultSchema>;
