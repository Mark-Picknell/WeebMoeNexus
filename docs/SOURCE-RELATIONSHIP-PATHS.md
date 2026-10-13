# Source-scoped cross-entity relationship navigation (P6-07 partial)

**Status:** Implemented and reachable through read-only MCP
`trace_selected_anime_relationship_path`. This is a **bounded source
graph traversal** in 1–5 explicitly selected AniDB anime records, not a
cross-provider global knowledge graph or fully resolved studio catalog.

## Example input (synthetic test IDs)

```json
{
  "anidbIds": [8001, 8002],
  "from": {"kind": "character", "id": 101},
  "to": {"kind": "character", "id": 102},
  "maxHops": 6
}
```

**Do not interpret example IDs as verified real catalog identities.**
Resolve work IDs using `search_anime`, choose explicit works (up to five),
and use exact provider-local character/contributor or work IDs. The tool
reads only selected anime through the existing paced/cached AniDB client.
Validation occurs before source reads; provider failure stops all later reads.

## Supported source edges

- `character_in_work`: a character ID is listed under an AniDB work record.
  Original character role is retained as an uninterpreted source label.
- `voice_credit`: a positive, stable source contributor/seiyuu ID is
  attached to a character row. Missing IDs cannot be joined by name.
- `production_credit`: a source creator/contributor ID has a production
  credit for a selected work; the role remains exactly the source label.
  The contributor **might** be a person or an organization. This is not
  evidence of actual studio status, and labels are not canonicalized.
- `reported_work_relation`: an original source-directed AniDB work link,
  only when both work IDs were explicitly selected. Unselected linked works
  are counted as outside the inspected pool, **not fetched**.

An edge contains original direction, source work ID, URL, retrieval time,
source row field, and reported role/relation label. Multiple source credit
rows remain distinct and may contribute distinct traversable edges.

## Navigation is not identity or a new source assertion

The deterministic shortest-path search can navigate in **either** direction
over the source edges. Each step states `along_reported_direction` or
`against_reported_direction`. The underlying `edge.from` and `edge.to`
are never inverted: navigating work B → work A over an original source
A → B relation **does not** assert that B reported a reverse relation.

Nodes use AniDB-provider-local, **kind-local** positive identifiers.
Character IDs and contributor IDs that happen to share a number are
independent. Repeated names do not create joins; the only cross-work
connections are the explicit stable source IDs. All nodes retain
`entityClass=source_reference_only`, never a fabricated global person,
studio or canonical identity.

## Bounds and uncertainty

- Work count: 1–5 distinct explicitly requested IDs
- Hop limit: 1–8
- Entire selected-pool projection: at most 1,000 distinct nodes and 2,500
  source edges; exceeding either rejects the operation rather than
  returning apparently complete partial results
- `found`: a path exists among selected source rows
- `endpoint_not_reported`: one or both requested provider-local entities
  are not in the selected source records
- `no_path_within_limit`: no path of the specified length was established
  in the inspected records; **never** proof of global nonconnection
- Unresolved credit rows and work relations outside the selected source pool
  are counted. All negative-looking answers preserve `selectedPoolOnly`.

This tool does not use third-party image data, request other providers,
make inferred kinship/personhood/canonical identity claims, classify studios
from plausible-sounding names or reach a global relationship conclusion.

## Regression evidence

- `test/source-relationship-path.test.ts`: stable-ID path traversal,
  reverse-navigation direction honesty, cycle/boundary isolation, missing
  endpoints and hop limits, source provider errors and no extra reads
- `test/mcp-source-relationship-path.test.ts`: actual in-memory MCP
  client, typed output, source timestamp/role preservation, error guards,
  cache reuse and stop-on-ban behavior
- `test/deployment-mcp.test.ts`: all MCP tools remain read-only
- [Service CI: 292/292 offline tests](https://github.com/Mark-Picknell/WeebMoeNexus/actions/runs/38436651113)
- [MCP CI: 293/293 offline tests](https://github.com/Mark-Picknell/WeebMoeNexus/actions/runs/38436952013)

**P6-07 remains open**: explicit studio/org classifications, genuine
cross-provider mapping, independent typed semantic edges for portrayal,
adaptation, aliases and literature, and richer general route queries are
not solved by this source-only navigation tool. Neither synthetic
test success nor source-row evidence establishes real-world completeness.
