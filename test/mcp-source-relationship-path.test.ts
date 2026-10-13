import assert from "node:assert/strict";
import test from "node:test";
import { Client, InMemoryTransport } from "@modelcontextprotocol/client";
import { sourceRelationshipPathResultSchema } from "../src/domain/source-relationship-path.js";
import { providerErrorSchema } from "../src/domain/provider-error.js";

const xml=new Map<number,string>([
 [8001,`<anime id="8001"><titles><title type="main">Synthetic Observatory</title></titles>
   <characters><character id="101"><name>Lily</name><seiyuu id="300">Performer</seiyuu></character></characters>
   <relatedanime><anime id="8002" type="sequel">Incoming second title</anime></relatedanime></anime>`],
 [8002,`<anime id="8002"><titles><title type="main">Synthetic Lantern City</title></titles>
   <characters><character id="102"><name>Rose</name><seiyuu id="300">Performer</seiyuu></character></characters></anime>`],
 [8003,"<error>Client banned</error>"]
]);

test("read-only MCP path retains original rows, cache reuse and error stop boundaries",async()=>{
 const clientOld=process.env.ANIDB_CLIENT,dirOld=process.env.ANIDB_ANIME_CACHE_DIR,fetchOld=globalThis.fetch;
 process.env.ANIDB_CLIENT="weebmoenexus";
 process.env.ANIDB_ANIME_CACHE_DIR="";
 const reads:number[]=[];
 globalThis.fetch=async request=>{
   const id=Number(new URL(String(request)).searchParams.get("aid"));
   reads.push(id);const value=xml.get(id);assert.ok(value,`Unexpected selected source read: ${id}`);
   return new Response(value,{status:200,headers:{"Content-Type":"application/xml"}});
 };
 let server:ReturnType<(typeof import("../src/server.js"))["buildServer"]>|null=null,client:Client|null=null;
 try{
  const {buildServer}=await import("../src/server.js");
  server=buildServer();
  client=new Client({name:"offline-source-graph",version:"1.0"});
  const [ct,st]=InMemoryTransport.createLinkedPair();
  await server.connect(st);await client.connect(ct);
  const tool=(await client.listTools()).tools.find(x=>x.name==="trace_selected_anime_relationship_path");
  assert.ok(tool);assert.equal(tool.annotations?.readOnlyHint,true);
  const result=await client.callTool({
    name:"trace_selected_anime_relationship_path",
    arguments:{anidbIds:[8001,8002],from:{kind:"character",id:101},to:{kind:"character",id:102}}
  });
  assert.notEqual(result.isError,true);
  const graph=sourceRelationshipPathResultSchema.parse(result.structuredContent);
  assert.equal(graph.status,"found");
  assert.equal(graph.pathHops,2);
  assert.deepEqual(graph.path.map(x=>x.navigation),["against_reported_direction","along_reported_direction"]);
  assert.deepEqual(graph.nodesOnPath.map(x=>[x.kind,x.id]),[
    ["character",101],["contributor",300],["character",102]
  ]);
  assert.deepEqual(reads,[8001,8002]);
  const reverse=await client.callTool({
    name:"trace_selected_anime_relationship_path",
    arguments:{anidbIds:[8001,8002],from:{kind:"work",id:8002},to:{kind:"work",id:8001},maxHops:1}
  });
  const rel=sourceRelationshipPathResultSchema.parse(reverse.structuredContent);
  assert.equal(rel.status,"found");
  assert.equal(rel.path[0]?.edge.reportedLabel,"sequel");
  assert.equal(rel.path[0]?.navigation,"against_reported_direction");
  assert.equal(rel.path[0]?.edge.from.id,8001);
  assert.deepEqual(reads,[8001,8002],"cached selected sources were reused");
  const invalid=await client.callTool({
    name:"trace_selected_anime_relationship_path",
    arguments:{anidbIds:[8001,8001],from:{kind:"work",id:8001},to:{kind:"work",id:8002}}
  });
  assert.equal(invalid.isError,true);assert.deepEqual(reads,[8001,8002]);
  const banned=await client.callTool({
    name:"trace_selected_anime_relationship_path",
    arguments:{anidbIds:[8003,8002],from:{kind:"work",id:8003},to:{kind:"work",id:8002}}
  });
  assert.equal(banned.isError,true);
  assert.equal(providerErrorSchema.parse(banned.structuredContent?.error).code,"banned");
  assert.deepEqual(reads,[8001,8002,8003]);
 }finally{
  await client?.close();await server?.close();
  globalThis.fetch=fetchOld;
  if(clientOld===undefined)delete process.env.ANIDB_CLIENT;else process.env.ANIDB_CLIENT=clientOld;
  if(dirOld===undefined)delete process.env.ANIDB_ANIME_CACHE_DIR;else process.env.ANIDB_ANIME_CACHE_DIR=dirOld;
 }
});
