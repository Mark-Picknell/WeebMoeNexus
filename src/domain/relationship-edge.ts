import * as z from "zod/v4";

/** IDs are provider-local and kind-local. Display names are never identifiers. */
export const entityReferenceSchema = z.strictObject({
  provider: z.string().trim().min(1),
  kind: z.enum(["work", "character", "contributor", "historical_person"]),
  id: z.string().trim().min(1)
});
export type EntityReference = z.infer<typeof entityReferenceSchema>;
const work = entityReferenceSchema.extend({ kind: z.literal("work") });
const character = entityReferenceSchema.extend({ kind: z.literal("character") });
const contributor = entityReferenceSchema.extend({ kind: z.literal("contributor") });
const portrayalTarget = z.union([character, entityReferenceSchema.extend({ kind: z.literal("historical_person") })]);

/** One assertion, not a consensus. Negative evidence remains negative. */
export const relationshipEvidenceSchema = z.strictObject({
  sourceRecord: entityReferenceSchema,
  sourceUrl: z.url({ protocol: /^https?$/ }),
  retrievedAt: z.iso.datetime({ offset: true }),
  sourceField: z.string().trim().min(1),
  /** Original reported field or serialized normalized row; never invented prose. */
  reportedValue: z.string().min(1),
  polarity: z.enum(["positive", "negative"])
});
export type RelationshipEvidence = z.infer<typeof relationshipEvidenceSchema>;
const common = { evidence: z.array(relationshipEvidenceSchema).min(1) };

/** Direction is explicit. No edge means no reported assertion, not a denial. */
export const relationshipEdgeSchema = z.discriminatedUnion("type", [
  z.strictObject({ ...common, type: z.literal("voice_credit"), from: contributor, to: character, work, language: z.string().min(1).nullable() }),
  z.strictObject({ ...common, type: z.literal("production_credit"), from: contributor, to: work, role: z.string().min(1).nullable() }),
  // A specific fictional portrayal points to its reported referent. This does
  // not identify the portrayal with the referent or other portrayals.
  z.strictObject({ ...common, type: z.literal("portrayal_of"), from: character, to: portrayalTarget, work }),
  z.strictObject({ ...common, type: z.literal("adaptation_of"), from: work, to: work }),
  z.strictObject({ ...common, type: z.literal("inherits_name_from"), from: character, to: character }),
  z.strictObject({ ...common, type: z.literal("cameo_in"), from: character, to: work }),
  // Even a conceptually reciprocal crossover stores only the reported
  // direction. A reverse assertion needs its own evidence.
  z.strictObject({ ...common, type: z.literal("crossover_with"), from: work, to: work }),
  // Escape hatch for a provider's uninterpreted work relation label. It cannot
  // automatically become adaptation, crossover or character identity.
  z.strictObject({ ...common, type: z.literal("reported_work_relation"), from: work, to: work, label: z.string().min(1) })
]);
export type RelationshipEdge = z.infer<typeof relationshipEdgeSchema>;
