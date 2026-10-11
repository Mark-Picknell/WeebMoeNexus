import * as z from "zod/v4";
import { fieldAssessmentSchema } from "./field-assessment.js";

/** Caller-selected display priority, not truth, trust, freshness or authority. */
export const sourcePreferencePolicySchema = z.strictObject({
  providers: z.array(z.string().trim().min(1)).max(10).default([]),
  allowUnlisted: z.boolean().default(true)
}).refine(p => new Set(p.providers).size === p.providers.length, "Source priorities must be unique");
export const fieldPreferenceSchema = z.strictObject({
  policy: sourcePreferencePolicySchema,
  assessment: fieldAssessmentSchema,
  status: z.enum(["no_claims", "no_eligible_source", "preferred_claims"]),
  preferredClaimIndexes: z.array(z.number().int().nonnegative()),
  otherClaimIndexes: z.array(z.number().int().nonnegative())
}).superRefine((result, ctx) => {
  const combined = [...result.preferredClaimIndexes, ...result.otherClaimIndexes];
  if (combined.length !== result.assessment.claims.length || new Set(combined).size !== combined.length ||
    combined.some(i => i >= result.assessment.claims.length)) {
    ctx.addIssue({ code: "custom", message: "Preference must account for every claim exactly once" });
  }
  const expected = result.preferredClaimIndexes.length ? "preferred_claims" : result.assessment.claims.length ? "no_eligible_source" : "no_claims";
  if (result.status !== expected) ctx.addIssue({ code: "custom", message: "Preference status must match retained claims" });
});
export type SourcePreferencePolicy = z.infer<typeof sourcePreferencePolicySchema>;
export type FieldPreference = z.infer<typeof fieldPreferenceSchema>;
