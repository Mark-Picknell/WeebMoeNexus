import assert from "node:assert/strict";
import test from "node:test";
import { animeRecordSchema } from "../src/domain/anime.js";
import { mapAniDbAnimeXml } from "../src/providers/anidb/mapper.js";

test("preserves source character descriptions and typed charactertype without inventing species", () => {
  const record = mapAniDbAnimeXml(`<anime id="773">
    <titles><title type="main">Synthetic Lantern</title></titles>
    <characters>
      <character id="900"><name>Dr. Pea</name>
        <description>Pink hair, a white laboratory coat, and a surgical scalpel.</description>
        <charactertype id="1">Character</charactertype>
      </character>
      <character id="901"><name>Doctor? </name>
        <description>A ghost in the original source.</description>
        <charactertype id="3">Organisation</charactertype>
      </character>
      <character id="902"><name>Unnamed</name><charactertype id="n/a"/></character>
    </characters>
  </anime>`, "2026-10-13T18:00:00.000Z");
  assert.equal(record.characters[0]?.description,"Pink hair, a white laboratory coat, and a surgical scalpel.");
  assert.deepEqual(record.characters[0]?.characterType,{id:1,name:"Character"});
  assert.deepEqual(record.characters[1]?.characterType,{id:3,name:"Organisation"});
  assert.deepEqual(record.characters[2]?.characterType,{id:null,name:null});
  assert.equal(record.characters[2]?.description,null);
  assert.equal(record.provenance[0]?.sourceUrl,"https://anidb.net/anime/773");
  assert.ok(animeRecordSchema.safeParse(record).success);
});

test("missing character profile fields remain unknown, and earlier source cache versions remain valid", () => {
  const original=mapAniDbAnimeXml('<anime id="774"><characters><character id="6"><name>Unknown</name></character></characters></anime>');
  assert.equal(original.characters[0]?.description,null);
  assert.equal(original.characters[0]?.characterType,null);
  const legacy={...original,characters:original.characters.map(({description:_description,characterType:_characterType,...rest})=>rest)};
  const parsed=animeRecordSchema.parse(legacy);
  assert.equal(parsed.characters[0]?.description,undefined);
  assert.equal(parsed.characters[0]?.characterType,undefined);
});

test("a character category is not a producer/studio classification or species claim", () => {
  const record=mapAniDbAnimeXml('<anime id="775"><characters><character id="7"><name>A vessel</name><charactertype>Vessel</charactertype></character></characters></anime>');
  assert.deepEqual(record.characters[0]?.characterType,{id:null,name:"Vessel"});
  assert.equal(record.characters[0]?.description,null);
});
