import assert from "node:assert/strict";
import test from "node:test";
import { Client, InMemoryTransport } from "@modelcontextprotocol/client";
import { selectedThemeSearchResultSchema } from "../src/domain/selected-theme-search.js";
import { providerErrorSchema } from "../src/domain/provider-error.js";

const xml = new Map<number,string>([
  [801, `<anime id="801"><titles><title type="main">Synthetic Observatory</title></titles>
    <tags><tag id="88"><name>psychological</name></tag>
      <tag id="99" globalspoiler="1"><name>psychological mystery</name></tag></tags>
    <categories><category id="14" weight="50"><name>science fiction</name></category></categories>
  </anime>`],
  [802, `<anime id="802"><titles><title type="main">Synthetic Neighbors</title></titles>
    <tags><tag id="88"><name>psychological</name></tag></tags></anime>`],
  [803, "<error>Client banned</error>"]
]);

test("MCP theme search keeps independent tag IDs, spoiler exclusions, evidence and cache-only reuse",async()=>{
  const prevClient=process.env.ANIDB_CLIENT, prevDir=process.env.ANIDB_ANIME_CACHE_DIR;
  const prevFetch=globalThis.fetch;
  process.env.ANIDB_CLIENT="weebmoenexus";
  process.env.ANIDB_ANIME_CACHE_DIR="";
  const reads:number[]=[];
  globalThis.fetch=async request=>{
    const id=Number(new URL(String(request)).searchParams.get("aid"));
    reads.push(id);
    const body=xml.get(id);
    assert.ok(body,`Unexpected live source read: ${id}`);
    return new Response(body,{status:200,headers:{"Content-Type":"application/xml"}});
  };
  let server:ReturnType<(typeof import("../src/server.js"))["buildServer"]>|null=null;
  let client:Client|null=null;
  try{
    const {buildServer}=await import("../src/server.js");
    server=buildServer();client=new Client({name:"offline-theme-search",version:"1.0"});
    const [c,s]=InMemoryTransport.createLinkedPair();await server.connect(s);await client.connect(c);
    const tool=(await client.listTools()).tools.find(t=>t.name==="search_themes_in_selected_anime");
    assert.ok(tool);assert.equal(tool.annotations?.readOnlyHint,true);

    const result=await client.callTool({name:"search_themes_in_selected_anime",
      arguments:{anidbIds:[802,801],query:"psychological"}});
    assert.notEqual(result.isError,true);
    const data=selectedThemeSearchResultSchema.parse(result.structuredContent);
    assert.equal(data.totalLabelMatches,2);
    assert.equal(data.excludedKnownSpoilerRows,1);
    assert.deepEqual(data.results.map(x=>[x.sourceAnimeId,x.kind,x.sourceTermId,x.label]),[
      [801,"tag",88,"psychological"],[802,"tag",88,"psychological"]
    ]);
    assert.equal(data.results[0]?.evidenceSourceField,"tags[0].name");
    assert.deepEqual(reads,[802,801]);

    const repeat=await client.callTool({name:"search_themes_in_selected_anime",
      arguments:{anidbIds:[801,802],query:"psychological",includeKnownSpoilers:true,limit:1}});
    const one=selectedThemeSearchResultSchema.parse(repeat.structuredContent);
    assert.equal(one.totalLabelMatches,3);
    assert.equal(one.truncated,true);
    assert.equal(one.results.length,1);
    assert.deepEqual(reads,[802,801],"already fetched sources use existing cache");

    const malformed=await client.callTool({name:"search_themes_in_selected_anime",
      arguments:{anidbIds:[801,801],query:"psychological"}});
    assert.equal(malformed.isError,true);
    assert.deepEqual(reads,[802,801]);

    const blocked=await client.callTool({name:"search_themes_in_selected_anime",
      arguments:{anidbIds:[803,802],query:"psychological"}});
    assert.equal(blocked.isError,true);
    assert.equal(providerErrorSchema.parse(blocked.structuredContent?.error).code,"banned");
    assert.deepEqual(reads,[802,801,803],"provider ban stops source reads");
  }finally{
    await client?.close();await server?.close();
    globalThis.fetch=prevFetch;
    if(prevClient===undefined)delete process.env.ANIDB_CLIENT;else process.env.ANIDB_CLIENT=prevClient;
    if(prevDir===undefined)delete process.env.ANIDB_ANIME_CACHE_DIR;else process.env.ANIDB_ANIME_CACHE_DIR=prevDir;
  }
});
