# Roadmap

## Phase 0 — Skeleton ✅

- [x] Portable plugin manifest
- [x] MCP TypeScript v2 server
- [x] Provider/service/domain separation
- [x] AniDB HTTP client boundary
- [x] Conservative request pacing
- [x] In-memory cache
- [x] XML → normalized anime mapping
- [x] Fixture-based mapper test
- [x] Architecture and agent guidance

## Phase 1 — Useful AniDB read path

- [ ] Register the WeebMoeNexus AniDB client name/version
- [ ] Verify a real `get_anime_by_anidb_id` request manually
- [ ] Expand fixture coverage for missing/odd AniDB fields
- [ ] Add structured error codes for not-found, banned, unavailable, and misconfigured states
- [ ] Persist cache across restarts

## Phase 2 — Human title search

Use AniDB's sanctioned anime-title dump instead of scraping/searching pages.

- [ ] Download and cache the title dump on a respectful refresh cadence
- [ ] Parse titles into a local index
- [ ] Normalize case, punctuation, romaji, English/Japanese aliases
- [ ] Implement `search_anime(query, limit)`
- [ ] Return match evidence, not just a guessed ID
- [ ] Add fuzzy matching only after deterministic matching is solid

This is the milestone that makes:

> “find the hot pink-haired doctor with a scalpel”

a plausible database workflow instead of a joke.

## Phase 3 — Relationship exploration

- [ ] `get_related_anime`
- [ ] `find_character`
- [ ] `get_character`
- [ ] richer creator/seiyuu normalization
- [ ] relation graph traversal with explicit depth/limit controls
- [ ] optional graph-oriented UI

## Phase 4 — The Nexus becomes a nexus

Add adapters rather than redesigning the core.

Candidate providers:

- MyAnimeList
- AniList
- additional sanctioned metadata sources
- Crunchyroll/streaming availability when an appropriate supported integration path exists

Work items:

- [ ] canonical cross-provider identity graph
- [ ] field-level provenance
- [ ] conflict representation
- [ ] provider health/capability registry
- [ ] source preference policy without erasing dissenting data

## Phase 5 — Personal anime context

Only after authentication is designed properly:

- [ ] watch lists
- [ ] ratings
- [ ] status/progress
- [ ] recommendations grounded in actual list history
- [ ] explicit write tools with confirmation and clear provider ownership

## Phase 6 — Deliciously weird queries

Once the boring substrate is trustworthy:

- [ ] character appearance/aesthetic search
- [ ] trope/theme search
- [ ] “what was that scene/character/anime?” memory reconstruction
- [ ] relationship-path queries across characters, creators, studios, and works
- [ ] visual reference workflows where source/licensing permits

The project name may be WeebMoeNexus. The data model should still be able to survive code review.
