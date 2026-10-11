import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { buildValidationReport, type ValidationFeature } from "../src/domain/validation-status.js";

const file = "test/synthetic.test.ts";
const feature: ValidationFeature = { id: "synthetic", implementation: "implemented", scope: "Authored contract only", testFiles: [file] };
const summary = { tests: 1, passed: 1, failed: 0, skipped: 0, cancelled: 0, todo: 0, success: true };
const status = (input: ValidationFeature, observations: Record<string, { passed: number; failed: number; skipped: number }>) =>
  buildValidationReport([input], observations, summary).features[0]!.status;

test("report distinguishes unimplemented, not run, skipped, failed and passed without conflation", () => {
  assert.equal(status({ ...feature, implementation: "not_implemented" }, { [file]: { passed: 1, failed: 0, skipped: 0 } }), "not_implemented");
  assert.equal(status(feature, {}), "test_not_run");
  assert.equal(status(feature, { [file]: { passed: 0, failed: 0, skipped: 1 } }), "test_skipped");
  assert.equal(status(feature, { [file]: { passed: 1, failed: 1, skipped: 0 } }), "test_failed");
  assert.equal(status(feature, { [file]: { passed: 1, failed: 0, skipped: 0 } }), "test_passed");
});

test("partial required-file execution and mixed skips cannot become a complete pass", () => {
  const observed = { [file]: { passed: 1, failed: 0, skipped: 0 } };
  const result = buildValidationReport([{ ...feature, testFiles: [file, "test/missing.test.ts"] }], observed, summary).features[0]!;
  assert.equal(result.status, "test_not_run"); assert.deepEqual(result.missingTestFiles, ["test/missing.test.ts"]);
  assert.equal(status(feature, { [file]: { passed: 10, failed: 0, skipped: 1 } }), "test_skipped");
  assert.equal(status({ ...feature, testFiles: [] }, {}), "test_not_run");
});

test("fixture checks cannot satisfy pending semantic golden queries, and failure remains reportable", () => {
  const corpus = JSON.parse(readFileSync(new URL("./fixtures/golden-query-cases.json", import.meta.url), "utf8"));
  const features = corpus.cases.map((c: any) => ({ id: c.id, implementation: "not_implemented", scope: "Semantic resolver pending", testFiles: [] }));
  const report = buildValidationReport(features, {}, { ...summary, success: false, failed: 1, passed: 0 });
  assert.equal(report.summary.success, false);
  assert.equal(report.features.length, 17);
  assert.ok(report.features.every(r => r.status === "not_implemented"));
});

test("feature manifest references real test files; invalid IDs/counts/paths reject", () => {
  const manifest = JSON.parse(readFileSync(new URL("./fixtures/validation-features.json", import.meta.url), "utf8"));
  assert.equal(manifest.schemaVersion, 1);
  for (const entry of manifest.features) for (const path of entry.testFiles) assert.ok(readFileSync(new URL("../" + path, import.meta.url), "utf8").length);
  assert.throws(() => buildValidationReport([feature, feature], {}, summary));
  assert.throws(() => buildValidationReport([feature], { [file]: { passed: -1, failed: 0, skipped: 0 } }, summary));
  assert.throws(() => buildValidationReport([{ ...feature, testFiles: ["../private"] }], {}, summary));
});
