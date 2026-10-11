import { readFileSync, mkdirSync, writeFileSync } from "node:fs";
import { relative } from "node:path";
import { buildValidationReport } from "../src/domain/validation-status.ts";

export default async function* reporter(source) {
  const observed = {}, results = [];
  let finalSummary;
  for await (const event of source) {
    const data = event.data;
    if ((event.type === "test:pass" || event.type === "test:fail") && data.details?.type !== "suite") {
      const status = data.skip || data.todo ? "skipped" : event.type === "test:fail" ? "failed" : "passed";
      const file = data.file ? relative(process.cwd(), data.file).replaceAll("\\", "/") : null;
      if (file) { observed[file] ??= { passed: 0, failed: 0, skipped: 0 }; observed[file][status]++; }
      results.push({ file, name: data.name, status });
      yield `${status === "passed" ? "PASS" : status === "skipped" ? "SKIP" : "FAIL"} ${data.name}\n`;
      if (status === "failed") yield `${data.details?.error?.stack ?? "Test failure"}\n`;
    }
    if (event.type === "test:summary" && data.file === undefined) finalSummary = data;
    if (event.type === "test:stderr") yield data.message;
  }
  if (!finalSummary) throw new Error("Offline test stream ended without a complete summary");
  const manifest = JSON.parse(readFileSync(new URL("../test/fixtures/validation-features.json", import.meta.url), "utf8"));
  const golden = JSON.parse(readFileSync(new URL("../test/fixtures/golden-query-cases.json", import.meta.url), "utf8"));
  // Golden fixture integrity is reported separately from semantic resolution.
  const features = [...manifest.features, ...golden.cases.map(c => ({ id: c.id,
    implementation: c.execution.status === "pending_resolver" ? "not_implemented" : "implemented",
    scope: "Natural-language semantic resolution, not fixture integrity", testFiles: c.execution.testFiles ?? [] }))];
  const counts = finalSummary.counts;
  const report = buildValidationReport(features, observed, { tests: counts.tests, passed: counts.passed,
    failed: counts.failed ?? results.filter(r => r.status === "failed").length,
    skipped: counts.skipped, cancelled: counts.cancelled, todo: counts.todo, success: finalSummary.success });
  mkdirSync("artifacts", { recursive: true });
  writeFileSync("artifacts/validation-report.json", JSON.stringify({ ...report, testResults: results }, null, 2) + "\n");
  const markdown = ["# Offline validation report", "", `Tests: ${report.summary.tests}; passed: ${report.summary.passed}; failed: ${report.summary.failed}; skipped: ${report.summary.skipped}; cancelled: ${report.summary.cancelled}; todo: ${report.summary.todo}.`, "",
    "These are offline contract results. Natural-language golden cases remain separate from fixture checks.", "", "| Feature | Status | Scope |", "|---|---|---|",
    ...report.features.map(r => `| ${r.feature.id} | ${r.status} | ${r.feature.scope.replaceAll("|", "/")} |`), ""].join("\n");
  writeFileSync("artifacts/validation-report.md", markdown);
  yield `\nTests ${report.summary.tests}; passed ${report.summary.passed}; failed ${report.summary.failed}; skipped ${report.summary.skipped}.\nValidation report: artifacts/validation-report.json and artifacts/validation-report.md\n`;
}
