import { mkdir, writeFile, rm } from "node:fs/promises";
import { Client, StreamableHTTPClientTransport } from "@modelcontextprotocol/client";

// Operator-invoked only after D-03/D-04. No provider reads or credentials in output.
const [endpoint, auth = "none", output = "artifacts/deployment-verification.json"] = process.argv.slice(2);
const required = ["health", "get_provider_status", "get_anime_by_anidb_id", "search_anime", "get_related_anime", "traverse_anime_relations", "find_character", "get_character", "compare_anime_entities", "get_anime_evidence"];
const client = new Client({ name: "weeb-moe-nexus-deployment-verifier", version: "1" });
try {
  await rm(output, { force: true });
  const url = new URL(endpoint);
  if (url.protocol !== "https:" || url.username || url.password || url.search || url.hash || url.pathname !== "/mcp" || !["none", "api_key"].includes(auth)) throw new Error();
  if (auth === "api_key" && !process.env.WMN_BEARER_TOKEN) throw new Error();
  const headers = auth === "api_key" ? { Authorization: `Bearer ${process.env.WMN_BEARER_TOKEN}` } : undefined;
  await client.connect(new StreamableHTTPClientTransport(url, { requestInit: { headers } }), { timeout: 15_000 });
  const listing = await client.listTools({}, { timeout: 15_000 });
  if (listing.tools.length !== required.length || required.some(name => !listing.tools.some(t => t.name === name && t.annotations?.readOnlyHint === true))) throw new Error();
  const health = await client.callTool({ name: "health", arguments: {} }, undefined, { timeout: 15_000 });
  const status = await client.callTool({ name: "get_provider_status", arguments: {} }, undefined, { timeout: 15_000 });
  if (health.isError || status.isError || health.structuredContent?.name !== "weeb-moe-nexus" || health.structuredContent?.status !== "ok") throw new Error();
  await mkdir(new URL("../artifacts/", import.meta.url), { recursive: true });
  await writeFile(output, JSON.stringify({ schemaVersion: 1, endpoint: url.href, auth, observedAt: new Date().toISOString(), checks: { toolsListed: required, readOnly: true, health: "passed", providerStatus: "passed" }, scope: "HTTPS MCP connectivity and passive calls only; no catalog read, client acceptance or public review" }, null, 2) + "\n", { mode: 0o600 });
  console.log("HTTPS MCP connectivity verified. Passive checks do not complete client acceptance.");
} catch {
  console.error("Deployment verification failed; no successful verification report was written."); process.exitCode = 1;
} finally { await client.close(); }
