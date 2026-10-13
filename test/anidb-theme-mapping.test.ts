import assert from "node:assert/strict";
import test from "node:test";
import { animeRecordSchema } from "../src/domain/anime.js";
import { mapAniDbAnimeXml } from "../src/providers/anidb/mapper.js";

test("normalizes independent AniDB tag and category rows with actual source paths", () => {
  const xml = `<anime id="501">
    <titles><title type="main">Synthetic Orchard</title></titles>
    <tags>
      <tag id="71" approval="22" localspoiler="0" globalspoiler="1"><name>found family</name></tag>
      <tag id="72" approval="0"><name>mystery</name></tag>
      <tag id="71" approval="9"><name>found family</name></tag>
    </tags>
    <categories>
      <category id="11" parentid="0" weight="300" hentai="0"><name>science fiction</name><description>Fixture genre</description></category>
    </categories>
  </anime>`;
  const record = mapAniDbAnimeXml(xml, "2026-10-13T16:00:00.000Z");
  assert.equal(record.tags?.length, 3, "duplicate source rows are not discarded");
  assert.deepEqual(record.tags?.[0], {
    id: 71, name: "found family", approval: 22, localSpoiler: false, globalSpoiler: true
  });
  assert.deepEqual(record.tags?.[1], {
    id: 72, name: "mystery", approval: 0, localSpoiler: null, globalSpoiler: null
  });
  assert.deepEqual(record.categories?.[0], {
    id: 11, parentId: 0, name: "science fiction", description: "Fixture genre",
    weight: 300, restricted: false
  });
  assert.ok(animeRecordSchema.safeParse(record).success);
});

test("missing or malformed attributes remain null; an absent XML collection maps to empty array", () => {
  const record = mapAniDbAnimeXml(`<anime id="502">
    <tags><tag id="not-a-number" approval="-17" localspoiler="maybe"><name>experimental</name></tag>
      <tag id="9007199254740993000"><name/></tag></tags>
  </anime>`);
  assert.equal(record.tags?.[0]?.id, null);
  assert.equal(record.tags?.[0]?.approval, null);
  assert.equal(record.tags?.[0]?.localSpoiler, null);
  assert.equal(record.tags?.[1]?.id, null);
  assert.equal(record.tags?.[1]?.name, null);
  assert.deepEqual(record.categories, []);
  assert.deepEqual(mapAniDbAnimeXml('<anime id="503"/>').tags, []);
  assert.ok(animeRecordSchema.safeParse(record).success);
});

test("historic cached records without newly ingested theme arrays remain parseable", () => {
  const record = mapAniDbAnimeXml('<anime id="504"/>');
  const { tags: _tags, categories: _categories, ...old } = record;
  const parsed = animeRecordSchema.parse(old);
  assert.equal(parsed.tags, undefined);
  assert.equal(parsed.categories, undefined);
});
