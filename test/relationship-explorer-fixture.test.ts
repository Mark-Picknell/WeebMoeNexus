import assert from "node:assert/strict";
import test from "node:test";
import { readFile } from "node:fs/promises";
import { projectRelationshipExplorer } from "../src/ui/relationship-explorer-model.js";
import { renderRelationshipExplorerHtml } from "../src/ui/relationship-explorer-html.js";

test("checked-in synthetic sample is a valid, honest, offline viewer input", async () => {
  const fixture = JSON.parse(await readFile(
    new URL("../examples/synthetic-relation-traversal.json", import.meta.url), "utf8"
  )) as unknown;
  const data = projectRelationshipExplorer(fixture);
  assert.equal(data.rootAnimeId, 7001);
  assert.equal(data.sourceNodeCount, 3);
  assert.equal(data.sourceEdgeCount, 2);
  assert.equal(data.termination, "depth_limit");
  assert.equal(data.truncated, true);
  assert.equal(data.frontierCount, 2);
  assert.equal(data.nodes[1]?.recordRead, false);
  assert.equal(data.nodes[1]?.title, null);
  assert.equal(data.edges[0]?.targetTitle, "Synthetic Lantern City");
  const html = renderRelationshipExplorerHtml(data);
  assert.match(html, /<svg id="graph"/);
  assert.match(html, /connect-src 'none'/);
});
