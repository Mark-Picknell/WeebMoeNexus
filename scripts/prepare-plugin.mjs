import { readFile, mkdir, writeFile, copyFile, rm } from "node:fs/promises";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const required = ["health", "get_provider_status", "get_anime_by_anidb_id", "search_anime", "get_related_anime", "traverse_anime_relations", "find_character", "get_character", "compare_anime_entities", "get_anime_evidence"];
const httpsUrl = value => {
  try {
    const u = new URL(value);
    return typeof value === "string" && u.protocol === "https:" && !u.username && !u.password && !u.hash && !u.search &&
      !["localhost", "127.0.0.1", "[::1]"].includes(u.hostname) && !u.hostname.endsWith(".test") && !u.hostname.endsWith(".invalid") && !u.hostname.endsWith(".example");
  } catch { return false; }
};

/** Validates an operator-supplied observation, not authenticity or dashboard approval. */
export function packagePlan(manifest, verification, now = Date.now()) {
  const blockers = [];
  if (manifest?.name !== "weeb-moe-nexus" || manifest?.$schema !== "https://agent-plugins.org/schemas/1.0.0/plugin.schema.json" || typeof manifest?.version !== "string" || !/^\d+\.\d+\.\d+$/.test(manifest.version)) blockers.push("package.identity");
  const metadata = manifest?.extensions?.["com.openai"];
  const listing = metadata?.interface;
  for (const [key, max] of [["displayName", 30], ["shortDescription", 30], ["longDescription", 4000], ["developerName", 80], ["category", 120]]) {
    if (typeof listing?.[key] !== "string" || !listing[key].trim() || listing[key].length > max) blockers.push(`listing.${key}`);
  }
  for (const key of ["websiteURL", "supportURL", "privacyPolicyURL", "termsOfServiceURL"]) if (!httpsUrl(listing?.[key])) blockers.push(`listing.${key}`);
  for (const key of ["logo", "composerIcon"]) if (listing?.[key] !== "./assets/icon.svg") blockers.push(`listing.${key}`);
  const positive = metadata?.review?.test_cases?.positive, negative = metadata?.review?.test_cases?.negative;
  if (!Array.isArray(positive) || positive.length !== 5 || positive.some(c => !c || ["description", "prompt", "tools_triggered", "expected_behavior"].some(k => typeof c[k] !== "string" || !c[k].trim()) || c.tools_triggered.split(",").some(t => !required.includes(t.trim())))) blockers.push("review.positive_cases");
  if (!Array.isArray(negative) || negative.length !== 3 || negative.some(c => !c || ["description", "prompt"].some(k => typeof c[k] !== "string" || !c[k].trim()))) blockers.push("review.negative_cases");
  if (!httpsUrl(metadata?.review?.demo_recording_url)) blockers.push("review.demo_recording_url");
  const age = now - Date.parse(verification?.observedAt);
  if (verification?.schemaVersion !== 1 || !httpsUrl(verification?.endpoint) || new URL(verification.endpoint).pathname !== "/mcp" || !Number.isFinite(age) || age < 0 || age > 24 * 60 * 60_000 || verification.checks?.readOnly !== true || verification.checks?.health !== "passed" || verification.checks?.providerStatus !== "passed" || verification.checks?.toolsListed?.length !== required.length || required.some(name => !verification.checks?.toolsListed?.includes(name))) blockers.push("deployment.fresh_verified_endpoint");
  if (verification?.auth !== "none") blockers.push("deployment.portal_supported_auth");
  const permittedRoot = ["$schema", "name", "version", "description", "repository", "keywords", "extensions", "author", "homepage", "license"];
  const permittedListing = ["displayName", "shortDescription", "longDescription", "developerName", "category", "capabilities", "websiteURL", "supportURL", "privacyPolicyURL", "termsOfServiceURL", "defaultPrompt", "logo", "composerIcon"];
  if (!manifest || Object.keys(manifest).some(k => !permittedRoot.includes(k)) || Object.keys(manifest.extensions ?? {}).some(k => k !== "com.openai") || Object.keys(metadata ?? {}).some(k => !["interface", "review", "publication"].includes(k)) || Object.keys(listing ?? {}).some(k => !permittedListing.includes(k)) || Object.keys(metadata?.review ?? {}).some(k => !["test_cases", "demo_recording_url", "commerce", "commerce_description"].includes(k))) blockers.push("package.unsupported_metadata");
  if (blockers.length) return { status: "blocked", blockers };
  return { status: "prepared", blockers: [], mcp: { $schema: "https://agent-plugins.org/schemas/1.0.0/mcp.schema.json", mcpServers: { "weeb-moe-nexus": { type: "streamable-http", url: verification.endpoint, extensions: { "com.openai": { auth: { type: "none" } } } } } } };
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const [verificationPath, manifestPath = resolve(root, "plugin.json")] = process.argv.slice(2);
  const output = resolve(root, "artifacts/plugin-package");
  // Never leave a previously generated package masquerading as this attempt.
  await rm(output, { recursive: true, force: true });
  let manifest, verification;
  try { manifest = JSON.parse(await readFile(manifestPath, "utf8")); } catch { console.error("Package manifest could not be read."); process.exitCode = 1; }
  if (manifest) {
    try { verification = JSON.parse(await readFile(verificationPath, "utf8")); } catch { /* missing deployment is an explicit blocker */ }
    const plan = packagePlan(manifest, verification);
    console.log(JSON.stringify({ status: plan.status, blockers: plan.blockers }, null, 2));
    if (plan.status !== "prepared") process.exitCode = 1;
    else {
      await mkdir(resolve(output, "assets"), { recursive: true });
      await writeFile(resolve(output, "plugin.json"), JSON.stringify(manifest, null, 2) + "\n");
      await writeFile(resolve(output, "mcp.json"), JSON.stringify(plan.mcp, null, 2) + "\n");
      await copyFile(resolve(root, "assets/icon.svg"), resolve(output, "assets/icon.svg"));
      console.log("Plugin directory prepared. Run platform validation and review before publication.");
    }
  }
}
