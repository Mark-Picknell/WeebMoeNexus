import assert from "node:assert/strict";
import test from "node:test";
import {mapAniDbAnimeXml} from "../src/providers/anidb/mapper.js";
import {
  recallCharacterCluesInSourceWork,recallCharacterCluesFromSelectedWork
} from "../src/services/scoped-scene-recall-service.js";
import {scopedSceneRecallResultSchema} from "../src/domain/scoped-scene-recall.js";
const anime = mapAniDbAnimeXml(`<anime id="440"><titles><title type="main">Synthetic Medical Mystery</title></titles>
<episodes>
 <episode id="701"><epno type="1">1</epno></episode>
 <episode id="702"><epno type="1">2</epno></episode>
</episodes><characters>
 <character id="1"><name>Unconfirmed Medic</name><description>She does not wear a lab coat.</description></character>
 <character id="2"><name>Candidate Doctor</name><description>A lab coat, scalpel, and nurse hat.</description>
  <episodes>2</episodes><seiyuu id="66">Fixture Voice</seiyuu></character>
 <character id="3"><name>Other Medic</name><description>A lab coat, with a scalpel.</description>
  <episodes>1</episodes></character>
 <character id="4"><name>Covered Doctor</name><description>A lab coat is seen in the character's memories.</description></character>
 <character id="5"><name>Unknown</name></character>
</characters></anime>`,"2026-10-15T01:00:00.000Z");

test("episode-positive metadata ranks relevant textual characters but cannot identify a scene",()=>{
 const result=recallCharacterCluesInSourceWork({
  anidbId:440,cues:["lab coat","scalpel"],episodeId:702,limit:2
 },anime);
 assert.ok(scopedSceneRecallResultSchema.safeParse(result).success);
 assert.equal(result.sourceEpisodeStatus,"reported");
 assert.equal(result.sceneIdentification,"not_performed");
 assert.equal(result.sourceMentionsAreNotVerifiedTraits,true);
 assert.equal(result.matchedCharacterRows,4);
 assert.equal(result.truncated,true);
 assert.equal(result.candidates.length,2);
 assert.deepEqual(result.candidates.map(c=>c.characterId),[2,3]);
 assert.equal(result.candidates[0]?.episodeReferenceStatus,"reported_positive");
 assert.equal(result.candidates[1]?.episodeReferenceStatus,"unverified");
 assert.deepEqual(result.candidates[0]?.episodeEvidence.linkedEpisodeIds,[702]);
 assert.equal(result.candidates[0]?.descriptionSourceField,"characters[1].description");
 assert.equal(result.candidates[0]?.voiceActor?.name,"Fixture Voice");
 assert.equal(result.candidates[0]?.matchedCues.length,2);
 assert.equal(result.sourceUrl,"https://anidb.net/anime/440");
 assert.equal(result.retrievedAt,"2026-10-15T01:00:00.000Z");
});

test("negated descriptors and unverified episode references never become positive assertions",()=>{
 const result=recallCharacterCluesInSourceWork({
  anidbId:440,cues:["lab coat"],episodeId:701
 },anime);
 const negated=result.candidates.find(c=>c.characterId===1);
 assert.ok(negated);
 assert.equal(negated.assertionStatus,"candidate_not_identification");
 assert.equal(negated.episodeReferenceStatus,"unverified");
 assert.ok(negated.matchedCues[0]?.normalizedExcerpt.includes("does not wear"));
 assert.equal(result.candidates[0]?.characterId,3);
 const unknown=recallCharacterCluesInSourceWork({anidbId:440,cues:["lab coat"],episodeId:999},anime);
 assert.equal(unknown.sourceEpisodeStatus,"not_reported");
 assert.equal(unknown.matchedCharacterRows,4);
 assert.ok(unknown.candidates.every(c=>c.episodeReferenceStatus==="unverified"));
 const noEpisode=recallCharacterCluesInSourceWork({anidbId:440,cues:["lab coat"]},anime);
 assert.equal(noEpisode.sourceEpisodeStatus,"not_requested");
 assert.ok(noEpisode.candidates.every(c=>c.episodeReferenceStatus==="not_requested"));
});

test("all cues, coverage gaps, and independent source rows stay explicit",()=>{
 const all=recallCharacterCluesInSourceWork({anidbId:440,cues:["lab coat","scalpel"],mode:"all"},anime);
 assert.deepEqual(all.candidates.map(c=>c.characterId),[2,3]);
 assert.equal(all.legacyDescriptionUnknownRows,0);
 const older=structuredClone(anime);
 delete older.characters[0]!.description;
 const partial=recallCharacterCluesInSourceWork({anidbId:440,cues:["lab coat"]},older);
 assert.equal(partial.legacyDescriptionUnknownRows,1);
 assert.equal(partial.matchedCharacterRows,3);
});

test("bad constraints reject before reads; provider error halts; forged records fail closed",async()=>{
 const reads:number[]=[];
 const reader={async getByAniDbId(id:number){reads.push(id);return anime;}};
 for(const raw of [
  {anidbId:440,cues:["--"]},{anidbId:440,cues:["lab coat","LAB-COAT"]},
  {anidbId:0,cues:["lab coat"]},{anidbId:440,cues:["lab coat"],limit:26},
  {anidbId:440,cues:["lab coat"],episodeId:-3}
 ])await assert.rejects(recallCharacterCluesFromSelectedWork(raw,reader));
 assert.deepEqual(reads,[]);
 const good=await recallCharacterCluesFromSelectedWork({anidbId:440,cues:["lab coat"]},reader);
 assert.equal(good.matchedCharacterRows,4);assert.deepEqual(reads,[440]);
 await assert.rejects(recallCharacterCluesFromSelectedWork({anidbId:441,cues:["lab coat"]},reader));
 assert.deepEqual(reads,[440,441]);
 const forged=structuredClone(anime);forged.provenance[0]!.providerId="not-this-id";
 assert.throws(()=>recallCharacterCluesInSourceWork({anidbId:440,cues:["lab coat"]},forged),/provenance/);
});
