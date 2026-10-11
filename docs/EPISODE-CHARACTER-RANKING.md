# Episode-aware character candidate ranking — bounded P6-02 slice

This is a **verified, source-metadata-only** first slice of P6-02, **not**
pause-frame recognition. The registered read-only MCP tool
`rank_episode_characters` accepts a known AniDB anime ID and a numeric AniDB
episode EID **reported by that same source anime**. It prioritizes characters
with positive source-reported episode references. Unknown or incomplete fields
cannot exclude a character or establish that the character did not appear.

## Contract

| Input | Meaning |
| --- | --- |
| `anidbId` | Explicit source anime ID; no work discovery or relation traversal. |
| `episodeId` | AniDB episode EID as listed in the selected source anime, not a season/episode position or screenshot time. |
| `limit` | 1–100 source character rows returned, default 25. Ranking/counts consider every source character row first. |

The tool makes **one** request through the existing paced and validated
`AnimeService` boundary and reuses its memory/disk cache. It neither fetches
the episode independently nor contacts a second provider. Invalid IDs/limits
reject before source reads.

Only a parsed positive character-episode reference that joins an episode **in
the same anime record** produces `appearance: "reported_positive"`. The
label means **source-report-positive metadata**, not verified animation frames
or comprehensive episode appearance. A missing, unrecognized, unlisted,
conflicting, or incomplete episode list produces `appearance: "unverified"`
for that episode. There is deliberately no `absent` outcome.

Candidates are sorted positive-first, then in source character-row order.
Reported duplicate character IDs retain distinct rows with
`sourceRowIndex`, rather than inventing a deduplicated identity. Generated
name fallbacks are marked with `nameIsSourceReported: false`.
`episodeEvidence` retains original raw syntax, parse/coverage statuses,
linked episode IDs, unresolved references and unparsed tokens.

If the requested episode EID is not in this source anime's episode list,
`sourceEpisodeFound` is false and **zero predictions** are made. This means
not reported in the examined source response, **not** that the episode or
character does not exist. `reportedCharacterRows` still reports the scoped
source count. `totalCandidates`, `positiveReferenceCount`,
`unverifiedCount` and `truncated` are computed **before** the result limit,
so a truncated response cannot hide the unverified evidence pool.

## Synthetic example (not live AniDB facts)

```json
{
  "name": "rank_episode_characters",
  "arguments": { "anidbId": 42, "episodeId": 102, "limit": 25 }
}
```

This request shape uses IDs from intentionally synthetic test fixtures. Do not
interpret these IDs or the mock result as real AniDB character sightings.

## Tests and limitations

- Pure-function regressions: `test/episode-character-ranking.test.ts` verify
  positive references, partial metadata, special episode kinds, duplicate IDs,
  bounds, truncation, provenance and missing episodes.
- Real in-memory MCP client/server regressions:
  `test/mcp-episode-character-ranking.test.ts` prove the registered tool
  behaves consistently, checks source-only reads, cache reuse and invalid input.
- Loopback HTTP MCP tooling test: `test/deployment-mcp.test.ts` validates
  all **11** tools are read-only, including this new one.
- [Final corrected CI (227 offline tests, build and production image)](https://github.com/Mark-Picknell/WeebMoeNexus/actions/runs/38106503911).

No third-party episode video, audio, screenshot or optical character recognition
is processed. No image/media authorization, global character search, cross-work
identity resolver, similarity ranking, visual classifier, real catalog
appearance accuracy audit or hosted ChatGPT connection is established. P6-02
remains **unchecked** until actual pause-frame candidate selection and
integration have verified evidence. GQ semantic cases remain pending.

## Next meaningful increments

1. Define the **user-observed pause-frame identification evidence** shape,
   including time code, work/episode ambiguity, consent and provenance; keep
   user assertions separate from provider metadata.
2. Rank a bounded, **already established candidate set** using independent
   observed visual traits plus optional source-positive episodes, with no
   hard negative for incomplete source metadata.
3. Add integration/regression evidence for sparse metadata and mistaken user
   observations before claiming P6-02 complete.
