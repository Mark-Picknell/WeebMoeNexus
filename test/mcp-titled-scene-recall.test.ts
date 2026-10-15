import assert from "node:assert/strict";
import test from "node:test";
import {promises as fs} from "node:fs";
import {tmpdir} from "node:os";
import {join} from "node:path";
import {gzipSync} from "node:zlib";
import {Client,InMemoryTransport} from "@modelcontextprotocol/client";
import {titledSceneRecallResultSchema} from "../src/domain/titled-scene-recall.js";

const titles=`<animetitles>
  <anime aid="550"><title xml:lang="en" type="main">Diagnostic Drama</title></anime>
  <anime aid="601"><title xml:lang="en" type="main">Shared Name</title></anime>
  <anime aid="602"><title xml:lang="en" type="main">Shared Name</title></anime>
</animetitles>`;

test("real MCP client bridges only a unique local anime title to source character clues",async()=>{
 const dir=await fs.mkdtemp(join(tmpdir(),"weeb-recall-title-"));
 const path=join(dir,"titles.xml.gz");await fs.writeFile(path,gzipSync(titles));
 const keys=["ANIDB_CLIENT","ANIDB_ANIME_CACHE_DIR","ANIDB_TITLE_DUMP_CACHE_PATH"] as const;
 const old=Object.fromEntries(keys.map(k=>[k,process.env[k]])),oldFetch=globalThis.fetch;
 process.env.ANIDB_CLIENT="weebmoenexus";
 process.env.ANIDB_ANIME_CACHE_DIR="";
 process.env.ANIDB_TITLE_DUMP_CACHE_PATH=path;
 const reads:number[]=[];
 globalThis.fetch=async input=>{
  const id=Number(new URL(String(input)).searchParams.get("aid"));reads.push(id);
  assert.equal(id,550,"Ambiguous/unrequested works must never hit source network");
  return new Response(`<anime id="550"><titles><title type="main">Diagnostic Drama</title></titles>
    <episodes><episode id="702"><epno type="1">2</epno></episode></episodes>
    <characters>
      <character id="301"><name>Doctor</name><description>A lab coat and scalpel.</description>
        <episodes>2</episodes></character>
      <character id="302"><name>Other</name><description>She does not wear a lab coat.</description></character>
    </characters></anime>`,{status:200,headers:{"Content-Type":"application/xml"}});
 };
 let client:Client|null=null;
 let server:ReturnType<(typeof import("../src/server.js"))["buildServer"]>|null=null;
 try{
  const {buildServer}=await import("../src/server.js");server=buildServer();
  client=new Client({name:"offline-title-clue",version:"1"});
  const [ct,st]=InMemoryTransport.createLinkedPair();await server.connect(st);await client.connect(ct);
  const tool=(await client.listTools()).tools.find(t=>t.name==="recall_character_clues_by_anime_title");
  assert.ok(tool);assert.equal(tool.annotations?.readOnlyHint,true);
  const found=await client.callTool({name:"recall_character_clues_by_anime_title",
    arguments:{animeTitle:"Diagnostic Drama",cues:["lab coat","scalpel"],episodeId:702}});
  assert.notEqual(found.isError,true);
  const result=titledSceneRecallResultSchema.parse(found.structuredContent);
  assert.equal(result.status,"unique_work_searched");
  assert.equal(result.selectedAnimeId,550);
  assert.equal(result.sourceRecall?.sceneIdentification,"not_performed");
  assert.equal(result.sourceRecall?.matchedCharacterRows,2);
  assert.equal(result.sourceRecall?.candidates[0]?.characterId,301);
  assert.equal(result.sourceRecall?.candidates[0]?.episodeReferenceStatus,"reported_positive");
  assert.equal(result.sourceRecall?.candidates[1]?.episodeReferenceStatus,"unverified");
  assert.deepEqual(reads,[550]);
  const ambiguous=await client.callTool({name:"recall_character_clues_by_anime_title",
    arguments:{animeTitle:"Shared Name",cues:["lab coat"]}});
  const amb=titledSceneRecallResultSchema.parse(ambiguous.structuredContent);
  assert.equal(amb.status,"ambiguous_work_requires_selection");
  assert.deepEqual(amb.workCandidates.map(x=>x.anidbId),[601,602]);
  assert.equal(amb.sourceRecall,null);assert.deepEqual(reads,[550]);
  const bad=await client.callTool({name:"recall_character_clues_by_anime_title",
    arguments:{animeTitle:"Diagnostic Drama",cues:["lab coat","LAB-COAT"]}});
  assert.equal(bad.isError,true);assert.deepEqual(reads,[550]);
  const repeat=await client.callTool({name:"recall_character_clues_by_anime_title",
    arguments:{animeTitle:"DIAGNOSTIC_DRAMA",cues:["lab coat"]}});
  assert.equal(titledSceneRecallResultSchema.parse(repeat.structuredContent).status,"unique_work_searched");
  assert.deepEqual(reads,[550],"same selected work should be cached");
 }finally{
  await client?.close();await server?.close();globalThis.fetch=oldFetch;
  for(const key of keys){
   if(old[key]===undefined)delete process.env[key];
   else process.env[key]=old[key];
  }
  await fs.rm(dir,{recursive:true,force:true});
 }
});
