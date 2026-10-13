# Source-reported character-description cue search (P6-01 partial)

**Scope:** `search_character_descriptions_in_selected_anime` is a read-only
MCP tool that matches **literal normalized text mentions** in AniDB
character descriptions for **one to five explicitly selected anime IDs**.
This is a first source-evidence capability toward P6-01, **not**
completed general visual/appearance search or GQ-001 acceptance.

## Motivation and provider evidence

AniDB's HTTP anime response may include a character-level
`<description>` and `<charactertype id="...">...</charactertype>`
beside each character's name, role and voice actor. Earlier normalized
records silently discarded these fields. The mapper now retains them,
with nullable values and optional schema fields for older local cache
entries. A source type can describe an organization or vessel; it is
**not** an inference about species, a studio classification, or a
character identity link.

Documentation reference:
https://pkg.go.dev/github.com/lusoris/goenvoy/metadata/anime/anidb#Character

## Request example (synthetic, NOT live AniDB IDs)

```json
{
  "anidbIds": [801, 802],
  "cues": ["pink hair", "lab coat", "scalpel"],
  "mode": "any",
  "limit": 10
}
```

Use `search_anime` first to find genuine work IDs and explicitly select
the source records to examine. This tool cannot use an unbounded or
automatic anime discovery process. It reads those records sequentially
through the existing paced and cached AniDB adapter; invalid parameters
fail before any source read, and a provider failure stops later reads.

`cues` contains 1–6 nonduplicate meaningful phrases. Each phrase is
compared using the existing bounded Unicode/key normalization, and
matching is against consecutive complete normalized words. It does
not infer synonyms, grammatical roles, semantic intent, negation, or
alternate-language equivalence. `mode: "any"` returns source character
rows with at least one literal phrase mention, ordered by count of
mentions; `mode: "all"` requires each cue to be mentioned.

## Response evidence

Each match retains the AniDB work and character ID, source work title,
source URL, retrieval time, exact character source row, optional
character-type record, matched cues, requested cues not observed, and
a short **normalized excerpt** of the source description. The excerpt
is not a byte-accurate quote; the original source field location
`characters[i].description` is retained for verification.

`matchedCharacterRows` describes the full candidate count before
`limit`; `truncated` tells the caller if output was capped.
`descriptionsReported` counts source character rows with nonempty
description prose. `legacyDescriptionUnknownRows` counts character
rows from older normalized caches lacking this field.

**Crucial limitation:** A phrase can appear in a negated sentence.
For example, a source description reading “does not wear a lab coat”
contains the words “lab coat.” This tool reports a **lexical mention**,
never a positive coat-wearing trait. The output explicitly includes
`sourceMentionsAreNotVerifiedTraits: true` and each candidate has
`assertionStatus: "lexical_mentions_only"`. A missing phrase is not
evidence a character lacks that trait.

AniDB anime-wide tag/category labels are a different source layer.
They are **not** converted into character attributes. The tool does
not read image bytes or perform visual analysis.

## Verified implementation

- `src/domain/anime.ts`, `src/providers/anidb/mapper.ts`:
  source character descriptions and character-type ingestion
- `src/domain/selected-character-description.ts`:
  bounded read-only input and honest output schemas
- `src/services/selected-character-description-service.ts`:
  deterministic mention matching and evidence preservation
- `src/server.ts`: exposed read-only MCP tool
- `test/anidb-character-profiles.test.ts`,
  `test/selected-character-description.test.ts`,
  `test/mcp-selected-character-description.test.ts`: synthetic
  mapping, ranking, negation-boundary, cached provider reuse and
  stop-on-ban regression tests
- `test/deployment-mcp.test.ts`: real loopback MCP client
  verifies tool listing and read-only annotations

[Source-profile CI](https://github.com/Mark-Picknell/WeebMoeNexus/actions/runs/38438688418)
and [fully exposed tool CI](https://github.com/Mark-Picknell/WeebMoeNexus/actions/runs/38439239653)
passed, the latter **301/301 offline tests** plus TypeScript and
production-container checks.

These are **synthetic fixtures**, not a verified live match of *Akudama
Drive* Doctor/Isha or a real AniDB character-description content
inventory. The exact pink-hair/scalpel golden query GQ-001 and full
appearance search remain open.

**Roadmap:** P6-01 remains **unchecked** pending verified appearance
attributes, appropriate candidate retrieval/ranking, and non-hardcoded
live/golden-query acceptance. P6-09 also remains open. The total
owner-assigned task count remains **56/87**.
