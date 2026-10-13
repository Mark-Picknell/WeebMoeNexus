import assert from "node:assert/strict";
import test from "node:test";
import {mapAniDbAnimeXml} from "../src/providers/anidb/mapper.js";
import {findSourceRelationshipPathInRecords,findSourceRelationshipPath} from "../src/services/source-relationship-path-service.js";
import {sourceRelationshipPathResultSchema} from "../src/domain/source-relationship-path.js";
const stamp="2026-10-13T17:00:00.000Z";
function anime(id:number,content:string){
 return mapAniDbAnimeXml(`<anime id="${id}"><titles><title type="main">Synthetic ${id}</title></titles>${content}</anime>`,stamp);
}
const one=anime(10,`<characters><character id="101"><name>Lily</name><seiyuu id="44">Performer</seiyuu></character></characters>
<creators><name id="55" type="animation work">Synthetic Production Credit</name></creators>
<relatedanime><anime id="11" type="sequel">Unverified target</anime><anime id="99" type="other">Boundary</anime></relatedanime>`);
const two=anime(11,`<characters><character id="102"><name>Rose</name><seiyuu id="44">Performer</seiyuu></character></characters>
<creators><name id="55" type="other production role">Synthetic Production Credit</name></creators>
<relatedanime><anime id="10" type="prequel">Incoming</anime></relatedanime>`);

test("shortest source-credited character → voice contributor → character path preserves direction",()=>{
 const x=findSourceRelationshipPathInRecords({
   anidbIds:[10,11],from:{kind:"character",id:101},to:{kind:"character",id:102},maxHops:5
 },[one,two]);
 assert.equal(x.status,"found");
 assert.equal(x.pathHops,2);
 assert.equal(x.path[0]?.edge.type,"voice_credit");
 assert.equal(x.path[0]?.navigation,"against_reported_direction");
 assert.equal(x.path[1]?.navigation,"along_reported_direction");
 assert.deepEqual(x.nodesOnPath.map(n=>[n.kind,n.id]),[["character",101],["contributor",44],["character",102]]);
 assert.equal(x.nodesOnPath[1]?.entityClass,"source_reference_only");
 assert.equal(x.path[0]?.edge.sourceField,"characters[0].voiceActor");
 assert.equal(x.path[0]?.edge.sourceUrl,"https://anidb.net/anime/10");
 assert.equal(x.path[0]?.edge.retrievedAt,stamp);
 assert.equal(x.workRelationsOutsideSelection,1);
 assert.ok(sourceRelationshipPathResultSchema.safeParse(x).success);
});

test("navigating backward over explicit work relation is marked navigation, not an inverse source fact",()=>{
 const x=findSourceRelationshipPathInRecords({
 anidbIds:[10,11],from:{kind:"work",id:11},to:{kind:"work",id:10},maxHops:1
 },[one,two]);
 assert.equal(x.status,"found");
 // First observed edge is 10 → 11; reverse navigation does not mutate it.
 assert.equal(x.path[0]?.edge.sourceAnimeId,10);
 assert.equal(x.path[0]?.edge.from.id,10);
 assert.equal(x.path[0]?.edge.to.id,11);
 assert.equal(x.path[0]?.navigation,"against_reported_direction");
 assert.equal(x.path[0]?.edge.reportedLabel,"sequel");
});

test("missing endpoints and hop limits never become global negative assertions",()=>{
 const missing=findSourceRelationshipPathInRecords({
 anidbIds:[10,11],from:{kind:"character",id:777},to:{kind:"contributor",id:44}
 },[one,two]);
 assert.equal(missing.status,"endpoint_not_reported");
 assert.equal(missing.selectedPoolOnly,true);
 const limited=findSourceRelationshipPathInRecords({
 anidbIds:[10,11],from:{kind:"character",id:101},to:{kind:"character",id:102},maxHops:1
 },[one,two]);
 assert.equal(limited.status,"no_path_within_limit");
 assert.equal(limited.pathHops,null);
 assert.deepEqual(limited.path,[]);
 const self=findSourceRelationshipPathInRecords({
 anidbIds:[10],from:{kind:"character",id:101},to:{kind:"character",id:101}
 },[one]);
 assert.equal(self.status,"found");
 assert.equal(self.pathHops,0);
});

test("same display name with distinct IDs never forms an identity bridge; missing credits remain unknown",()=>{
 const a=anime(20,`<characters><character id="1001"><name>Carrera</name><seiyuu>Performer</seiyuu></character></characters></anime>`);
 const b=anime(21,`<characters><character id="1002"><name>Carrera</name><seiyuu id="99">Performer</seiyuu></character></characters>`);
 const x=findSourceRelationshipPathInRecords({
  anidbIds:[20,21],from:{kind:"character",id:1001},to:{kind:"character",id:1002}
 },[a,b]);
 assert.equal(x.status,"no_path_within_limit");
 assert.equal(x.unresolvedCreditRows,1);
});

test("serial reads fail closed and invalid inputs fail before any source fetch",async()=>{
 const seen:number[]=[];
 const reader={async getByAniDbId(id:number){
  seen.push(id);if(id===12)throw new Error("Synthetic ban");
  return id===10?one:two;
 }};
 for(const raw of [
  {anidbIds:[10,10],from:{kind:"work",id:10},to:{kind:"work",id:11}},
  {anidbIds:[10],from:{kind:"work",id:0},to:{kind:"work",id:11}},
  {anidbIds:[10],from:{kind:"work",id:10},to:{kind:"work",id:11},maxHops:9}
 ]) await assert.rejects(findSourceRelationshipPath(raw,reader));
 assert.deepEqual(seen,[]);
 await assert.rejects(findSourceRelationshipPath({
  anidbIds:[10,12,11],from:{kind:"work",id:10},to:{kind:"work",id:11}
 },reader),/Synthetic ban/);
 assert.deepEqual(seen,[10,12]);
});
