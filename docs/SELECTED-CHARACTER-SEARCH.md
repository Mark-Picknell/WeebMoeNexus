# Bounded selected-work character-name discovery

**Implementation checkpoint: 2026-10-11 UTC.** The read-only MCP tool
`search_characters_in_selected_anime` supports **name-based** discovery inside
**one to five explicitly specified AniDB anime records**. The caller can use
the existing local `search_anime` title index to obtain those IDs, then
inspect source-reported characters without claiming a globally searchable
character catalog. This is an independent tool; it does not replace the more
strict `compare_anime_entities` evidence/identity comparison contract.

## Input and output

| Input | Interpretation |
| --- | --- |
| `anidbIds` | 1–5 distinct positive, safe AniDB anime IDs. Supplied by the caller. |
| `query` | Character-name string, 2–120 characters with at least two meaningful normalized characters. |
| `workTitle` | Optional source-reported title constraint, 2–120 characters. **Ranking**, not identity truth or automatic lookup. |
| `limit` | Default 10, allowed 1–25; counts consider the entire examined candidate pool. |

Character name matching ranks `exact`, then conservative case/width/
punctuation-normalized forms, then `prefix`, then `contains` (minimum three
normalized characters). All classes are **labels for name similarity**,
not identity merges. There is no guessed transliteration, char-alias
generation, reversed name-order matching, fuzzy character identity or global
character search. `workTitle` is checked against source-reported title rows.
A reported match is displayed first; missing title metadata is `not_reported`,
not false; differing known source-work titles are marked
`different_source_work`, meaning a mismatch *in that source record*, not a
proof about worldwide appearances.

Every result supplies its source anime ID/title, source URL and timestamp,
AniDB character ID and character URL, original character name,
`characters[index].name` field path, name class, work-title match status,
and nullable role/gender/voice-actor data. **Duplicate character IDs in a
source record retain distinct rows with their own row indexes**, and the
same character number in another anime stays a distinct source occurrence.
The mapper's synthesized `AniDB character #ID` fallback is not indexed as
a source-authored character name. Counts are computed before truncation.
With no reported match, the tool says only that no examined source-name row
matched; it never proves global nonexistence.

## How the implementation reads

All constraints are validated **before any source request**. IDs are read in
the supplied order, sequentially through the existing paced/cached
`AnimeService`, with no retry, implicit related-work exploration or
cross-provider integration. A provider failure stops later reads and uses the
existing structured error envelope; it is not turned into a misleading
partial answer claiming the requested work set was fully searched.
Wrong IDs or source provenance fail closed.

For example, this call shape selects two **user-supplied** work IDs:

```json
{
  "name": "search_characters_in_selected_anime",
  "arguments": {
    "anidbIds": [1725, 9800],
    "query": "Carrera",
    "workTitle": "Viper GTS",
    "limit": 10
  }
}
```

The source character rows in the tests are deliberately **synthetic**.
No actual live AniDB character identities, species or authorizations are
established by this example.

## Evidence and open boundaries

- `src/domain/selected-character-search.ts` and
  `src/services/selected-character-search-service.ts` define the bounded
  contract and the deterministic source-pool ranking.
- `test/selected-character-search.test.ts` checks name classes, explicit
  work precedence, reused IDs, duplicate rows, generated labels,
  normalization, missing-work unknowns, truncation and failure stopping.
- `test/mcp-selected-character-search.test.ts` calls the real registered
  MCP tool against synthetic XML and the existing success cache, including
  a provider ban that stops later reads.
- `test/deployment-mcp.test.ts` verifies all **12** registered tools are
  read-only over loopback HTTP.
- [Final implementation CI: 253/253 offline tests, TypeScript build and
  production container checks passed](https://github.com/Mark-Picknell/WeebMoeNexus/actions/runs/38108295725).

This is **not** global person/character discovery, a character-to-episode
classifier, doctor/pink-hair/scalpel attribute search, verified species or
entity-alias ingestion, a second-provider integration, semantic golden-query
acceptance or a deployed ChatGPT plugin. P3-10 remains open. Official
source-wide indexes or sanctioned additional provider data, with owner
authorization where required, are still needed for global character search.
