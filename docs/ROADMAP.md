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
- [x] Register public AniDB software project (WeebMoeNexus, software ID `22277`)

## Phase 1 — Useful AniDB read path

- [x] Add an AniDB HTTP API client beneath software project `22277` (client ID `32071`)
- [x] Record official client name `weebmoenexus`, version `1`
- [x] Verify one real anime read via `AnimeService.getByAniDbId(15437)` with [live GitHub Actions evidence](https://github.com/Mark-Picknell/WeebMoeNexus/actions/runs/37867136270)
- [ ] Expand fixture coverage for missing/odd AniDB fields
- [x] Add offline client-identity, cache, and ban-response regression tests
- [ ] Add structured error codes for not-found, banned, unavailable, outdated, and misconfigured states
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
- [x] Preserve AniDB's raw character episode-appearance field (when present; without guessing parsing syntax)
- [ ] Normalize episode-appearance references and cross-check available source coverage
- [ ] Verify which episode-level character links MAL exposes via its current supported API
- [ ] richer creator/seiyuu normalization
- [ ] relation graph traversal with explicit depth/limit controls
- [ ] optional graph-oriented UI

### Episode appearance data is sparse

A character's episode-appearance field may be missing or incomplete. Treat missing/empty source metadata as **unknown**, never as proof that the character is absent. Where verified positive appearances exist, use them as an optional ranking signal, not a hard filter. User-confirmed, timestamped identifications may provide further evidence, but remain distinct from provider-authored data and should not silently rewrite canonical metadata. Test this with sparse or partially annotated shows before relying on episode-scoped suggestions.

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
- [ ] Episode-aware candidate ranking for pause-frame recognition; missing episode metadata must never exclude a character
- [ ] User-confirmed identification/correction and optional permitted reference-image uploads; retain evidence, provenance, consent/licensing and review status
- [ ] Feedback quality controls so a single mistaken submission does not silently alter canonical character identities
- [ ] trope/theme search
- [ ] “what was that scene/character/anime?” memory reconstruction
- [ ] relationship-path queries across characters, creators, studios, and works
- [ ] visual reference workflows where source/licensing permits

The project name may be WeebMoeNexus. The data model should still be able to survive code review.
