import assert from "node:assert/strict";
import test from "node:test";
import { mapAniDbAnimeXml } from "../src/providers/anidb/mapper.js";
import { searchSelectedCharacterRecords } from "../src/services/selected-character-search-service.js";
import { selectedCharacterSearchResultSchema } from "../src/domain/selected-character-search.js";
const stamp = "2026-10-14T21:15:00.000Z";
const first = mapAniDbAnimeXml(`<anime id="101"><titles><title type="main">Original Work</title></titles>
<characters><character id="41"><name>Nijou Aki</name><seiyuu id="61">Original Voice Performer</seiyuu></character>
<character id="42"><name>Aki Nijou</name></character><character id="43"><name>Another Aki Nijou</name></character></characters></anime>`, stamp);
const second = mapAniDbAnimeXml(`<anime id="102"><titles><title type="main">Sequel Work</title></titles>
<characters><character id="99"><name>Nijou Aki</name></character></characters></anime>`, stamp);

test("opt-in two-token name order suggests distinct source-row candidates without identity merging", () => {
 const off=searchSelectedCharacterRecords({anidbIds:[102,101],query:"Aki Nijou"},[second,first]);
 assert.equal(off.considerNameOrderVariants,false);
 assert.equal(off.totalNameMatches,2,"default ignores guessed reversed aliases");
 assert.ok(off.results.every(x=>x.nameMatch!=="reversed_two_token_candidate"));
 const result=searchSelectedCharacterRecords({
   anidbIds:[102,101],query:"Aki Nijou",workTitle:"Original Work",considerNameOrderVariants:true
 },[second,first]);
 assert.ok(selectedCharacterSearchResultSchema.safeParse(result).success);
 assert.equal(result.considerNameOrderVariants,true);
 assert.equal(result.totalNameMatches,4);
 assert.deepEqual(result.results.map(x=>[x.sourceAnimeId,x.anidbCharacterId,x.nameMatch,x.workTitleMatch]),[
  [101,42,"exact","reported_match"],
  [101,41,"reversed_two_token_candidate","reported_match"],
  [101,43,"contains","reported_match"],
  [102,99,"reversed_two_token_candidate","different_source_work"]
 ]);
 assert.equal(result.results[1]?.evidenceSourceField,"characters[0].name");
 assert.equal(result.results[1]?.characterName,"Nijou Aki");
 assert.equal(result.results[1]?.voiceActor?.name,"Original Voice Performer");
 assert.equal(result.results[3]?.characterUrl,"https://anidb.net/character/99");
 assert.equal(result.results[1]?.retrievedAt,stamp);
});
test("candidate reversal does not invent transliteration, aliases or cross-script identity", () => {
 const anime=mapAniDbAnimeXml(`<anime id="301"><characters>
 <character id="55"><name>二条 秋</name></character>
 <character id="56"><name>Dr. Aki</name></character>
 <character id="57"><name>Nijō Aki</name></character>
 <character id="58"><name>Aki Nijou Extra</name></character>
 </characters></anime>`,stamp);
 const latin=searchSelectedCharacterRecords({
   anidbIds:[301],query:"Aki Nijou",considerNameOrderVariants:true
 },[anime]);
 assert.equal(latin.totalNameMatches,0,"macron expansion and extra tokens are not invented");
 assert.equal(searchSelectedCharacterRecords({
   anidbIds:[301],query:"秋 二条",considerNameOrderVariants:true
 },[anime]).totalNameMatches,0,"no Kanji name-order guess");
 assert.equal(searchSelectedCharacterRecords({
   anidbIds:[301],query:"二条 秋",considerNameOrderVariants:true
 },[anime]).results[0]?.nameMatch,"exact");
});
test("opt-in remains bounded and counters preserve source records before truncation",()=>{
 const result=searchSelectedCharacterRecords({
  anidbIds:[101,102],query:"Aki Nijou",considerNameOrderVariants:true,limit:1
 },[first,second]);
 assert.equal(result.totalNameMatches,4);
 assert.equal(result.truncated,true);
 assert.equal(result.results.length,1);
 assert.equal(result.results[0]?.nameMatch,"exact");
});
