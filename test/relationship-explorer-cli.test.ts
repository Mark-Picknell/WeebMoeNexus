import assert from "node:assert/strict";
import test from "node:test";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { spawnSync } from "node:child_process";
import { mapAniDbAnimeXml } from "../src/providers/anidb/mapper.js";
import { traverseAnimeRelations } from "../src/services/relation-graph-service.js";

const stamp = "2026-10-11T23:15:00.000Z";
function callCli(input: string, output: string) {
  return spawnSync(process.execPath, [
    "--import", "tsx", "src/cli/export-relationship-graph.ts",
    "--input", input, "--output", output
  ], { cwd: new URL("../", import.meta.url), encoding: "utf8", timeout: 20_000 });
}

test("offline CLI exports an actual MCP tool envelope to self-contained HTML and never overwrites", async () => {
  const dir = await mkdtemp(join(tmpdir(), "nexus-relation-ui-"));
  const input = join(dir, "traversal.json"), output = join(dir, "graph.html");
  try {
    const anime = mapAniDbAnimeXml(`<anime id="200"><titles><title type="main">Synthetic Root</title></titles>
      <relatedanime><anime id="201" type="sequel">Synthetic Target</anime></relatedanime></anime>`, stamp);
    const traversal = await traverseAnimeRelations({ anidbId: 200 }, {
      async getByAniDbId() { return anime; }
    });
    await writeFile(input, JSON.stringify({ structuredContent: traversal, isError: false }), "utf8");
    const completed = callCli(input, output);
    assert.equal(completed.status, 0, completed.stderr);
    assert.match(completed.stdout, /Offline relationship explorer created/);
    const html = await readFile(output, "utf8");
    assert.match(html, /Offline relation explorer/);
    assert.match(html, /connect-src 'none'/);
    const encoded = html.match(/atob\("([a-zA-Z0-9+/=]+)"\)/);
    assert.ok(encoded);
    const data = JSON.parse(Buffer.from(encoded[1]!, "base64").toString("utf8"));
    assert.equal(data.rootAnimeId, 200);
    assert.equal(data.sourceNodeCount, 2);
    assert.equal(data.sourceEdgeCount, 1);
    assert.equal(data.frontierCount, 1);
    assert.equal(data.nodes[1].recordRead, false);
    const collision = callCli(input, output);
    assert.notEqual(collision.status, 0, "Existing output must not be overwritten");
    assert.equal(await readFile(output, "utf8"), html);
    assert.notEqual(callCli(input, input).status, 0, "Input must never be overwritten");
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test("CLI rejects failed MCP results and malformed JSON without generating an output", async () => {
  const dir = await mkdtemp(join(tmpdir(), "nexus-invalid-ui-"));
  const input = join(dir, "bad.json"), output = join(dir, "graph.html");
  try {
    for (const raw of ["{not-json", JSON.stringify({ isError: true, structuredContent: {} }), JSON.stringify({ content: "not a graph" })]) {
      await writeFile(input, raw);
      const run = callCli(input, output);
      assert.notEqual(run.status, 0);
      assert.match(run.stderr, /Offline graph export failed/);
      await assert.rejects(readFile(output, "utf8"));
    }
  } finally { await rm(dir, { recursive: true, force: true }); }
});
