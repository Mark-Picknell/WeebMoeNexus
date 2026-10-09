import assert from "node:assert/strict";
import test from "node:test";
import { animeRecordSchema } from "../src/domain/anime.js";
import { mapAniDbAnimeXml } from "../src/providers/anidb/mapper.js";

/**
 * Synthetic AniDB-like source records; names and roles here are test examples
 * only, not statements about actual staff, characters, or performer credits.
 */
const fixture = `<anime id="501">
  <titles><title type="main" xml:lang="en">Example Crew Story</title></titles>
  <creators>
    <name id="10" type="Direction">A. Sample</name>
    <name id="10" type="Series Composition">A. Sample</name>
    <name id="20" type="Original Work">A. Sample</name>
    <name id="30" type="Animation Work">Studio Example</name>
    <name type="Music">Uncredited Example</name>
    <name id="invalid" type="Chief Animation Direction">Mystery</name>
    <name id="21474836470" type="Design">Another Example</name>
    <name id="42"/>
  </creators>
  <characters>
    <character id="1001"><name>Hero</name>
      <seiyuu id="10" picture="a.png">A. Sample</seiyuu>
    </character>
    <character id="1002"><name>Rival</name>
      <seiyuu id="20">A. Sample</seiyuu>
    </character>
    <character id="1003"><name>Uncredited Role</name>
      <seiyuu id="not-a-number">A. Sample</seiyuu>
    </character>
    <character id="1004"><name>Another Uncredited Role</name>
      <seiyuu>Unknown Voice</seiyuu>
    </character>
  </characters>
</anime>`;

test("creator role rows preserve source creator IDs, names, multiple roles and duplicate names", () => {
  const anime = mapAniDbAnimeXml(fixture);
  assert.deepEqual(anime.creators, [
    { id: 10, name: "A. Sample", role: "Direction" },
    { id: 10, name: "A. Sample", role: "Series Composition" },
    { id: 20, name: "A. Sample", role: "Original Work" },
    { id: 30, name: "Studio Example", role: "Animation Work" },
    { id: null, name: "Uncredited Example", role: "Music" },
    { id: null, name: "Mystery", role: "Chief Animation Direction" },
    { id: 21474836470, name: "Another Example", role: "Design" },
    { id: 42, name: null, role: null }
  ]);
  assert.equal(animeRecordSchema.safeParse(anime).success, true);
});

test("voice credit source IDs do not merge different persons with identical names", () => {
  const anime = mapAniDbAnimeXml(fixture);
  assert.deepEqual(anime.characters.map(x => x.voiceActor), [
    { id: 10, name: "A. Sample", picture: "a.png" },
    { id: 20, name: "A. Sample", picture: null },
    { id: null, name: "A. Sample", picture: null },
    { id: null, name: "Unknown Voice", picture: null }
  ]);
  assert.equal(anime.characters[0]?.voiceActor?.id, anime.creators[0]?.id);
  assert.notEqual(anime.characters[0]?.voiceActor?.id, anime.creators[2]?.id);
});

test("unknown production credit metadata is nullable and retained, not invented", () => {
  const record = mapAniDbAnimeXml(`<anime id="77">
    <creators><name type="Original Work">Writer</name>
      <name id="0" type="Direction">Director</name></creators>
    <characters><character id="4"><name>Figure</name>
      <seiyuu id="-100">Performer</seiyuu></character></characters>
  </anime>`);
  assert.deepEqual(record.creators, [
    { id: null, name: "Writer", role: "Original Work" },
    { id: null, name: "Director", role: "Direction" }
  ]);
  assert.equal(record.characters[0]?.voiceActor?.id, null);
  assert.equal(animeRecordSchema.safeParse(record).success, true);
});

test("missing creator section returns empty *reported credits*, not asserted total absence", () => {
  const record = mapAniDbAnimeXml('<anime id="1725"/>');
  assert.deepEqual(record.creators, []);
  assert.equal(animeRecordSchema.safeParse(record).success, true);
});
