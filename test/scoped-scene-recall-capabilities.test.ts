import assert from "node:assert/strict";
import test from "node:test";
import {aniDbCapabilityDeclaration} from "../src/providers/anidb/capabilities.js";

test("source-scoped recall is implemented but scene presence and identity remain unimplemented",()=>{
 const byId=new Map(aniDbCapabilityDeclaration().capabilities.map(c=>[c.id,c]));
 const recall=byId.get("source_character_clue_episode_recall")!;
 assert.ok(recall);
 assert.equal(recall.implementation,"implemented");
 assert.deepEqual(recall.tools,["recall_character_clues_in_selected_anime"]);
 assert.equal(recall.nativeProvider.assessment,"unverified");
 assert.ok(recall.limitations.some(x=>x.includes("not video observation")));
 assert.ok(recall.limitations.some(x=>x.includes("never verified positive traits")));
 assert.equal(byId.get("scene_character_presence")?.implementation,"not_implemented");
 assert.equal(byId.get("global_character_discovery")?.implementation,"not_implemented");
});
