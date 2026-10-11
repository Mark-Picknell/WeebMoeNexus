import assert from "node:assert/strict";
import test from "node:test";
import { renderRelationshipExplorerHtml } from "../src/ui/relationship-explorer-html.js";
import { projectRelationshipExplorer } from "../src/ui/relationship-explorer-model.js";
import { traverseAnimeRelations } from "../src/services/relation-graph-service.js";
import { mapAniDbAnimeXml } from "../src/providers/anidb/mapper.js";

const stamp="2026-10-11T23:00:00.000Z";
const harmful='<img src=x onerror=alert(1)></script><script>evil()</script>';
const anime=mapAniDbAnimeXml(`<anime id="100"><titles><title type="main">Fixture</title></titles><relatedanime>
  <anime id="101" type="sequel">Fixture sequel</anime></relatedanime></anime>`,stamp);

test("a fully offline HTML snapshot offers keyboard-readable node/edge inspector and no remote dependencies", async () => {
  const graph=await traverseAnimeRelations({anidbId:100},{getByAniDbId:async()=>anime});
  const view=projectRelationshipExplorer(graph);
  view.nodes[0]!.title=harmful;
  const html=renderRelationshipExplorerHtml(view);
  assert.match(html,/Content-Security-Policy/);
  assert.match(html,/connect-src 'none'/);
  assert.match(html,/role="img"/);
  assert.match(html,/aria-live="polite"/);
  assert.match(html,/addEventListener\("keydown"/);
  assert.match(html,/node-list/);
  assert.match(html,/edge-list/);
  assert.match(html,/Evidence inspector/);
  assert.match(html,/Frontier reason/);
  assert.match(html,/Reported label/);
  assert.match(html,/data\.edges/);
  assert.match(html,/sourceRowIndex/);
  assert.doesNotMatch(html,/<img src=x onerror/);
  assert.doesNotMatch(html,/<script>evil\(\)<\/script>/);
  assert.doesNotMatch(html,/fetch\(/);
  const match=html.match(/atob\("([a-zA-Z0-9+/=]+)"\)/);
  assert.ok(match);
  const restored=JSON.parse(Buffer.from(match[1]!, "base64").toString("utf8"));
  assert.deepEqual(restored,view);
});

test("renderer is deterministic and refuses unvalidated graph structures", async () => {
  const graph=await traverseAnimeRelations({anidbId:100},{getByAniDbId:async()=>anime});
  const view=projectRelationshipExplorer(graph);
  assert.equal(renderRelationshipExplorerHtml(view),renderRelationshipExplorerHtml(view));
  assert.throws(()=>renderRelationshipExplorerHtml({...view, width:-4}));
  assert.throws(()=>renderRelationshipExplorerHtml({...view, scope:"fabricated"} as never));
});
