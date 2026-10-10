# Bounded entity comparison — first P3-10 implementation slice

`compare_anime_entities` compares names in one to five source AniDB anime
records selected by the caller. Resolve work IDs with `search_anime` first.
This is a production MCP tool with offline unit/protocol regressions; it is
not global character/person discovery. **P3-10 remains unchecked** because the
full task also needs verified species/character-alias ingestion and discovery.
Golden-query fixture integrity still does not establish end-to-end resolution.

## Input

| Field | Meaning |
| --- | --- |
| `anidbIds` | One to five distinct positive safe integer source anime IDs. No related work is fetched implicitly. |
| `query` | Source character/contributor name, 2–120 characters. Exact or conservative normalized matching only. |
| `kind` | `character` (default) or `contributor`. Production contributors can be people or companies. |
| `workTitle` | Optional constraint matched against titles actually reported in each examined anime record. |
| `alias` | Optional explicit alias assertion. Current AniDB projection supplies no verified character/contributor aliases, so this remains unknown. |
| `species` | Optional species assertion. Current AniDB projection supplies none, so this remains unknown. |
| `limit` | 1–25 returned source occurrences; default 10. Counts/resolution use the whole examined name-candidate pool. |

All textual constraints need at least two meaningful normalized characters.
Name-order inversion, fuzzy identity guesses and prefix names do not establish
matches. A spelling actually reported under the same contributor ID can match
as a reported name; no alias relationship is invented from that observation.
Work-title aliases are the source's existing title rows, distinct from entity
aliases. Missing work titles do not turn the mapper's display fallback into
source evidence. Resolve a title to its work ID before using this optional
text constraint; unreported translations/aliases are not guessed.

Example using only the known source work ID:

```json
{
  "name": "compare_anime_entities",
  "arguments": {
    "anidbIds": [1725],
    "query": "Carrera",
    "workTitle": "Viper GTS",
    "species": "Succubus"
  }
}
```

This is a call shape, **not a verified live AniDB result**. When the source
reports the name and work but lacks species, the candidate remains unverified
for that constraint. No hard-coded Carrera character ID or biological label
exists in production code. Another work's exact name cannot override supplied
work context merely because it appears earlier or is more popular.

## Candidate evidence and status

Each returned source occurrence includes its entity namespace/ID, source work,
reported names, source URL/retrieval timestamp, production/voice credit rows,
and field checks with the assertions used. Character IDs and creator IDs are
different namespaces. Creator and seiyuu rows under the same explicitly
reported creator ID share a contributor occurrence **within that work**, while
every credit row remains visible. Identical names under different IDs stay
separate. Missing contributor IDs retain independent row keys and an unknown
identity check, never a name-based merge. Unnamed rows cannot support a name
query; unnamed credits under an otherwise named contributor ID are retained.

Repeated character ID rows in one source record retain their reported names
under that explicit ID. Across works, the same ID retains separate source
occurrences. This is neither proof of distinct individuals nor an inferred
cross-work identity merge. Generated missing-name labels are not searchable
source assertions. A company production role does not establish personhood;
voice/production links never imply family relationships.

| Status | Meaning within the examined records |
| --- | --- |
| `matched` | Every requested constraint has matching evidence and the candidate has a source ID. |
| `unverified` | At least one requested field or source ID is unknown, without an explicit conflict. |
| `conflicting` | The observed source-work titles differ from the supplied work context, or explicit assertions contradict/disagree about a requested value. |

A work-title mismatch describes this source occurrence's reported work; it
does not prove the entity never appears in the requested work, nor that a
missing alternate title is invalid globally. Missing alias/species assertions
are unknown. A different species label is also unknown for the requested
label: `Demon` does not establish either `Succubus` or `not Succubus`. No species
taxonomy or mutually exclusive biological categories are assumed.

The pure comparison contract can evaluate explicit positive/negative alias or
species assertions, preserving disagreement. These paths are exercised only
with clearly synthetic contract fixtures in this slice. **No live enrichment
adapter or external assertion-ingestion endpoint is enabled.** Schemas validate
shape, not the truth/authenticity of a cited source. The MCP input does not let
callers inject candidate assertions as provider-authored metadata.

Candidates rank by matched/unverified/conflicting status, then exact/normalized
name class, then deterministic source IDs/occurrence keys. This is not Mark's
future evidence-based similarity ranking across independent Carreras.

`resolution` is `unique_in_examined_records` only for one matched source
occurrence with no unresolved candidates; `ambiguous` for multiple matches;
`incomplete` whenever unresolved candidates remain; otherwise
`no_match_in_examined_records`. Truncation cannot make ambiguity disappear.
None of these states asserts catalog completeness or global nonexistence.

## Reads and evidence limits

Source reads run sequentially through the existing paced memory/disk cache,
at most once per explicitly selected ID. Invalid bounds/constraints reject
before reads. The first provider failure stops later reads, without retry or
an output that implies the whole pool was examined. Structured provider errors
follow the existing contract. Mismatched IDs/provenance are invalid responses.

`test/entity-comparison.test.ts` tests the Viper/Carrera collision mechanism,
arbitrary work IDs, truncation, unknown species/aliases, explicit synthetic
assertions and disagreements, name-order and namespace separation, preserved
credits, missing IDs, generated labels, sequencing, failure stopping and input
validation. `test/mcp-entity-comparison.test.ts` invokes the real MCP tool over
an in-memory transport with synthetic XML, including cache reuse and failures.
No live AniDB request is made; all golden corpus cases remain
`pending_resolver`. V-06's full past-error suite, P3-10 completion, P3-11's typed
relationship graph and Mark's presentation acceptance remain open.
