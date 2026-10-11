import * as z from "zod/v4";
import { entityReferenceSchema } from "./relationship-edge.js";
import { fieldClaimSchema, fieldContextSchema, fieldUnknownSchema, fieldValueSchema, entityReferenceKey } from "./field-claim.js";

/** Comparison membership is explicit; it is not a canonical identity assertion. */
export const fieldAssessmentInputSchema = z.strictObject({
  subjects: z.array(entityReferenceSchema).min(1).max(10),
  field: z.string().min(1),
  context: fieldContextSchema,
  cardinality: z.enum(["single", "multiple"])
}).superRefine((value, ctx) => {
  if (new Set(value.subjects.map(entityReferenceKey)).size !== value.subjects.length) {
    ctx.addIssue({ code: "custom", message: "Comparison subjects must be unique" });
  }
  if (new Set(value.subjects.map(s => s.kind)).size !== 1) {
    ctx.addIssue({ code: "custom", message: "Different entity kinds require separate comparisons" });
  }
});
const indexes = z.array(z.number().int().nonnegative()).min(1);
const alternative = z.strictObject({ value: fieldValueSchema, claimIndexes: indexes });
export const fieldConflictSchema = z.discriminatedUnion("type", [
  z.strictObject({ type: z.literal("opposing_assertions"), value: fieldValueSchema, positiveClaimIndexes: indexes, negativeClaimIndexes: indexes }),
  z.strictObject({ type: z.literal("different_single_values"), alternatives: z.array(alternative).min(2) })
]);
export const fieldAssessmentSchema = z.strictObject({
  scope: z.literal("explicit_subjects_and_context"),
  request: fieldAssessmentInputSchema,
  status: z.enum(["unknown", "reported", "negative_only", "conflicting"]),
  claims: z.array(fieldClaimSchema),
  unknowns: z.array(fieldUnknownSchema),
  excludedClaimCount: z.number().int().nonnegative(),
  excludedUnknownCount: z.number().int().nonnegative(),
  conflicts: z.array(fieldConflictSchema)
});
export type FieldAssessmentInput = z.infer<typeof fieldAssessmentInputSchema>;
export type FieldAssessment = z.infer<typeof fieldAssessmentSchema>;

/** Value type matters. No transliteration, taxonomy or fuzzy equivalence. */
export function fieldValueKey(value: z.infer<typeof fieldValueSchema>): string {
  return JSON.stringify([typeof value, fieldValueSchema.parse(value)]);
}
