import * as z from "zod/v4";
import { fieldClaimSchema, fieldUnknownSchema, fieldContextKey, entityReferenceKey, type FieldClaim, type FieldProjection } from "../domain/field-claim.js";
import { fieldAssessmentInputSchema, fieldAssessmentSchema, fieldValueKey, type FieldAssessment, type FieldAssessmentInput } from "../domain/field-assessment.js";

/** Preserve assertions, including duplicates and their dates; never pick a winner. */
export function assessFieldClaims(input: FieldAssessmentInput, rawClaims: FieldClaim[],
  rawUnknowns: FieldProjection["unknowns"] = []): FieldAssessment {
  const request = fieldAssessmentInputSchema.parse(input);
  const allClaims = z.array(fieldClaimSchema).max(1000).parse(rawClaims);
  const allUnknowns = z.array(fieldUnknownSchema).max(1000).parse(rawUnknowns);
  const subjects = new Set(request.subjects.map(entityReferenceKey));
  const context = fieldContextKey(request.context);
  const included = (row: FieldClaim | FieldProjection["unknowns"][number]) =>
    row.subject !== null && subjects.has(entityReferenceKey(row.subject)) &&
    row.field === request.field && fieldContextKey(row.context) === context;
  const claims = allClaims.filter(included);
  const unknowns = allUnknowns.filter(included);
  const groups = new Map<string, { value: FieldClaim["value"]; positive: number[]; negative: number[] }>();
  claims.forEach((claim, index) => {
    const key = fieldValueKey(claim.value);
    const group = groups.get(key) ?? { value: claim.value, positive: [], negative: [] };
    group[claim.polarity].push(index);
    groups.set(key, group);
  });
  const conflicts: FieldAssessment["conflicts"] = [];
  const positive = [...groups.values()].filter(g => g.positive.length);
  if (request.cardinality === "single" && positive.length > 1) {
    conflicts.push({ type: "different_single_values", alternatives: positive.map(g => ({ value: g.value, claimIndexes: g.positive })) });
  }
  for (const group of groups.values()) {
    if (group.positive.length && group.negative.length) conflicts.push({ type: "opposing_assertions",
      value: group.value, positiveClaimIndexes: group.positive, negativeClaimIndexes: group.negative });
  }
  const status = conflicts.length ? "conflicting" : positive.length ? "reported" : claims.length ? "negative_only" : "unknown";
  return fieldAssessmentSchema.parse({ scope: "explicit_subjects_and_context", request, status, claims, unknowns,
    excludedClaimCount: allClaims.length - claims.length, excludedUnknownCount: allUnknowns.length - unknowns.length, conflicts });
}
