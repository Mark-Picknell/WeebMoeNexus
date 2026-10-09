# WeebMoeNexus

> _Because apparently “find the hot pink-haired doctor with a scalpel” is a legitimate database query. 😂💋🔪_

**WeebMoeNexus** is an anime knowledge plugin for ChatGPT and Codex. The first provider is **AniDB**; the architecture is intentionally provider-independent so future integrations can add MyAnimeList, AniList, streaming providers, personal watch state, and whatever strange relational perversion happens next.

## Status

Early scaffold with a verified live AniDB HTTP read path. The first vertical slice is:

```text
ChatGPT / Codex
      ↓ MCP
WeebMoeNexus
      ↓ normalized domain model
AniDB provider
      ↓
AniDB HTTP API
```

The read-only MCP surface remains deliberately small:

- `health` — confirms the server is alive and whether AniDB client registration is configured.
- `get_anime_by_anidb_id` — fetches one anime by AniDB ID, normalizes the XML, caches it, and returns structured content with provenance.
- `search_anime` — searches the **previously downloaded local AniDB title index** for exact/normalized aliases and, when none match, conservative Latin/romaji typo candidates. Returns distinct AniDB IDs, original title/language/kind, match type, source URL and the measured edit distance for fuzzy matches. It does **not** search character names or make network calls.
- `get_related_anime` — reads one anime’s **directed, source-reported** AniDB related-anime links, including provider relation type, optional target title, AniDB IDs, source evidence URL and retrieval time. It reuses the existing paced/cached anime service and does not guess reverse edges, fetch linked targets, or traverse an inferred franchise graph.
- `find_character` — searches character names **within one explicitly specified AniDB anime**; exact/normalized names outrank prefix/substring matches. Returns distinct character IDs, source-work evidence, original names, roles, gender, raw episode appearance text and source-reported voice-actor credits. It does **not** globally search AniDB characters, infer species, or merge identically named characters across works.
- `get_character` — resolves a selected AniDB character ID **in its specified source anime**, returning that exact record's source metadata, voice credits and evidence; unknown IDs are represented as **not reported in this anime**, not as globally nonexistent. It does not call a standalone character API.

## Why this shape?

The Nexus should own **identity, normalization, provenance, caching, and tool semantics**. Providers should own only the weirdness of their upstream service.

That means a future request like:

> “Find the hot pink-haired doctor with a scalpel.”

can eventually flow through title/character search, relation traversal, provider federation, and personal-list context without making ChatGPT understand five incompatible provider schemas.

See [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md).

## Local development

Requires Node.js 20+.

```bash
npm install
cp .env.example .env
npm run dev
```

The MCP endpoint is:

```text
http://127.0.0.1:3000/mcp
```

Test with MCP Inspector:

```bash
npx @modelcontextprotocol/inspector@latest
```

## AniDB registration and setup

The public AniDB software project is registered as:

- **Name:** WeebMoeNexus
- **AniDB software ID:** `22277`
- **Type:** Website Integration
- **Target OS:** Cross-platform
- **Language:** TypeScript / Node.js
- **State:** in development
- **Project URL:** https://github.com/Mark-Picknell/WeebMoeNexus
- **Contact:** https://github.com/Mark-Picknell/WeebMoeNexus/issues

The AniDB **HTTP API client is registered**, active, and official:

- **Client name:** `weebmoenexus`
- **Client ID:** `32071`
- **Registered version:** `1` (version ID `29661`)

Configure your local `.env`:

```env
ANIDB_CLIENT=weebmoenexus
ANIDB_CLIENT_VERSION=1
```

### First live API smoke test — passed

On 2026-10-08 (US Central), the registered client made **one live HTTP API request** for AniDB anime ID `15437` (*Akudama Drive*) from GitHub Actions. The API returned XML that WeebMoeNexus parsed and validated as an `AnimeRecord`. The result contained 7 titles, 13 characters, 12 episodes, and provider provenance. These counts are a snapshot, not permanent assertions about the upstream catalog.

