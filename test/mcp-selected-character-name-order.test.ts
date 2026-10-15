import assert from "node:assert/strict";
import test from "node:test";
import { Client, InMemoryTransport } from "@modelcontextprotocol/client";
import { selectedCharacterSearchResultSchema } from "../src/domain/selected-character-search.js";
const source = new Map<number, string>([
 [1001, `<anime id="1001"><titles><title type="main">Synthetic Original</title></titles>
  <characters><character id="301"><name>Nijou Aki</name><seiyuu id="9">Voice Fixture</seiyuu></character>
    <character id="302"><name>Aki Nijou</name></character></characters></anime>`],
 [1002, `<anime id="1002"><titles><title type="main">Synthetic Sequel</title></titles>
  <characters><character id="401"><name>Nijou Aki</name></character></characters></anime>`]
]);

test("MCP opt-in name reversal is candidate-only with separate work IDs and no extra reads", async () => {
 const oldClient=process.env.ANIDB_CLIENT,oldDir=process.env.ANIDB_ANIME_CACHE_DIR,oldFetch=globalThis.fetch;
 process.env.ANIDB_CLIENT="weebmoenexus";process.env.ANIDB_ANIME_CACHE_DIR="";
 const reads:number[]=[];
 globalThis.fetch=async request=>{
   const id=Number(new URL(String(request)).searchParams.get("aid"));
   reads.push(id);const xml=source.get(id);assert.ok(xml,`Unexpected work request ${id}`);
   return new Response(xml,{status:200,headers:{"Content-Type":"application/xml"}});
 };
 let server:ReturnType<(typeof import("../src/server.js"))["buildServer"]>|null=null;
 let client:Client|null=null;
 try{
  const {buildServer}=await import("../src/server.js");
  server=buildServer();client=new Client({name:"offline-name-order",version:"1.0"});
  const [ct,st]=InMemoryTransport.createLinkedPair();await server.connect(st);await client.connect(ct);
  const off=await client.callTool({name:"search_characters_in_selected_anime",
    arguments:{anidbIds:[1002,1001],query:"Aki Nijou",workTitle:"Synthetic Original"}});
  assert.notEqual(off.isError,true);
  const standard=selectedCharacterSearchResultSchema.parse(off.structuredContent);
  assert.equal(standard.considerNameOrderVariants,false);
  assert.equal(standard.totalNameMatches,1);
  assert.deepEqual(standard.results.map(x=>[x.sourceAnimeId,x.anidbCharacterId]),[[1001,302]]);
  const opt=await client.callTool({name:"search_characters_in_selected_anime",
    arguments:{anidbIds:[1002,1001],query:"Aki Nijou",workTitle:"Synthetic Original",
      considerNameOrderVariants:true}});
  assert.notEqual(opt.isError,true);
  const data=selectedCharacterSearchResultSchema.parse(opt.structuredContent);
  assert.equal(data.totalNameMatches,3);
  assert.deepEqual(data.results.map(x=>[x.sourceAnimeId,x.anidbCharacterId,x.nameMatch]),[
    [1001,302,"exact"],[1001,301,"reversed_two_token_candidate"],
    [1002,401,"reversed_two_token_candidate"]
  ]);
  assert.equal(data.results[1]?.evidenceSourceField,"characters[0].name");
  assert.equal(data.results[1]?.voiceActor?.name,"Voice Fixture");
  assert.equal(data.results[2]?.workTitleMatch,"different_source_work");
  assert.deepEqual(reads,[1002,1001],"second lookup uses cache");
  const invalid=await client.callTool({name:"search_characters_in_selected_anime",
    arguments:{anidbIds:[1001],query:"Aki Nijou",considerNameOrderVariants:"yes"}});
  assert.equal(invalid.isError,true);
  assert.deepEqual(reads,[1002,1001],"invalid requests never trigger source reads");
 }finally{
  await client?.close();await server?.close();globalThis.fetch=oldFetch;
  if(oldClient===undefined)delete process.env.ANIDB_CLIENT;else process.env.ANIDB_CLIENT=oldClient;
  if(oldDir===undefined)delete process.env.ANIDB_ANIME_CACHE_DIR;else process.env.ANIDB_ANIME_CACHE_DIR=oldDir;
 }
});
