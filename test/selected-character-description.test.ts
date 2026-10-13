import assert from "node:assert/strict";
import test from "node:test";
import {mapAniDbAnimeXml} from "../src/providers/anidb/mapper.js";
import {
 searchSelectedCharacterDescriptions,searchCharacterDescriptionsAcrossSelectedAnime
} from "../src/services/selected-character-description-service.js";
import {selectedCharacterDescriptionResultSchema} from "../src/domain/selected-character-description.js";

const at="2026-10-13T18:00:00.000Z";
const record=(id:number,body:string)=>mapAniDbAnimeXml(
  `<anime id="${id}"><titles><title type="main">Synthetic ${id}</title></titles><characters>${body}</characters></anime>`,at);
const one=record(41,`
<character id="9001"><name>Doctor P</name><charactertype id="1">Character</charactertype>
  <description>She wears a lab coat, has pink hair, and carries a scalpel.</description></character>
<character id="9002"><name>Not a Doctor</name><description>She does not wear a lab coat.</description></character>
<character id="9003"><name>Unknown</name></character>`);
const two=record(42,`
<character id="9004"><name>Another P</name><description>Long pink hair flows behind the character.</description></character>
<character id="9005"><name>Other</name><description>A scientist with a notebook.</description></character>`);

test("rank literal source-text mention counts without assuming appearance or negation polarity",()=>{
 const found=searchSelectedCharacterDescriptions({
   anidbIds:[42,41],cues:["pink hair","lab coat","scalpel"],mode:"any"
 },[two,one]);
 assert.equal(found.totalReportedCharacterRows,5);
 assert.equal(found.descriptionsReported,4);
 assert.equal(found.legacyDescriptionUnknownRows,0);
 assert.equal(found.matchedCharacterRows,3);
 assert.deepEqual(found.candidates.map(x=>[x.sourceAnimeId,x.characterId,x.matchedCues.length]),[
   [41,9001,3],[41,9002,1],[42,9004,1]
 ]);
 assert.equal(found.candidates[0]?.matchedCues[0]?.sourceField,"characters[0].description");
 assert.equal(found.candidates[0]?.matchedCues[0]?.evidenceKind,"literal_normalized_text_mention");
 assert.equal(found.candidates[0]?.sourceUrl,"https://anidb.net/anime/41");
 assert.equal(found.candidates[0]?.retrievedAt,at);
 assert.equal(found.candidates[0]?.characterType?.name,"Character");
 assert.equal(found.candidates[1]?.assertionStatus,"lexical_mentions_only",
    "negated sentence cannot become a positive appearance assertion");
 assert.equal(found.sourceMentionsAreNotVerifiedTraits,true);
 assert.ok(selectedCharacterDescriptionResultSchema.safeParse(found).success);
 const all=searchSelectedCharacterDescriptions({
   anidbIds:[41,42],cues:["pink hair","lab coat","scalpel"],mode:"all"
 },[one,two]);
 assert.equal(all.matchedCharacterRows,1);
 assert.equal(all.candidates[0]?.characterId,9001);
});

test("normalization and output limits preserve pre-limit counts, unmatched cues, and old cache gaps",()=>{
 const result=searchSelectedCharacterDescriptions({
   anidbIds:[41,42],cues:["PINK-HAIR","lab coat"],mode:"any",limit:1
 },[one,two]);
 assert.equal(result.matchedCharacterRows,3);
 assert.equal(result.truncated,true);
 assert.equal(result.candidates.length,1);
 const {description:_description,characterType:_type,...older}=one.characters[0]!;
 const legacy={...one,characters:[older,...one.characters.slice(1)]};
 const partial=searchSelectedCharacterDescriptions({anidbIds:[41],cues:["pink hair"]},[legacy]);
 assert.equal(partial.legacyDescriptionUnknownRows,1);
 assert.equal(partial.matchedCharacterRows,0);
 assert.deepEqual(partial.candidates,[]);
});

test("validated bounded selection never reads extra works and stops on provider error",async()=>{
 const reads:number[]=[];
 const reader={async getByAniDbId(id:number){
  reads.push(id);if(id===77)throw new Error("Provider ban");
  return id===41?one:two;
 }};
 for(const input of [
  {anidbIds:[41,41],cues:["lab coat"]},
  {anidbIds:[41,42,43,44,45,46],cues:["lab coat"]},
  {anidbIds:[41],cues:["--"]},
  {anidbIds:[41],cues:["pink hair","PINK-HAIR"]},
  {anidbIds:[41],cues:["a"]}
 ])await assert.rejects(searchCharacterDescriptionsAcrossSelectedAnime(input,reader));
 assert.deepEqual(reads,[]);
 await assert.rejects(searchCharacterDescriptionsAcrossSelectedAnime({
   anidbIds:[41,77,42],cues:["pink hair"]
 },reader),/Provider ban/);
 assert.deepEqual(reads,[41,77]);
});
