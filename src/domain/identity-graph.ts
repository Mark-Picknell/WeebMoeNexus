import * as z from "zod/v4";
import { entityReferenceSchema, relationshipEvidenceSchema } from "./relationship-edge.js";
import { entityReferenceKey } from "./field-claim.js";

export const identityAssertionSchema = z.strictObject({
  type: z.enum(["same_entity", "different_entity"]),
  from: entityReferenceSchema,
  to: entityReferenceSchema,
  evidence: z.array(relationshipEvidenceSchema).min(1)
}).refine(a => a.from.kind === a.to.kind, "Identity assertions must keep entity kinds separate");
const anchorSchema = z.strictObject({
  canonicalId: z.string().trim().min(1).max(128),
  entity: entityReferenceSchema,
  evidence: z.array(relationshipEvidenceSchema).min(1)
});
export const identityGraphInputSchema = z.strictObject({
  nodes: z.array(entityReferenceSchema).max(500),
  assertions: z.array(identityAssertionSchema).max(2000),
  anchors: z.array(anchorSchema).max(500)
}).superRefine((input, ctx) => {
  const nodes = new Set(input.nodes.map(entityReferenceKey));
  if (nodes.size !== input.nodes.length) ctx.addIssue({ code: "custom", message: "Identity nodes must be unique" });
  const references = [...input.assertions.flatMap(a => [a.from, a.to]), ...input.anchors.map(a => a.entity)];
  if (references.some(r => !nodes.has(entityReferenceKey(r)))) ctx.addIssue({ code: "custom", message: "Every identity endpoint must be supplied" });
  const kinds = new Map<string, string>();
  for (const anchor of input.anchors) {
    const previous = kinds.get(anchor.canonicalId);
    if (previous && previous !== anchor.entity.kind) ctx.addIssue({ code: "custom", message: "A canonical ID cannot join different entity kinds" });
    kinds.set(anchor.canonicalId, anchor.entity.kind);
  }
});
export const identityComponentSchema = z.strictObject({
  componentId: z.string().startsWith("component:"),
  kind: entityReferenceSchema.shape.kind,
  members: z.array(entityReferenceSchema).min(1),
  canonicalIds: z.array(z.string().min(1)),
  resolution: z.enum(["unassigned", "resolved_from_supplied_evidence", "conflicting"]),
  canonicalId: z.string().min(1).nullable(),
  conflicts: z.array(z.discriminatedUnion("type", [
    z.strictObject({ type: z.literal("different_entity_inside_component"), assertionIndex: z.number().int().nonnegative() }),
    z.strictObject({ type: z.literal("multiple_canonical_ids"), canonicalIds: z.array(z.string().min(1)).min(2) })
  ]))
});
export const identityGraphSchema = z.strictObject({
  scope: z.literal("supplied_identity_evidence"),
  input: identityGraphInputSchema,
  components: z.array(identityComponentSchema)
});
export type IdentityGraphInput = z.infer<typeof identityGraphInputSchema>;
export type IdentityGraph = z.infer<typeof identityGraphSchema>;
