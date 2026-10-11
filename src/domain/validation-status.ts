import * as z from "zod/v4";

export const validationFeatureSchema = z.strictObject({
  id: z.string().min(1),
  implementation: z.enum(["implemented", "not_implemented"]),
  scope: z.string().min(1),
  testFiles: z.array(z.string().regex(/^test\/[a-z0-9/-]+\.test\.ts$/))
}).refine(f => new Set(f.testFiles).size === f.testFiles.length, "Required test files must be unique");
const observationSchema = z.strictObject({
  passed: z.number().int().nonnegative(), failed: z.number().int().nonnegative(), skipped: z.number().int().nonnegative()
});
export const validationSummarySchema = z.strictObject({
  tests: z.number().int().nonnegative(), passed: z.number().int().nonnegative(), failed: z.number().int().nonnegative(),
  skipped: z.number().int().nonnegative(), cancelled: z.number().int().nonnegative(), todo: z.number().int().nonnegative(), success: z.boolean()
});
export const validationReportSchema = z.strictObject({
  generatedAt: z.iso.datetime({ offset: true }),
  kind: z.literal("offline_contracts"),
  summary: validationSummarySchema,
  features: z.array(z.strictObject({
    feature: validationFeatureSchema,
    status: z.enum(["not_implemented", "test_not_run", "test_skipped", "test_failed", "test_passed"]),
    observed: observationSchema,
    missingTestFiles: z.array(z.string())
  }))
});
export type ValidationFeature = z.infer<typeof validationFeatureSchema>;

/** Test evidence cannot turn an unimplemented semantic resolver into a pass. */
export function buildValidationReport(rawFeatures: ValidationFeature[], rawObservations: Record<string, z.infer<typeof observationSchema>>,
  rawSummary: z.infer<typeof validationSummarySchema>, now = new Date().toISOString()) {
  const features = z.array(validationFeatureSchema).parse(rawFeatures);
  if (new Set(features.map(f => f.id)).size !== features.length) throw new Error("Validation feature IDs must be unique");
  const observations = z.record(z.string(), observationSchema).parse(rawObservations);
  const summary = validationSummarySchema.parse(rawSummary);
  return validationReportSchema.parse({ generatedAt: now, kind: "offline_contracts", summary,
    features: features.map(feature => {
      const missingTestFiles = feature.testFiles.filter(file => !observations[file] ||
        observations[file].passed + observations[file].failed + observations[file].skipped === 0);
      const observed = feature.testFiles.reduce((total, file) => {
        const row = observations[file];
        if (row) { total.passed += row.passed; total.failed += row.failed; total.skipped += row.skipped; }
        return total;
      }, { passed: 0, failed: 0, skipped: 0 });
      const status = feature.implementation === "not_implemented" ? "not_implemented" : observed.failed ? "test_failed"
        : missingTestFiles.length || !feature.testFiles.length ? "test_not_run" : observed.skipped ? "test_skipped"
        : observed.passed ? "test_passed" : "test_not_run";
      return { feature, status, observed, missingTestFiles };
    }) });
}
