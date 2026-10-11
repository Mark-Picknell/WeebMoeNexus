# Shared contributors across explicitly selected anime

**Verified bounded credit-path slice · 2026-10-11 UTC.** The read-only MCP
`find_shared_contributors` tool compares **2–5 caller-selected AniDB anime
records**, which are fetched sequentially through the existing paced and
success-cached source reader. Its only cross-work join key is a **positive
AniDB contributor ID** appearing in two or more selected work records.
Production credit IDs and character-attached `seiyuu` IDs share AniDB's
creator/contributor namespace in the current adapter.

## Input

```json
{
  "name": "find_shared_contributors",
  "arguments": { "anidbIds": [101, 102], "limit": 10 }
}
```

The example IDs and all matching credit fixtures used in offline tests are
**synthetic**, not assertions about real AniDB staff. Callers choose work IDs
explicitly, optionally through the previously initialized local
`search_anime` index. Duplicated work IDs or an out-of-range limit reject
**before source reads**. Two through five distinct positive IDs are allowed,
and `limit` defaults to 10 (maximum 25).

## Evidence rules

Each result represents **one source contributor ID** that is reported in at
least two of the examined works. It contains the source ID and AniDB creator
URL, verbatim reported names, a flag for divergent normalized names, number
and IDs of source works, and every matched source credit row. Each row
retains work ID/title, source URL/retrieval time, exact normalized field path,
`production` or `voice`, the source role (nullable), and attached character
ID/name when the record reports a voice credit.

- **Different source IDs with the same reported name do not join.** The
  `distinctNamedIdCollisionCount` flags how many normalized names in the
  examined source pool occur under two or more positive IDs.
- **Rows without valid IDs cannot establish a cross-work identity.** They
  increment `unresolvedIdCreditRows` and are never silently assigned a
  borrowed identity, even if their names resemble other credits.
- **Names attached to the same source ID may disagree.** The variant
  `different_reported_names` preserves those source names rather than
  choosing a winner or inferring a legal name or alias.
- **A contributor is not necessarily a human.** AniDB production credits
  may refer to organizations. A voice/production record does not establish
  kinship, real-world personhood, translation equivalence or fictional
  character identity.
- Every reported source credit row is counted before result truncation.
  `sharedContributorCount` is the full number of distinct repeated source
  IDs in this bounded pool; `truncated` is true when only the first
  `limit` source IDs are returned. The source pool is capped at **2,000
  credit rows** and errors instead of quietly claiming complete output
  beyond that bound.

The join is a **source-reported common-credit path** between explicitly
selected works. It does not assert a global staff catalog, infer similarity
between studios or directors, traverse a complete relationship graph, or
merge independent character IDs. A missing ID is unknown, not a negative
assertion of identity. Unexpected source failures stop later reads and
preserve the existing typed provider-error envelope. Nonmatching source
provenance and wrong provider IDs fail closed.

## Verification and boundaries

- `src/domain/shared-contributors.ts` defines strict bounded input/output.
- `src/services/shared-contributors-service.ts` assembles original source
  credit rows and joins stable ID references without name inference.
- `test/shared-contributors.test.ts` verifies duplicate credit rows,
  cross-role identity references, reported name disagreement, organizations,
  null identifiers, distinct-name collisions, sorted/truncated counts,
  source field paths, validation, failed provenance and sequential reads.
- `test/mcp-shared-contributors.test.ts` calls the registered MCP tool with
  synthetic XML, verifies response schemas/cache reuse and a simulated
  provider ban stopping later source requests.
- Loopback HTTP lists **14 read-only tools** after integration.
- [Final MCP implementation CI: 268 passing offline tests, build and
  production-container validation](https://github.com/Mark-Picknell/WeebMoeNexus/actions/runs/38180843638).

This is a **partial slice**, not phase completion of P3-10 or P6-07. Missing
global contributor discovery, approved additional providers, rich
semantic relationship traversals and actual ChatGPT installation remain
explicitly open. Register still **54/87 complete, 33 outstanding**.
