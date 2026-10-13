# Source-reported trope/theme label search

`P6-05` delivers a **bounded read-only source-label search**, exposed through
MCP `search_themes_in_selected_anime`.

AniDB anime XML can report tags and category rows; these are source-authored
anime-wide descriptors, **not** evidence that a character appeared in a frame
or proof that a trope applies in every episode. Some source names will
describe themes; there is no semantic ontology or interpretation engine.
[External structure example](https://github.com/Jessidhia/go-anidb/blob/master/http/anime.go).

## MCP request

```json
{
  "anidbIds": [801, 802],
  "query": "psychological",
  "sourceKinds": "both",
  "includeKnownSpoilers": false,
  "limit": 10
}
```

IDs in this example represent **synthetic offline tests**, not verified
live catalog assignments. Use `search_anime` to resolve titles to IDs and
then explicitly choose **one to five distinct** work IDs. The existing
paced/cached AniDB reader fetches those selected records **sequentially**.
The search does not scan every anime or refresh a global tag dump.

## What a hit means

The result preserves each original tag or category row with:

- selected source anime ID/title/URL and actual retrieval time;
- `kind` (`tag` or `category`) and independent source term ID, nullable
  when invalid/missing;
- original source row index and field path (`tags[i].name` or
  `categories[i].name`), original label and exact/normalized/prefix/
  contains match class;
- optional tag approval and category weight, without treating them as a
  calibrated confidence or an equivalence between vocabularies;
- nullable spoiler flags and nullable category restricted flag;
- total rows and total matches **before output truncation**, known spoiler
  exclusions, and any missing theme arrays from older cached normalized
  records as explicit `coverageGaps`.

The query only matches **reported label text**. It does not search arbitrary
synopsis prose, infer tags from artwork or episode descriptions, resolve
synonyms/cultural classifications, or assert shared identity between an
AniDB tag and category with the same name. Repeated reported rows remain
distinct. Missing labels are missing coverage, **not confirmed absence**.

Known spoiler tags are hidden by default. Set `includeKnownSpoilers=true`
to include them in results. Missing spoiler flags are represented as
`null`, *not false*, so hiding known spoilers is **not a guarantee of
spoiler-free results**. Category restricted flags are retained, not silently
treated as spoiler flags.

## Evidence and acceptance limits

The implementation comprises:
- `src/providers/anidb/mapper.ts` and `src/domain/anime.ts`
  for explicit source label ingestion;
- `src/domain/selected-theme-search.ts` for bounded tool schemas;
- `src/services/selected-theme-search-service.ts` for deterministic
  label matching and no unrelated reads;
- `src/server.ts` for the read-only MCP tool;
- three regression files:
  `test/anidb-theme-mapping.test.ts`,
  `test/selected-theme-search.test.ts`, and
  `test/mcp-selected-theme-search.test.ts`.

[First fully passing implementation CI](https://github.com/Mark-Picknell/WeebMoeNexus/actions/runs/38434496531)
reported **286/286 passing offline tests**, TypeScript build, production
container and passive liveness checks. All theme assertions in those tests
are **synthetic**; no live tag coverage or real-work thematic accuracy was
established. Provider-declared capability remains separate from native
catalog completeness.

This scoped theme-label implementation completes the **first useful
operational definition** of P6-05. Global trope discovery, synonym/ontology
alignment, visual reference matching, actual scene reconstruction, deployment
and human-facing golden query acceptance are not claimed and remain separate
product expansion work. Additional providers still require Mark's approval.
