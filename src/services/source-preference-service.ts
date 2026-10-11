import { sourcePreferencePolicySchema, fieldPreferenceSchema, type FieldPreference } from "../domain/source-preference.js";
import type { FieldAssessmentInput } from "../domain/field-assessment.js";
import type { FieldClaim, FieldProjection } from "../domain/field-claim.js";
import { assessFieldClaims } from "./field-assessment-service.js";

/** Rank source evidence; never alter assessments or choose an identity/value. */
export function preferFieldClaims(request: FieldAssessmentInput, claims: FieldClaim[],
  unknowns: FieldProjection["unknowns"] = [], policyInput: { providers?: string[]; allowUnlisted?: boolean } = {}): FieldPreference {
  const policy = sourcePreferencePolicySchema.parse(policyInput);
  const assessment = assessFieldClaims(request, claims, unknowns);
  const priority = new Map(policy.providers.map((provider, rank) => [provider, rank]));
  const ranks = assessment.claims.map(c => priority.get(c.evidence.sourceRecord.provider) ??
    (policy.allowUnlisted ? policy.providers.length : Infinity));
  const best = Math.min(Infinity, ...ranks);
  const preferredClaimIndexes: number[] = [], otherClaimIndexes: number[] = [];
  ranks.forEach((rank, index) => {
    if (Number.isFinite(best) && rank === best) preferredClaimIndexes.push(index);
    else otherClaimIndexes.push(index);
  });
  return fieldPreferenceSchema.parse({ policy, assessment,
    status: preferredClaimIndexes.length ? "preferred_claims" : assessment.claims.length ? "no_eligible_source" : "no_claims",
    preferredClaimIndexes, otherClaimIndexes });
}
