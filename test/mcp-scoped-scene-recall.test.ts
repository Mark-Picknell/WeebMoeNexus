import assert from "node:assert/strict";
import test from "node:test";
import { Client, InMemoryTransport } from "@modelcontextprotocol/client";
import { scopedSceneRecallResultSchema } from "../src/domain/scoped-scene-recall.js";
import { providerErrorSchema } from "../src/domain/provider-error.js";

const xml = new Map<number,string>([
  [440, `<anime id="440"><titles><title type="main">Synthetic Doctor Drama</title></titles>
    <episodes><episode id="701"><epno type="1">1</epno></episode><episode id="702"><epno type="1">2</epno></episode></episodes>
    <characters>
      <character id="1001"><name>Not Wearing That</name><description>Does not have a lab coat.</description></character>
      <character id="1002"><name>Medic</name><description>Has a lab coat and a scalpel.</description><episodes>2</episodes></character>
      <character id="1003"><name>Unknown Encounter</name><description>She carries a lab coat.</description></character>
    </characters></anime>`],
  [441,"<error>Client banned</error>"]
]);

test("MCP recall reports lexical description candidates and optional episode positives, not a scene",async()=>{
 const oldClient=process.env.ANIDB_CLIENT,oldDir=process.env.ANIDB_ANIME_CACHE_DIR,oldFetch=globalThis.fetch;
 process.env.ANIDB_CLIENT="weebmoenexus";process.env.ANIDB_ANIME_CACHE_DIR="";
 const reads:number[]=[];
 globalThis.fetch=async request=>{
  const id=Number(new URL(String(request)).searchParams.get("aid"));reads.push(id);
  const body=xml.get(id);assert.ok(body,`Unexpected source read ${id}`);
  return new Response(body,{status:200,headers:{"Content-Type":"application/xml"}});
 };
 let server:ReturnType<(typeof import("../src/server.js"))["buildServer"]>|null=null;
 let client:Client|null=null;
 try{
  const {buildServer}=await import("../src/server.js");
  server=buildServer();client=new Client({name:"offline-scoped-recall",version:"1"});
  const [ct,st]=InMemoryTransport.createLinkedPair();await server.connect(st);await client.connect(ct);
  const tool=(await client.listTools()).tools.find(t=>t.name==="recall_character_clues_in_selected_anime");
  assert.ok(tool);assert.equal(tool.annotations?.readOnlyHint,true);
  const response=await client.callTool({name:"recall_character_clues_in_selected_anime",
    arguments:{anidbId:440,cues:["lab coat"],episodeId:702}});
  assert.notEqual(response.isError,true);
  const data=scopedSceneRecallResultSchema.parse(response.structuredContent);
  assert.equal(data.sceneIdentification,"not_performed");
  assert.equal(data.sourceMentionsAreNotVerifiedTraits,true);
  assert.equal(data.sourceEpisodeStatus,"reported");
  assert.equal(data.matchedCharacterRows,3);
  assert.equal(data.candidates[0]?.characterId,1002);
  assert.equal(data.candidates[0]?.episodeReferenceStatus,"reported_positive");
  assert.equal(data.candidates[1]?.characterId,1001);
  assert.equal(data.candidates[1]?.episodeReferenceStatus,"unverified");
  assert.ok(data.candidates[1]?.matchedCues[0]?.normalizedExcerpt.includes("does not have"));
  assert.deepEqual(reads,[440]);
  const another=await client.callTool({name:"recall_character_clues_in_selected_anime",
    arguments:{anidbId:440,cues:["lab coat"],episodeId:999}});
  const missing=scopedSceneRecallResultSchema.parse(another.structuredContent);
  assert.equal(missing.sourceEpisodeStatus,"not_reported");
  assert.ok(missing.candidates.every(c=>c.episodeReferenceStatus==="unverified"));
  assert.deepEqual(reads,[440],"bounded subsequent source read reuses cache");
  const bad=await client.callTool({name:"recall_character_clues_in_selected_anime",
    arguments:{anidbId:440,cues:["lab coat","LAB-COAT"]}});
  assert.equal(bad.isError,true);assert.deepEqual(reads,[440]);
  const banned=await client.callTool({name:"recall_character_clues_in_selected_anime",
    arguments:{anidbId:441,cues:["lab coat"]}});
  assert.equal(banned.isError,true);
  assert.equal(providerErrorSchema.parse(banned.structuredContent?.error).code,"banned");
  assert.deepEqual(reads,[440,441]);
 }finally{
  await client?.close();await server?.close();globalThis.fetch=oldFetch;
  if(oldClient===undefined)delete process.env.ANIDB_CLIENT;else process.env.ANIDB_CLIENT=oldClient;
  if(oldDir===undefined)delete process.env.ANIDB_ANIME_CACHE_DIR;else process.env.ANIDB_ANIME_CACHE_DIR=oldDir;
 }
});
