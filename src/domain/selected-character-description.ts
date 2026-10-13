import * as z from "zod/v4";
const id = z.number().int().positive().safe();
export const selectedCharacterDescriptionInputSchema = z.strictObject({
  anidbIds: z.array(id).min(1).max(5)
    .refine(ids => new Set(ids).size === ids.length, "Selected work IDs must be unique"),
  cues: z.array(z.string().trim().min(2).max(80)).min(1).max(6),
  mode: z.enum(["any", "all"]).default("any"),
  limit: z.number().int().min(1).max(25).default(10)
});
export type SelectedCharacterDescriptionInput = z.input<typeof selectedCharacterDescriptionInputSchema>;
export type ParsedSelectedCharacterDescriptionInput = z.output<typeof selectedCharacterDescriptionInputSchema>;

const mentionSchema = z.strictObject({
  requestedCue: z.string(),
  sourceField: z.string().min(1),
  /** Normalized excerpt only, not an exact quote or evidence of a positive trait. */
  normalizedExcerpt: z.string().max(220),
  evidenceKind: z.literal("literal_normalized_text_mention")
});
export const selectedCharacterDescriptionResultSchema = z.strictObject({
  scope: z.literal("selected_anidb_character_description_text_only"),
  examinedAnimeIds: z.array(id).min(1).max(5),
  cues: z.array(z.string().min(1)).min(1).max(6),
  mode: z.enum(["any", "all"]),
  totalReportedCharacterRows: z.number().int().nonnegative(),
  descriptionsReported: z.number().int().nonnegative(),
  legacyDescriptionUnknownRows: z.number().int().nonnegative(),
  matchedCharacterRows: z.number().int().nonnegative(),
  truncated: z.boolean(),
  /** A mention can be negated, fictional or figurative; never promotes a trait assertion. */
  sourceMentionsAreNotVerifiedTraits: z.literal(true),
  candidates: z.array(z.strictObject({
    sourceAnimeId: id,
    sourceAnimeTitle: z.string().nullable(),
    sourceUrl: z.string().url(),
    retrievedAt: z.iso.datetime({offset:true}),
    sourceRowIndex: z.number().int().nonnegative(),
    characterId: id,
    characterName: z.string().nullable(),
    characterUrl: z.string().url(),
    characterType: z.strictObject({id:id.nullable(),name:z.string().nullable()}).nullable(),
    descriptionCoverage: z.literal("reported_text"),
    matchedCues: z.array(mentionSchema).min(1),
    unverifiedCues: z.array(z.string().min(1)),
    /**
     * Multiple source mentions do not establish an appearance; their presence
     * is evidence that these words appear in the original description.
     */
    assertionStatus: z.literal("lexical_mentions_only")
  })).max(25)
});
export type SelectedCharacterDescriptionResult = z.infer<typeof selectedCharacterDescriptionResultSchema>;
