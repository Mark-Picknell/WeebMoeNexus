import assert from "node:assert/strict";
import test from "node:test";
import { mapAniDbAnimeXml } from "../src/providers/anidb/mapper.js";
import { searchSelectedThemeRecords, searchThemesAcrossSelectedAnime } from "../src/services/selected-theme-search-service.js";
import { selectedThemeSearchResultSchema } from "../src/domain/selected-theme-search.js";

const stamp = "2026-10-13T16:30:00.000Z";
const fixture = (id: number, xml: string) =>
  mapAniDbAnimeXml(`<anime id="${id}"><titles><title type="main">Fixture ${id}</title></titles>${xml}</anime>`, stamp);
const one = fixture(41, `<tags>
  <tag id="100"><name>Time Travel</name></tag>
  <tag id="200" localspoiler="1"><name>time travel</name></tag>
  <tag id="101"><name>time loop</name></tag>
  </tags><categories><category id="1" weight="120"><name>Time Travel</name></category></categories>`);
const two = fixture(42, `<tags><tag id="100"><name>Time Travel</name></tag></tags>
  <categories><category id="2"><name>Science Fiction</name></category></categories>`);

test("bounded source label search ranks reported exact/prefix matches, keeps IDs/duplicates, records spoof flags", () => {
  const results = searchSelectedThemeRecords({anidbIds:[42,41],query:"Time Travel"},[two,one]);
  assert.equal(results.scope,"selected_anidb_anime_source_tags_and_categories_only");
  assert.equal(results.totalReportedTagRows,4);
  assert.equal(results.totalReportedCategoryRows,2);
  assert.equal(results.totalLabelMatches,3);
  assert.equal(results.excludedKnownSpoilerRows,1);
  assert.deepEqual(results.results.map(r=>[r.sourceAnimeId,r.kind,r.sourceTermId,r.sourceRowIndex,r.matchType]), [
    [41,"tag",100,0,"exact"],[41,"category",1,0,"exact"],[42,"tag",100,0,"exact"]
  ]);
  assert.equal(results.results[0]?.evidenceSourceField,"tags[0].name");
  assert.equal(results.results[0]?.retrievedAt,stamp);
  assert.equal(results.results[0]?.sourceAnimeUrl,"https://anidb.net/anime/41");
  assert.equal(results.results[0]?.localSpoiler,null,"absent spoiler flag is unknown, not false");
  assert.ok(selectedThemeSearchResultSchema.safeParse(results).success);

  const shown=searchSelectedThemeRecords({anidbIds:[41],query:"Time Travel",includeKnownSpoilers:true},[one]);
  assert.equal(shown.excludedKnownSpoilerRows,0);
  assert.equal(shown.totalLabelMatches,3);
  assert.equal(shown.results[1]?.label,"time travel");
  assert.equal(shown.results[1]?.localSpoiler,true);
});

test("source kind controls, normalized matching and bounded output do not erase source counts", () => {
  const matched=searchSelectedThemeRecords({anidbIds:[41,42],query:"time",sourceKinds:"tags",limit:1},[one,two]);
  assert.equal(matched.totalLabelMatches,3);
  assert.equal(matched.truncated,true);
  assert.equal(matched.results.length,1);
  assert.equal(matched.totalReportedCategoryRows,2);
  const onlyCategory=searchSelectedThemeRecords({anidbIds:[41,42],query:"time travel",sourceKinds:"categories"},[one,two]);
  assert.equal(onlyCategory.totalLabelMatches,1);
  assert.equal(onlyCategory.results[0]?.kind,"category");
});

test("older normalized/cached source missing new arrays exposes coverage gaps", () => {
  const {tags:_t,categories:_c,...legacy}=two;
  const result=searchSelectedThemeRecords({anidbIds:[42],query:"Time Travel"},[legacy]);
  assert.equal(result.totalLabelMatches,0);
  assert.deepEqual(result.coverageGaps,[{sourceAnimeId:42,missingArrays:["tags","categories"]}]);
});

test("input scope and invalid IDs rejected before any reads; source reads are serial and stop on error", async () => {
  const reads:number[]=[];
  const src={async getByAniDbId(id:number){ reads.push(id); if(id===43)throw new Error("ban; do not retry"); return id===41?one:two; }};
  for(const input of [
    {anidbIds:[41,41],query:"time"}, {anidbIds:[41,42,43,44,45,46],query:"time"},
    {anidbIds:[41],query:"*"}, {anidbIds:[0],query:"time"},
    {anidbIds:[41],query:"time",limit:31}
  ]) await assert.rejects(searchThemesAcrossSelectedAnime(input,src));
  assert.deepEqual(reads,[]);
  const ok=await searchThemesAcrossSelectedAnime({anidbIds:[41,42],query:"time"},src);
  assert.deepEqual(reads,[41,42]);
  assert.equal(ok.examinedAnimeIds.length,2);
  await assert.rejects(searchThemesAcrossSelectedAnime({anidbIds:[41,43,42],query:"time"},src),/ban/);
  assert.deepEqual(reads,[41,42,41,43],"no later read after provider failure");
});