[View the successful smoke-test run](https://github.com/Mark-Picknell/WeebMoeNexus/actions/runs/37867136270).

The live check runs through `src/smoke/anidb-smoke.ts` and a separate GitHub workflow. Ordinary `npm test` / CI regression tests use mocks; they never call AniDB. Avoid rerunning live smoke checks unnecessarily.

WeebMoeNexus intentionally does **not** scrape AniDB pages. Requests go through the documented API, are paced conservatively, and are cached. Tests must never contact the live AniDB API.

The default HTTP spacing is 2.5 seconds. Do not lower it below 2 seconds.

## Official AniDB title dump cache

AniDB publishes an **official public title list** at `https://anidb.net/api/anime-titles.xml.gz` (see [AniDB dump XML specification](https://wiki.anidb.net/User:Eloyard/anititles_dump)). We never scrape title search pages.

A manual cache refresh is available:

```bash
npm run titles:refresh
```

It downloads over HTTPS into `.cache/anidb/anime-titles.xml.gz`, validates bounded gzip/XML structure, and writes atomically. The local cached file is reused for at least **48 hours** by default; the code will not accept a refresh interval shorter than **36 hours**. Set `ANIDB_TITLE_DUMP_CACHE_PATH` to choose a persistent writable cache location for deployment. On refresh failures the last valid copy survives, reported as **stale** (the manual command exits unsuccessfully to signal an operational warning). Ordinary CI uses synthetic, local fixtures, and **never downloads the real AniDB dump**.

**Status:** All six Phase 2 title-search implementation tasks (P2-01–P2-06) are coded and **offline CI validated**. `search_anime` first finds exact/normalized source-supplied aliases (Japanese/English/romaji) without invented translations. Only when no deterministic title matches, a bounded Unicode-codepoint edit-distance fallback handles **Latin and romanized** title typos, including adjacent-letter swaps. Fuzzy hits are explicitly labeled `fuzzy` with `editDistance`; original title, language, kind and AniDB URL remain intact. Duplicate aliases are collapsed **per AniDB ID**, never across different anime. Very short titles and Japanese/mixed-script names are not fuzzily guessed. **Phase 2 was accepted by Mark on 2026-10-09** after passing offline CI; this approval covers the local title-search implementation. Character/person searches, a live title-dump integration check, automatic background refresh, hosting and ChatGPT plugin installation are not claimed. The local title cache must first be populated with `npm run titles:refresh`; the MCP `search_anime` call itself never invokes AniDB over the network.

### Local MCP search example

After `npm run titles:refresh`, call the read-only MCP tool:

```json
{"name":"search_anime","arguments":{"query":"Macross","limit":10}}
```

Results contain the **total number of distinct anime IDs**, even when `limit` truncates the returned list. Exact/normalized matches take priority; only when none exist does conservative Latin/romaji typo matching run. Fuzzy results are labeled and include an integer `editDistance`, so a suggested title is never represented as an authoritative identity join. Missing titles remain **unknown in the current local index**, not proof of absence. The tool is available in the locally running MCP server, not yet deployed as a hosted ChatGPT connector.

### Direct anime relation lookup (Phase 3, P3-01)

Read-only MCP example:

```json
{"name":"get_related_anime","arguments":{"anidbId":501}}
```

Unlike the offline title index, this tool needs the registered AniDB HTTP client to fetch the **source anime record** when it is not already cached (the existing pacing and in-memory 72-hour cache apply). It reports only direct `<relatedanime>` entries actually present in that one source response, with the original relationship labels, nullable titles, source anime/target anime IDs, a navigation URL for each target, and a separate **evidence URL/timestamp for the source assertion**. No target anime is fetched or validated solely because its ID appears as a relation. Missing links mean *nothing was reported in the response*, not proof there are no related works.

**Evidence:** [Offline relation projection tests](test/related-anime.test.ts) and [real MCP client/transport integration with mocked AniDB](test/mcp-related-anime.test.ts) passed [CI](https://github.com/Mark-Picknell/WeebMoeNexus/actions/runs/37978819355). Cross-anime/global character search, cross-media historical equivalence, franchise traversal, hosted deployment, and co-watching are **not yet implemented**.

### Scoped character name lookup (Phase 3, P3-02)

Use `search_anime` to find and choose an anime ID, then call:

```json
{"name":"find_character","arguments":{"anidbId":1725,"query":"Carrera","limit":10}}
```

This is a **scoped read** of character records contained in the selected source anime, using the existing registered/paced AniDB HTTP client and cached anime data. Matching is conservative: literal exact, normalized Unicode/case, then prefix, then substring. Each distinct character ID is retained; multiple source characters with the same name are **not** merged. The output retains optional original role/gender, raw appearance string and voice-actor credit, plus per-result **source-work provenance**. Absence in one source anime record is not proof a character doesn't exist anywhere. Species, alternate-universe identities and equivalence between portrayals are not inferred.

[Offline unit regression tests](test/character-search.test.ts) and [in-memory MCP client integration](test/mcp-find-character.test.ts) passed [CI](https://github.com/Mark-Picknell/WeebMoeNexus/actions/runs/37979555787). The Carrera/Viper GTS sample is **synthetic test data**, not a claim that live AniDB returned those exact character IDs or credits.

### Character-by-ID lookup (Phase 3, P3-03)

After `find_character` identifies a candidate within a known anime, call:

```json
{"name":"get_character","arguments":{"anidbId":1725,"characterId":501}}
```

The ID is looked up in **that specific anime's source-reported character list**, using the existing paced/cached AniDB anime read. This is **not a global AniDB character endpoint** and does not assert that two independent anime containing the same character name describe the same fictional individual. The result includes a `found` boolean, nullable `character`, source anime URL, retrieval timestamp, reported character count, and original voice-actor/episode metadata when available. Both character tools now also expose bounded `episodeEvidence`: parsed reference keys, matching AniDB episode IDs from the **same source anime**, unresolved references, unsupported syntax, and explicit parse/coverage status while retaining `episodeAppearancesRaw`. `found:false` means **not reported in this source response**, not an assertion of worldwide absence.

[Character-by-ID unit tests](test/character-detail.test.ts) and [real offline MCP integration](test/mcp-find-character.test.ts) passed [CI](https://github.com/Mark-Picknell/WeebMoeNexus/actions/runs/37979815355).

### Character episode appearances (Phase 3, P3-05)

AniDB's per-character `<episodes>` metadata is retained verbatim. `episodeEvidence` conservatively parses a **supported subset** of the episode-list notation: individual positive episode numbers, leading-zero variants, episode type prefixes (`S`, `C`, `T`, `P`, `O`), comma-separated tokens and finite same-type ranges such as `1-3` or `S1-S3`. The parser **does not silently interpret unknown or ambiguous syntax**, open-ended ranges, mixed-type ranges or multipart episodes. It caps expansion at 256 references, and labels `partial` or `unknown` rather than manufacturing definitive appearances.

`linkedEpisodeIds` are IDs of episode metadata entries present **in the same AniDB anime response** that match parsed source character references. This confirms a source-data join, **not** visual proof that the character appears in a specific video scene. `unresolvedReferences` means those referenced episodes were not listed by that anime payload; it does *not* prove the character is absent. If the source episode catalog is missing, `coverage` stays `unknown`. Raw input, unparsed tokens and source counts remain visible. Episode lists are never used as mandatory filters.

The limited parser is informed by [AniDB's episode numbering documentation](https://wiki.anidb.net/AniDB_O%27Matic_-_Documentation%3A_Local_file_renaming) and [the independently maintained go-anidb episode-list examples](https://pkg.go.dev/github.com/jessidhia/go-anidb/misc). These references are **not** proof every live AniDB character-field grammar has been verified. [Synthetic offline regression tests](test/episode-appearance.test.ts) and [actual MCP client tests](test/mcp-find-character.test.ts) passed [CI](https://github.com/Mark-Picknell/WeebMoeNexus/actions/runs/37981588599); real-source corpus validation and full grammar support remain future tasks.

### MAL/Jikan episode-character research (Phase 3, P3-06)

[Read the documented source-capability audit](docs/research/mal-episode-character-capabilities.md).

As of 2026-10-09, **no documented, supported per-episode character appearance link was verified** in the inspected official MAL v2 references or Jikan v4 endpoints. Jikan (a separate third-party MAL-based API) documents anime-level character/voice credits and episode metadata in different endpoints; joining those lists is **not** evidence that every character appears in every episode. The official MAL reference page was inaccessible to direct inspection in this research session, so this is a carefully qualified review, not a universal impossibility claim. Missing or unsupported fields must remain **unknown**, not interpreted as negative appearance data.

No MAL or Jikan credentials, live probes, adapter installation, or provider authorization were requested or performed. The optional second-provider decision remains assigned to Mark (`P4-06`).

## Plugin packaging

This repository includes a portable `plugin.json` identity manifest. A root `mcp.json` will be added when we have a stable deployed HTTPS `/mcp` endpoint instead of checking in a fake deployment URL.

Current OpenAI plugin guidance uses MCP servers as the tool/data layer. The server is built against the current MCP TypeScript v2 packages.

## Principles

1. **Normalized core, weird providers.**
2. **Provenance survives normalization.**
3. **No scraping when a sanctioned API/dump exists.**
4. **Cache aggressively; AniDB is not our personal query engine.**
5. **Tests use fixtures/fakes, never the live service.**
6. **Tool names stay boring even when the project name does not.**
7. **Adult/restricted metadata is data, not a reason to corrupt the domain model.**
8. **Future integrations add adapters; they do not rewrite the Nexus.**

## Roadmap

See [docs/ROADMAP.md](docs/ROADMAP.md).

Phase 2 local title search is approved and complete. Next: read-only source-grounded anime relationships, character and voice-credit discovery, and eventually cross-provider identity resolution. Co-watching an episode is a separate long-term system goal, not an existing capability.

---

Built by Mark + JayMe while going delightfully off-script.
