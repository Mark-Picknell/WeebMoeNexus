# Title-to-character lookup — guarded local title resolution

**Verified bounded slice · 2026-10-11 UTC.** The read-only MCP tool
`find_character_by_anime_title` combines the previously established local
AniDB title index with source-scoped character-name search. The user need not
manually identify a numeric work ID **only when** the local title index
provides exactly one **exact or normalized** matching anime.

## Workflow and evidence boundary

| Local index outcome | Result | AniDB source HTTP/cache read |
| --- | --- | --- |
| No title hit | `no_local_work_match`; none of the examined *local* aliases matched | **None** |
| Two or more distinct anime IDs | `ambiguous_work_requires_selection`; return bounded candidate work IDs | **None** |
| Exactly one fuzzy title match | `fuzzy_work_requires_selection`; return suggested work, not an identity | **None** |
| Exactly one exact or normalized title match | `unique_work_searched`; return source-scoped character-name rows, preserving their independent source IDs | **At most one selected anime** through the existing paced cache |

Matching a work title establishes a conservative **routing decision**, not
proof of a franchise-wide or global identity. The title dump and an anime
response are separate source snapshots; returned work and character evidence
retain their own URLs and source IDs. No media, appearance classifier,
species/character alias taxonomy, third-party provider, global index or
person-identity resolver is introduced.

`animeTitle` is 2–160 characters; `characterName` is 2–120;
`limit` defaults to 10 and is limited to 1–25 character rows.
Meaningless normalized queries reject before disk or provider reads.
The title lookup always requests at most 25 local candidates and checks the
**total** title match count before routing, so truncation cannot silently
pick the first of many matching work IDs. Work candidates keep match class,
source title, language/kind, provider ID and URL.

When the work is uniquely selected, this tool delegates to
`searchCharactersAcrossSelectedAnime` with **one** ID. That service
preserves source character row index, repeated IDs, source character URLs,
optional voice credit, raw names, source provenance and name match classes;
counts precede truncation. Provider errors fail closed and preserve the
existing structured error envelope. Missing or unseen rows are **unknown**
outside this examined source, never negative evidence.

## MCP call example

```json
{
  "name": "find_character_by_anime_title",
  "arguments": {
    "animeTitle": "Viper GTS",
    "characterName": "Carrera",
    "limit": 10
  }
}
```

**This is only a request shape**, not a claim about live character matches.
Unit and integration records are intentionally synthetic. In particular,
a source match to `Viper GTS` would not verify a requested species like
`succubus` without separately reported species evidence. Results returned
from a single source are not a complete franchise character index.

## Offline verification

- `test/titled-character-search.test.ts`: unique exact/normalized
  match, duplicate character rows, ambiguous homonymous anime, no local title
  match, simulated fuzzy-only candidate, fail-closed validation and malformed
  index evidence.
- `test/mcp-titled-character-search.test.ts`: actual in-memory MCP
  client/server; a synthetic on-disk gzip title index, mocked single source
  request and memory reuse. Shows that ambiguous or missing local title
  matches generate **no** AniDB lookups.
- `test/deployment-mcp.test.ts`: real HTTP loopback lists **13** read-only
  tools, including this one.
- [MCP increment CI: 261/261 passing tests, TypeScript and production
  container checks](https://github.com/Mark-Picknell/WeebMoeNexus/actions/runs/38108786414).

The dependency on an initialized local title dump and on authorized deployment
is unchanged. This is not an HTTPS deployment, real ChatGPT connection,
global character search, or directory publication. P3-10 stays unchecked;
the owner task register remains **54/87 complete and 33 outstanding**.
