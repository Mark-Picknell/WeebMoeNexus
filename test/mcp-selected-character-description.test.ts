import assert from "node:assert/strict";
import test from "node:test";
import {Client,InMemoryTransport} from "@modelcontextprotocol/client";
import {selectedCharacterDescriptionResultSchema} from "../src/domain/selected-character-description.js";
import {providerErrorSchema} from "../src/domain/provider-error.js";

const fixture = new Map<number,string>([
 [801,`<anime id="801"><titles><title type="main">Synthetic Medic</title></titles>
  <characters><character id="9001"><name>Doctor P</name>
   <description>Pink hair, a lab coat, and a scalpel.</description><charactertype id="1">Character</charactertype>
  </character><character id="9002"><name>Another</name>
   <description>She does not wear a lab coat.</description></character></characters></anime>`],
 [802,`<anime id="802"><titles><title type="main">Synthetic Neighbor</title></titles>
  <characters><character id="9003"><name>Rose</name>
   <description>Long pink hair.</description></character></characters></anime>`],
 [803,"<error>Client banned</error>"]
]);

test("MCP source description query reports textual mentions only with source evidence and ban stop",async()=>{
 const oldClient=process.env.ANIDB_CLIENT,oldDir=process.env.ANIDB_ANIME_CACHE_DIR,oldFetch=globalThis.fetch;
 process.env.ANIDB_CLIENT="weebmoenexus";process.env.ANIDB_ANIME_CACHE_DIR="";
 const reads:number[]=[];
 globalThis.fetch=async request=>{
  const id=Number(new URL(String(request)).searchParams.get("aid"));
  reads.push(id);const body=fixture.get(id);assert.ok(body,`Unexpected read ${id}`);
  return new Response(body,{status:200,headers:{"Content-Type":"application/xml"}});
 };
 let server:ReturnType<(typeof import("../src/server.js"))["buildServer"]>|null=null,client:Client|null=null;
 try{
  const {buildServer}=await import("../src/server.js");
  server=buildServer();client=new Client({name:"offline-description-client",version:"1"});
  const [ct,st]=InMemoryTransport.createLinkedPair();
  await server.connect(st);await client.connect(ct);
  const tool=(await client.listTools()).tools.find(x=>x.name==="search_character_descriptions_in_selected_anime");
  assert.ok(tool);assert.equal(tool.annotations?.readOnlyHint,true);
  const result=await client.callTool({name:"search_character_descriptions_in_selected_anime",
   arguments:{anidbIds:[802,801],cues:["pink hair","lab coat","scalpel"],mode:"any"}});
  assert.notEqual(result.isError,true);
  const data=selectedCharacterDescriptionResultSchema.parse(result.structuredContent);
  assert.equal(data.sourceMentionsAreNotVerifiedTraits,true);
  assert.equal(data.matchedCharacterRows,3);
  assert.equal(data.candidates[0]?.characterId,9001);
  assert.equal(data.candidates[0]?.matchedCues.length,3);
  assert.equal(data.candidates[0]?.characterType?.name,"Character");
  assert.equal(data.candidates[0]?.matchedCues[0]?.sourceField,"characters[0].description");
  assert.equal(data.candidates[0]?.sourceUrl,"https://anidb.net/anime/801");
  assert.equal(data.candidates[1]?.characterId,9002);
  assert.equal(data.candidates[1]?.assertionStatus,"lexical_mentions_only");
  assert.deepEqual(reads,[802,801]);
  const repeat=await client.callTool({name:"search_character_descriptions_in_selected_anime",
   arguments:{anidbIds:[801,802],cues:["pink hair"],limit:1}});
  const capped=selectedCharacterDescriptionResultSchema.parse(repeat.structuredContent);
  assert.equal(capped.matchedCharacterRows,2);assert.equal(capped.truncated,true);
  assert.deepEqual(reads,[802,801],"cached source used without new fetch");
  const invalid=await client.callTool({name:"search_character_descriptions_in_selected_anime",
   arguments:{anidbIds:[801,801],cues:["pink hair"]}});
  assert.equal(invalid.isError,true);assert.deepEqual(reads,[802,801]);
  const banned=await client.callTool({name:"search_character_descriptions_in_selected_anime",
   arguments:{anidbIds:[803,802],cues:["pink hair"]}});
  assert.equal(banned.isError,true);
  assert.equal(providerErrorSchema.parse(banned.structuredContent?.error).code,"banned");
  assert.deepEqual(reads,[802,801,803]);
 }finally{
  await client?.close();await server?.close();
  globalThis.fetch=oldFetch;
  if(oldClient===undefined)delete process.env.ANIDB_CLIENT;else process.env.ANIDB_CLIENT=oldClient;
  if(oldDir===undefined)delete process.env.ANIDB_ANIME_CACHE_DIR;else process.env.ANIDB_ANIME_CACHE_DIR=oldDir;
 }
});
