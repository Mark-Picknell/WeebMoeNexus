import * as z from "zod/v4";
const sourceId = z.number().int().positive().safe();

/** A deliberately narrow character-clue recall request, not a frame search. */
export const scopedSceneRecallInputSchema = z.strictObject({
  anidbId: sourceId,
  cues: z.array(z.string().trim().min(2).max(80)).min(1).max(6),
  episodeId: sourceId.optional(),
  mode: z.enum(["any", "all"]).default("any"),
  limit: z.number().int().min(1).max(25).default(10)
});
export type ScopedSceneRecallInput = z.input<typeof scopedSceneRecallInputSchema>;
export type ParsedScopedSceneRecallInput = z.output<typeof scopedSceneRecallInputSchema>;

const episodeEvidenceSchema = z.strictObject({
  raw: z.string().nullable(),
  parseStatus: z.enum(["unknown", "complete", "partial"]),
  coverage: z.enum(["unknown", "all_references_listed", "some_references_unlisted"]),
  references: z.array(z.string()), linkedEpisodeIds: z.array(sourceId),
  unresolvedReferences: z.array(z.string()), unparsedTokens: z.array(z.string()),
  sourceEpisodeMetadataCount: z.number().int().nonnegative()
});
export const scopedSceneRecallResultSchema = z.strictObject({
  scope: z.literal("one_explicit_anidb_work_source_text_clues"),
  sourceAnimeId: sourceId,
  sourceAnimeTitle: z.string().nullable(),
  sourceUrl: z.string().url(),
  retrievedAt: z.iso.datetime({offset:true}),
  requestedCues: z.array(z.string()).min(1).max(6),
  mode: z.enum(["any","all"]),
  requestedEpisodeId: sourceId.nullable(),
  sourceEpisodeStatus: z.enum(["not_requested","reported","not_reported"]),
  reportedCharacterRows: z.number().int().nonnegative(),
  descriptionRows: z.number().int().nonnegative(),
  legacyDescriptionUnknownRows: z.number().int().nonnegative(),
  matchedCharacterRows: z.number().int().nonnegative(),
  truncated: z.boolean(),
  /** Neither source prose nor episode reference confirms anything in a specific scene. */
  sceneIdentification: z.literal("not_performed"),
  sourceMentionsAreNotVerifiedTraits: z.literal(true),
  candidates: z.array(z.strictObject({
    sourceRowIndex: z.number().int().nonnegative(),
    characterId: sourceId,
    characterName: z.string().nullable(),
    characterUrl: z.string().url(),
    descriptionSourceField: z.string().min(1),
    matchedCues: z.array(z.strictObject({
      requestedCue: z.string(),
      normalizedExcerpt: z.string().max(220),
      evidenceKind: z.literal("literal_normalized_text_mention")
    })).min(1).max(6),
    unverifiedCues: z.array(z.string()),
    characterType: z.strictObject({id: sourceId.nullable(),name:z.string().nullable()}).nullable(),
    voiceActor: z.strictObject({id:sourceId.nullable(),name:z.string()}).nullable(),
    episodeReferenceStatus: z.enum(["not_requested","reported_positive","unverified"]),
    episodeEvidence: episodeEvidenceSchema,
    assertionStatus: z.literal("candidate_not_identification")
  })).max(25)
});
export type ScopedSceneRecallResult = z.infer<typeof scopedSceneRecallResultSchema>;
