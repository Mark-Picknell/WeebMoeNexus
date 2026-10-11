import * as z from "zod/v4";
import { fieldProjectionSchema } from "./field-claim.js";
import { fieldPreferenceSchema, sourcePreferencePolicySchema } from "./source-preference.js";

export const animeEvidenceInputSchema = z.strictObject({
  anidbId: z.number().int().positive().safe(),
  sourcePreference: sourcePreferencePolicySchema.default({ providers: [], allowUnlisted: true })
});
export const animeEvidenceResultSchema = z.strictObject({
  scope: z.literal("one_anidb_record"),
  anidbId: z.number().int().positive().safe(),
  projection: fieldProjectionSchema,
  fields: z.array(fieldPreferenceSchema),
  unassignedUnknownIndexes: z.array(z.number().int().nonnegative())
});
export type AnimeEvidenceInput = z.infer<typeof animeEvidenceInputSchema>;
export type AnimeEvidenceResult = z.infer<typeof animeEvidenceResultSchema>;
