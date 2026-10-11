import assert from "node:assert/strict";
import test from "node:test";
import { readFile } from "node:fs/promises";
// Packaging script has no side effects on import and accepts synthetic observations.
import { packagePlan } from "../scripts/prepare-plugin.mjs";

const source = JSON.parse(await readFile(new URL("../plugin.json", import.meta.url), "utf8"));
const now = Date.parse("2026-10-11T01:00:00Z");
const tools = ["health", "get_provider_status", "get_anime_by_anidb_id", "search_anime", "get_related_anime", "traverse_anime_relations", "find_character", "get_character", "compare_anime_entities", "get_anime_evidence"];
function syntheticReady() {
  const manifest = structuredClone(source);
  const meta = manifest.extensions["com.openai"];
  Object.assign(meta.interface, { developerName: "Synthetic Fixture Publisher", category: "Developer Tools", websiteURL: "https://fixture.example.org", supportURL: "https://fixture.example.org/support", privacyPolicyURL: "https://fixture.example.org/privacy", termsOfServiceURL: "https://fixture.example.org/terms" });
  meta.review.demo_recording_url = "https://fixture.example.org/demo";
  const verification = { schemaVersion: 1, endpoint: "https://fixture.example.org/mcp", auth: "none", observedAt: new Date(now).toISOString(), checks: { readOnly: true, toolsListed: tools, health: "passed", providerStatus: "passed" } };
  return { manifest, verification };
}

test("checked-in plugin remains explicitly blocked on real deployment and publisher review materials", () => {
  const result = packagePlan(source, undefined, now);
  assert.equal(result.status, "blocked");
  for (const blocker of ["listing.developerName", "listing.category", "listing.privacyPolicyURL", "review.demo_recording_url", "deployment.fresh_verified_endpoint"]) assert.ok(result.blockers.includes(blocker));
  assert.equal(source.extensions["com.openai"].review.test_cases.positive.length, 5);
  assert.equal(source.extensions["com.openai"].review.test_cases.negative.length, 3);
});

test("package plan generates the portable headless MCP contract only from a fresh declared observation", () => {
  const { manifest, verification } = syntheticReady();
  const result = packagePlan(manifest, verification, now);
  assert.equal(result.status, "prepared");
  assert.equal(result.mcp.mcpServers["weeb-moe-nexus"].type, "streamable-http");
  assert.equal(result.mcp.mcpServers["weeb-moe-nexus"].url, verification.endpoint);
  assert.deepEqual(result.mcp.mcpServers["weeb-moe-nexus"].extensions["com.openai"].auth, { type: "none" });
  assert.equal(packagePlan(manifest, verification, now + 24 * 60 * 60_000 + 1).status, "blocked");
  assert.equal(packagePlan(manifest, verification, now - 1).status, "blocked");
});

test("packaging rejects missing passive checks, local placeholders, unsupported auth and unknown tools", () => {
  for (const override of [
    { auth: "api_key" }, { endpoint: "http://fixture.example.org/mcp" }, { endpoint: "https://localhost/mcp" },
    { endpoint: "https://fixture.example.test/mcp" }, { endpoint: "https://fixture.example.org/mcp?token=private" },
    { checks: { readOnly: true, health: "passed", providerStatus: "passed", toolsListed: tools.slice(1) } },
    { checks: { readOnly: true, health: "failed", providerStatus: "passed", toolsListed: tools } }
  ]) {
    const { manifest, verification } = syntheticReady();
    assert.equal(packagePlan(manifest, { ...verification, ...override }, now).status, "blocked");
  }
  const { manifest, verification } = syntheticReady();
  manifest.extensions["com.openai"].review.test_cases.positive[0].tools_triggered = "global_doctor_search";
  assert.equal(packagePlan(manifest, verification, now).status, "blocked");
});

test("reviewer credentials and lifecycle hooks cannot be smuggled through package metadata", () => {
  const { manifest, verification } = syntheticReady();
  manifest.extensions["com.openai"].review.test_credentials = "private-secret";
  assert.ok(packagePlan(manifest, verification, now).blockers.includes("package.unsupported_metadata"));
  delete manifest.extensions["com.openai"].review.test_credentials;
  manifest.extensions["com.openai"].hooks = { SessionStart: [] };
  assert.ok(packagePlan(manifest, verification, now).blockers.includes("package.unsupported_metadata"));
});
