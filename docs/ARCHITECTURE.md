# Architecture

## The rule

**Normalize meaning, not history.**

WeebMoeNexus converts provider-specific records into one useful model while retaining enough provenance to answer: _where did this fact come from?_

## Layers

```text
┌───────────────────────────────────────────┐
│ ChatGPT / Codex / other MCP clients      │
└──────────────────────┬────────────────────┘
                       │ MCP tools
┌──────────────────────▼────────────────────┐
│ Tool layer                                │
│ - stable user-goal operations             │
│ - schemas + annotations                   │
└──────────────────────┬────────────────────┘
                       │
┌──────────────────────▼────────────────────┐
│ Service / Nexus layer                     │
│ - caching                                 │
│ - identity resolution                     │
│ - provider orchestration                  │
│ - conflict/provenance policy              │
└──────────────────────┬────────────────────┘
                       │ normalized records
┌──────────────────────▼────────────────────┐
│ Provider adapters                         │
│ AniDB | MAL | AniList | Crunchyroll | …  │
└──────────────────────┬────────────────────┘
                       │ upstream protocol
┌──────────────────────▼────────────────────┐
│ External services                         │
└───────────────────────────────────────────┘
```

## Current normalized model

The first `AnimeRecord` intentionally captures only durable concepts:

- canonical provider ID
- alternate/localized titles
- preferred title
- medium/type
- episode count and dates
- restricted/adult metadata flag
- description and artwork reference
- relations
- characters and voice actors
- episodes
- provenance

It should grow when a real provider or use case demands it, not because we can imagine every possible field.

## Provider boundary

A provider adapter may be ugly. That is its job.

For AniDB the adapter owns:

- client identification parameters
- HTTP pacing
- XML parsing
- AniDB-specific title/language attributes
- AniDB relation/character/episode quirks
- upstream error interpretation

The rest of the application should not need to know any of those details.

## Provenance

Every normalized record carries source provenance. As federation grows, provenance should become field-level when sources can disagree.

Future shape:

```text
value
├── normalized value
└── evidence[]
    ├── provider
    ├── provider id
    ├── source URL
    ├── retrieved-at
    └── confidence / transform notes
```

Do not collapse disagreements merely to make output look tidy.

## Identity resolution

AniDB IDs are not universal anime IDs. The Nexus should eventually maintain an identity graph:

```text
CanonicalAnime
├── anidb: 123
├── mal: 456
├── anilist: 789
└── provider-specific relations
```

Mappings are evidence, not magic. A cross-provider match must retain how it was established.

## Caching

AniDB is strict about automated access. The service therefore caches whole anime records and serializes live HTTP calls through a rate gate.

When we add the sanctioned AniDB title dump, title search should be local-first:

```text
human title → local title index → AniDB ID → cached/full AniDB record
```

That both improves latency and avoids abusive API traffic.

## MCP boundary

The MCP layer should expose user goals, not provider mechanics.

Good:

- `search_anime`
- `get_anime`
- `find_character`
- `get_related_anime`

Less good:

- `send_anidb_http_request`
- `parse_xml`

Provider-specific IDs can still be accepted when useful, as in the initial `get_anime_by_anidb_id` bootstrap tool.

## UI

No UI until structured tools are useful headlessly. Later, relationship graphs, season comparisons, and list browsing may deserve MCP Apps UI.

## Security

- No secrets in tool metadata/results.
- Validate all tool inputs.
- Read-only metadata tools remain read-only.
- Private list integrations will require real per-user authentication/authorization.
- Production deployment must add host/origin/auth controls appropriate to the deployed environment.
