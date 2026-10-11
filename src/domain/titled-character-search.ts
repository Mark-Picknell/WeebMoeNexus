import * as z from "zod/v4";
import { selectedCharacterSearchResultSchema } from "./selected-character-search.js";

/** The local title index chooses a work only when its match is unique and non-fuzzy. */
export const titledCharacterSearchInputSchema = z.strictObject({
  animeTitle: z.string().trim().min(2).max(160),
  characterName: z.string().trim().min(2).max(120),
  limit: z.number().int().min(1).max(25).default(10)
});

export const titleCandidateSchema = z.strictObject({
  anidbId: z.number().int().positive().safe(),
  title: z.string(),
  matchedTitle: z.string(),
  matchedLanguage: z.string(),
  matchedKind: z.string(),
  matchType: z.enum(["exact", "normalized", "fuzzy"]),
  editDistance: z.number().int().positive().optional(),
  sourceUrl: z.string().url()
});

export const titledCharacterSearchResultSchema = z.strictObject({
  scope: z.literal("local_title_index_to_one_anidb_work"),
  animeTitleQuery: z.string(),
  characterNameQuery: z.string(),
  titleMatchCount: z.number().int().nonnegative(),
  workCandidates: z.array(titleCandidateSchema).max(25),
  status: z.enum([
    "no_local_work_match", "ambiguous_work_requires_selection",
    "fuzzy_work_requires_selection", "unique_work_searched"
  ]),
  selectedAnimeId: z.number().int().positive().safe().nullable(),
  characterSearch: selectedCharacterSearchResultSchema.nullable()
}).superRefine((data, ctx) => {
  const unique = data.status === "unique_work_searched";
  if ((data.characterSearch !== null) !== unique || (data.selectedAnimeId !== null) !== unique) {
    ctx.addIssue({ code: "custom", message: "Character search only exists for selected unique work" });
  }
  if (unique && (data.titleMatchCount !== 1 || data.workCandidates[0]?.anidbId !== data.selectedAnimeId ||
    data.workCandidates[0]?.matchType === "fuzzy" ||
    data.characterSearch?.examinedAnimeIds[0] !== data.selectedAnimeId)) {
    ctx.addIssue({ code: "custom", message: "Selected work must be a unique non-fuzzy title match" });
  }
});
export type TitledCharacterSearchInput = z.input<typeof titledCharacterSearchInputSchema>;
export type TitledCharacterSearchResult = z.infer<typeof titledCharacterSearchResultSchema>;
