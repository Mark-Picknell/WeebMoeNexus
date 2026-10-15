import assert from "node:assert/strict";
import test from "node:test";
import {mapAniDbAnimeXml} from "../src/providers/anidb/mapper.js";
import {parseAniDbTitleXml} from "../src/providers/anidb/title-index.js";
import {searchAniDbTitles} from "../src/services/title-search-service.js";
import {recallCharacterCluesInUniqueTitledAnime} from "../src/services/titled-scene-recall-service.js";
import {titledSceneRecallResultSchema} from "../src/domain/titled-scene-recall.js";
const index=parseAniDbTitleXml(`<animetitles>
<anime aid="550"><title xml:lang="en" type="main">Diagnostic Drama</title></anime>
<anime aid="801"><title xml:lang="en" type="main">The Other Show</title></anime>
<anime aid="802"><title xml:lang="en" type="main">The Other Show</title></anime></animetitles>`);
const titleReader={search:async(q:string,limit:number)=>searchAniDbTitles(index,q,limit)};
const anime=mapAniDbAnimeXml(`<anime id="550"><titles><title type="main">Diagnostic Drama</title></titles>
 <episodes><episode id="701"><epno type="1">1</epno></episode></episodes>
 <characters><character id="77"><name>Doctor</name>
  <description>Her lab coat sits beside a scalpel.</description><episodes>1</episodes></character></characters></anime>`,
 "2026-10-15T07:00:00Z");

test("one exact or normalized title safely selects a single work and returns source-only clues",async()=>{
 const reads:number[]=[];
 const reader={async getByAniDbId(id:number){reads.push(id);return anime;}};
 const result=await recallCharacterCluesInUniqueTitledAnime({
  animeTitle:"Diagnostic Drama",cues:["lab coat","scalpel"],episodeId:701,mode:"all"
 },titleReader,reader);
 assert.ok(titledSceneRecallResultSchema.safeParse(result).success);
 assert.equal(result.status,"unique_work_searched");
 assert.equal(result.selectedAnimeId,550);
 assert.equal(result.titleMatchCount,1);
 assert.equal(result.sourceRecall?.sceneIdentification,"not_performed");
 assert.equal(result.sourceRecall?.candidates[0]?.episodeReferenceStatus,"reported_positive");
 assert.equal(result.sourceRecall?.candidates[0]?.characterId,77);
 assert.deepEqual(reads,[550]);
 const normalized=await recallCharacterCluesInUniqueTitledAnime({
  animeTitle:"DIAGNOSTIC_DRAMA",cues:["lab coat"]
 },titleReader,reader);
 assert.equal(normalized.status,"unique_work_searched");
 assert.deepEqual(reads,[550,550]);
});

test("ambiguous, absent and fuzzy titles preserve candidates and never fetch provider anime",async()=>{
 const reads:number[]=[];
 const reader={async getByAniDbId(id:number){reads.push(id);return anime;}};
 const ambiguous=await recallCharacterCluesInUniqueTitledAnime({
   animeTitle:"The Other Show",cues:["lab coat"]
 },titleReader,reader);
 assert.equal(ambiguous.status,"ambiguous_work_requires_selection");
 assert.deepEqual(ambiguous.workCandidates.map(c=>c.anidbId),[801,802]);
 assert.equal(ambiguous.sourceRecall,null);
 const no=await recallCharacterCluesInUniqueTitledAnime({
   animeTitle:"No Such Work",cues:["lab coat"]
 },titleReader,reader);
 assert.equal(no.status,"no_local_work_match");
 const unique=searchAniDbTitles(index,"Diagnostic Drama",25).results[0]!;
 const fuzzy=await recallCharacterCluesInUniqueTitledAnime({
   animeTitle:"Diagnostic Drama",cues:["lab coat"]
 },{search:async()=>({query:"Diagnostic Drama",totalMatches:1,
   results:[{...unique,matchType:"fuzzy",editDistance:1}]})},reader);
 assert.equal(fuzzy.status,"fuzzy_work_requires_selection");
 assert.equal(fuzzy.sourceRecall,null);
 assert.deepEqual(reads,[]);
});

test("invalid inputs and malformed local index candidates fail before upstream source reads",async()=>{
 let local=0,upstream=0;
 const title={search:async(query:string,limit:number)=>{
   local++;return searchAniDbTitles(index,query,limit);
 }};
 const reader={async getByAniDbId(){upstream++;return anime;}};
 for(const raw of [
  {animeTitle:"?",cues:["lab coat"]},
  {animeTitle:"Diagnostic Drama",cues:[".."]},
  {animeTitle:"Diagnostic Drama",cues:["lab coat","LAB-COAT"]},
  {animeTitle:"Diagnostic Drama",cues:["lab coat"],episodeId:0},
  {animeTitle:"Diagnostic Drama",cues:["lab coat"],limit:26}
 ])await assert.rejects(recallCharacterCluesInUniqueTitledAnime(raw,title,reader));
 assert.equal(local,0);assert.equal(upstream,0);
 const malformed=await assert.rejects(recallCharacterCluesInUniqueTitledAnime({
  animeTitle:"Diagnostic Drama",cues:["lab coat"]
 },{search:async()=>({query:"Diagnostic Drama",totalMatches:1,results:[]})},reader));
 assert.equal(upstream,0);
 const original=searchAniDbTitles(index,"Diagnostic Drama",25).results[0]!;
 await assert.rejects(recallCharacterCluesInUniqueTitledAnime({
  animeTitle:"Diagnostic Drama",cues:["lab coat"]
 },{search:async()=>({query:"Diagnostic Drama",totalMatches:2,results:[original,original]})},reader));
 assert.equal(upstream,0);
});
