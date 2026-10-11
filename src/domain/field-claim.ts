import * as z from "zod/v4";
import { entityReferenceSchema } from "./relationship-edge.js";

export const fieldValueSchema = z.union([z.string().min(1), z.number().finite(), z.boolean()]);
export const fieldContextSchema = z.strictObject({
  work: entityReferenceSchema.extend({ kind: z.literal("work") }).nullable(),
  qualifiers: z.record(z.string().min(1), z.string().min(1))
});
export const fieldEvidenceSchema = z.strictObject({
  sourceRecord: entityReferenceSchema,
  sourceUrl: z.url({ protocol: /^https?$/ }),
  retrievedAt: z.iso.datetime({ offset: true }),
  sourceField: z.string().min(1),
  representation: z.literal("normalized_scalar"),
  reportedValue: fieldValueSchema
});
/** One source assertion. Null/absence is represented separately, never negative. */
export const fieldClaimSchema = z.strictObject({
  subject: entityReferenceSchema,
  field: z.string().min(1),
  context: fieldContextSchema,
  value: fieldValueSchema,
  polarity: z.enum(["positive", "negative"]),
  evidence: fieldEvidenceSchema
});
export const fieldUnknownSchema = z.strictObject({
  subject: entityReferenceSchema.nullable(),
  field: z.string().min(1),
  context: fieldContextSchema,
  reason: z.enum(["missing_value", "missing_subject_id", "derived_display", "normalization_lost_presence", "not_modeled"]),
  sourceRecord: entityReferenceSchema,
  sourceUrl: z.url({ protocol: /^https?$/ }),
  retrievedAt: z.iso.datetime({ offset: true }),
  sourceField: z.string().min(1),
  normalizedValue: fieldValueSchema.nullable()
});
export const fieldProjectionSchema = z.strictObject({
  sourceRecord: entityReferenceSchema,
  claims: z.array(fieldClaimSchema),
  unknowns: z.array(fieldUnknownSchema)
});
export type FieldClaim = z.infer<typeof fieldClaimSchema>;
export type FieldContext = z.infer<typeof fieldContextSchema>;
export type FieldProjection = z.infer<typeof fieldProjectionSchema>;

/** Exact structural identity only. Key order is not semantic; names are not IDs. */
export function fieldContextKey(context: FieldContext): string {
  const parsed = fieldContextSchema.parse(context);
  return JSON.stringify([parsed.work && [parsed.work.provider, parsed.work.kind, parsed.work.id],
    Object.entries(parsed.qualifiers).sort(([a], [b]) => a < b ? -1 : a > b ? 1 : 0)]);
}
export function entityReferenceKey(entity: z.infer<typeof entityReferenceSchema>): string {
  const parsed = entityReferenceSchema.parse(entity);
  return JSON.stringify([parsed.provider, parsed.kind, parsed.id]);
}
