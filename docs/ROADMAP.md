# WeebMoeNexus — Roadmap and Owner-Assigned Task Register

> **Canonical owner-assigned task register · Rebased 2026-10-09**  
> This is a planning baseline, **not a Git history rebase**. Owner assignments were **approved by Mark on 2026-10-09** and remain **changeable at Mark's discretion**. A task is marked complete only when its deliverable is in the repository or an external action has verifiable evidence. The original phase numbers and work items are retained.

## How to read this tracker

- `- [x]` = done/verified; `- [ ]` = not yet verified. A phase heading gains **✅** only when **all required tasks** in that phase are finished. The checked Markdown checkbox is the task status; the emoji in a heading is the phase status. **Do not use ✅ merely because the phase has started.**
- **Owner = person accountable for executing and reporting the task.** **JayMe:** analysis, code, tests, documentation, PRs/commits where the connector permits. **Mark:** provider/account registration and consent, access/credentials, budgets/hosting decisions, product prioritization and final acceptance. Owner does **not** imply the other person cannot help.
- External services/accounts and user-owned changes **always require Mark's explicit authorization**. JayMe must not claim that an integration, login or deployment is complete unless actually verified.
- **Evidence ≠ implementation.** GQ-001–GQ-017 in [GOLDEN-QUERIES.md](GOLDEN-QUERIES.md) are documented research/acceptance **cases**, not 17 passing executable test suites and not working character search.
- The roadmap **Phase 5** means personal context (watchlists etc.). In [GQ-001's milestone progression](GOLDEN-QUERIES.md) **Step 5** means character **attribute search**. These numberings are independent.
- **Critical path:** quality/data fixtures → local AniDB title index → `search_anime` → character/person/relationship search → cross-provider graph. Documentation/discovery can occur in parallel; do not promote a phase to ✅ while its runtime work remains unchecked.

**Current register after conservative fuzzy title matching · 2026-10-09:** **35/87 completed** and **52 outstanding**. Phase 1 remains **5/7**; Phase 2 implementation is **6/6**, all with passing offline CI, **awaiting Mark's explicit phase exit acceptance** before the Phase 2 heading changes to ✅. Phase 0 remains the only phase with a ✅ heading. No live AniDB title-dump fetch or deployed ChatGPT integration is claimed. The snapshot phase table below is the **original pre-slice phase-only baseline** retained for auditability.

**Decision log · 2026-10-09:** Mark approved the proposed ownership split and next implementation slice (`R-03`, `R-04`), while reserving the right to alter task assignments later. This does **not** authorize future hosting, account connections, data writes, deployment, or final release—those remain separate open tasks. Immediately after this approval, before implementation work, the register had **25/87 tasks completed** and **62 outstanding**. The phase table below is the **original phase-only baseline**, with additional validation/delivery/rebase tasks tracked separately.

## Current verified baseline (2026-10-09)

| Phase | Existing completed / existing tasks | State |
|---|---:|---|
| 0 — Skeleton | 10 / 10 | ✅ Completed |
| 1 — AniDB read | 4 / 7 | In progress |
| 2 — Title search | 0 / 6 | Not implemented |
| 3 — Relationships | 1 / 9 | Model preservation only |
| 4 — Cross-provider | 0 / 5 | Not implemented |
| 5 — Personal context | 0 / 5 | Not implemented |
| 6 — Complex discovery | 0 / 8 | Acceptance cases only |

**Verification anchors:** `src/server.ts` currently registers only `health` and `get_anime_by_anidb_id`. Offline suites in `test/anidb-client.test.ts` and `test/anidb-mapper.test.ts` supply **five** test cases. [Successful real AniDB smoke test](https://github.com/Mark-Picknell/WeebMoeNexus/actions/runs/37867136270) covered anime **15437**, not all golden queries. This baseline is an audit of the existing roadmap checkmarks, **before** adding the new tracked work below.


## Phase 0 — Skeleton ✅

- [x] `P0-01` **JayMe** — Portable plugin manifest
- [x] `P0-02` **JayMe** — MCP TypeScript v2 server
- [x] `P0-03` **JayMe** — Provider/service/domain separation
- [x] `P0-04` **JayMe** — AniDB HTTP client boundary
- [x] `P0-05` **JayMe** — Conservative request pacing
- [x] `P0-06` **JayMe** — In-memory cache
- [x] `P0-07` **JayMe** — XML → normalized anime mapping
- [x] `P0-08` **JayMe** — Fixture-based mapper test
- [x] `P0-09` **JayMe** — Architecture and agent guidance
- [x] `P0-10` **Mark** — Register public AniDB software project (WeebMoeNexus, software ID `22277`)

## Phase 1 — Useful AniDB read path

- [x] `P1-01` **Mark** — Add an AniDB HTTP API client beneath software project `22277` (client ID `32071`)
- [x] `P1-02` **JayMe** — Record official client name `weebmoenexus`, version `1`
- [x] `P1-03` **JayMe** — Verify one real anime read via `AnimeService.getByAniDbId(15437)` with [live GitHub Actions evidence](https://github.com/Mark-Picknell/WeebMoeNexus/actions/runs/37867136270)
- [x] `P1-04` **JayMe** — Expand fixture coverage for missing/odd AniDB fields
- [x] `P1-05` **JayMe** — Add offline client-identity, cache, and ban-response regression tests
- [ ] `P1-06` **JayMe** — Add structured error codes for not-found, banned, unavailable, outdated, and misconfigured states
- [ ] `P1-07` **JayMe** — Persist cache across restarts

## Phase 2 — Human title search

Use AniDB's sanctioned anime-title dump instead of scraping/searching pages.

- [x] `P2-01` **JayMe** — Implement official HTTPS title-dump download + atomic disk cache with a 48-hour default refresh (36-hour minimum), bounded gzip validation, and offline regression tests. [Verified in CI](https://github.com/Mark-Picknell/WeebMoeNexus/actions/runs/37967245252); live upstream fetch intentionally not run as part of CI.
- [x] `P2-02` **JayMe** — Parse the cached AniDB XML into a local index keyed by AniDB ID and exact title, preserving language, alias type and same-name collisions. [Offline CI passed](https://github.com/Mark-Picknell/WeebMoeNexus/actions/runs/37967851520).
- [x] `P2-03` **JayMe** — Normalize case, punctuation, full-width Unicode and source-supplied Japanese/English/romaji aliases; support conservative macron keys while preserving original spellings and same-name collisions. [Offline tests passed](https://github.com/Mark-Picknell/WeebMoeNexus/actions/runs/37971913555).
- [x] `P2-04` **JayMe** — Implement read-only MCP `search_anime(query, limit)` against the local cached AniDB title index, with bounded inputs, deterministic results, and actionable missing-cache errors. [MCP client integration CI passed](https://github.com/Mark-Picknell/WeebMoeNexus/actions/runs/37976829986).
- [x] `P2-05` **JayMe** — Return original matched title, language, title kind, exact/normalized classification, AniDB source URL, and total distinct candidates, retaining same-name anime as separate results. [Validated by offline MCP and service tests](https://github.com/Mark-Picknell/WeebMoeNexus/actions/runs/37976829986).
- [x] `P2-06` **JayMe** — Add conservative Latin/romaji typo fallback using bounded Unicode edit distance (including adjacent swaps), only when exact/normalized aliases return nothing; preserve collisions and label measured distance. [Offline regression and real MCP integration CI passed](https://github.com/Mark-Picknell/WeebMoeNexus/actions/runs/37977981690).

This is the milestone that makes:

> “find the hot pink-haired doctor with a scalpel”

a plausible database workflow instead of a joke.

## Phase 3 — Relationship exploration

- [ ] `P3-01` **JayMe** — `get_related_anime`
- [ ] `P3-02` **JayMe** — `find_character`
- [ ] `P3-03` **JayMe** — `get_character`
- [x] `P3-04` **JayMe** — Preserve AniDB's raw character episode-appearance field (when present; without guessing parsing syntax)
- [ ] `P3-05` **JayMe** — Normalize episode-appearance references and cross-check available source coverage
- [ ] `P3-06` **JayMe** — Verify which episode-level character links MAL exposes via its current supported API
- [ ] `P3-07` **JayMe** — richer creator/seiyuu normalization
- [ ] `P3-08` **JayMe** — relation graph traversal with explicit depth/limit controls
- [ ] `P3-09` **JayMe** — optional graph-oriented UI

### Relationship acceptance and evidence tasks

- [ ] `P3-10` **JayMe** — Implement person and character disambiguation that respects work/title/species/alias constraints (regression: `Viper GTS / Carrera / succubus`, not Tensura Carrera).
- [ ] `P3-11` **JayMe** — Define typed edges for voice credits, multiple portrayals, adaptation, inherited names, cameos and crossovers, each with source references.
- [ ] `P3-12` **Mark** — Review/accept how ambiguous candidates and evidence are presented before any UI decisions are locked in.

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

- [ ] `P4-01` **JayMe** — canonical cross-provider identity graph
- [ ] `P4-02` **JayMe** — field-level provenance
- [ ] `P4-03` **JayMe** — conflict representation
- [ ] `P4-04` **JayMe** — provider health/capability registry
- [ ] `P4-05` **JayMe** — source preference policy without erasing dissenting data

### Source/provider work and approvals

- [ ] `P4-06` **Mark** — Select and authorize which second/third metadata provider(s) to integrate first; define any required access limits/terms.
- [ ] `P4-07` **JayMe** — Implement approved MAL adapter and its offline contract tests; preserve independent MAL identifiers.
- [ ] `P4-08` **JayMe** — Implement approved AniList adapter and offline contract tests; preserve independent AniList identifiers.
- [ ] `P4-09` **JayMe** — Add graph regression fixtures for contradictory provider fields, false name collisions and cross-media links.
- [ ] `P4-10` **Mark** — Accept provider conflict priorities and document which disagreements remain visible, not silently overwritten.

## Phase 5 — Personal anime context

Only after authentication is designed properly:

- [ ] `P5-01` **JayMe** — watch lists
- [ ] `P5-02` **JayMe** — ratings
- [ ] `P5-03` **JayMe** — status/progress
- [ ] `P5-04` **JayMe** — recommendations grounded in actual list history
- [ ] `P5-05` **JayMe** — explicit write tools with confirmation and clear provider ownership

### Authentication and permissions are prerequisites

- [ ] `P5-06` **Mark** — Choose/authorize accounts and decide what personal data may be accessed or written.
- [ ] `P5-07` **JayMe** — Implement per-user authentication/authorization, narrow scopes, secure secret handling and token lifecycle.
- [ ] `P5-08` **Mark** — Review consent UX and approve explicit write-action confirmations before personal integration is enabled.

## Phase 6 — Deliciously weird queries

Once the boring substrate is trustworthy:

- [ ] `P6-01` **JayMe** — character appearance/aesthetic search
- [ ] `P6-02` **JayMe** — Episode-aware candidate ranking for pause-frame recognition; missing episode metadata must never exclude a character
- [ ] `P6-03` **JayMe** — User-confirmed identification/correction and optional permitted reference-image uploads; retain evidence, provenance, consent/licensing and review status
- [ ] `P6-04` **JayMe** — Feedback quality controls so a single mistaken submission does not silently alter canonical character identities
- [ ] `P6-05` **JayMe** — trope/theme search
- [ ] `P6-06` **JayMe** — “what was that scene/character/anime?” memory reconstruction
- [ ] `P6-07` **JayMe** — relationship-path queries across characters, creators, studios, and works
- [ ] `P6-08` **JayMe** — visual reference workflows where source/licensing permits

### End-to-end acceptance

- [ ] `P6-09` **JayMe** — Pass GQ-001 semantic-attribute and rank/explanation test without hard-coded character IDs.
- [ ] `P6-10` **JayMe** — Pass GQ-011–017 name collision, historical portrayal, mascot reuse, creator/crossover, literary identity and Carrera/Viper GTS disambiguation cases.
- [ ] `P6-11` **Mark** — Review live, human-facing results against his originally intended examples; approve or correct expected behavior.

### Completed first implementation slice (2026-10-09)

- **P1-04 / V-07:** added eight synthetic offline mapper edge-case tests in [test/anidb-edge-cases.test.ts](../test/anidb-edge-cases.test.ts); the new suite covers absent data, Japanese/English alias titles, adult/restricted metadata, irregular episode annotations, absent character episode appearances, related-work links, invalid IDs and AniDB error payloads. See [passed CI](https://github.com/Mark-Picknell/WeebMoeNexus/actions/runs/37934962890).
- **V-05:** versioned, human-curated [GQ-001–GQ-017 fixture corpus](../test/fixtures/golden-query-cases.json) and [offline matrix validation tests](../test/golden-query-matrix.test.ts) track expected entities, capabilities, required findings, disallowed inference, unverified relationship boundaries and source-document sections. No third-party media payloads are included. See [passed CI](https://github.com/Mark-Picknell/WeebMoeNexus/actions/runs/37935165084).
- **R-05:** actual regression-test files were committed, checked by CI and reviewed for coverage; later work was the title dump/index **P2-01–P2-02** (since completed); next is normalization, matching and production `search_anime`.
- **Important scope:** fixture-integrity tests prove corpus consistency, **not** that the unresolved natural-language search results pass. All cases explicitly remain `pending_resolver`. **V-06, P2, P3, P4, P6** are still open until matching production capabilities are implemented and exercised.

### Completed title-cache slice (2026-10-09)

- **P2-01:** Added [src/providers/anidb/title-dump.ts](../src/providers/anidb/title-dump.ts) plus an **opt-in** `npm run titles:refresh` CLI. Official `https://anidb.net/api/anime-titles.xml.gz` is downloaded to an ignored local gzip cache, validated before atomic replacement, and reused for at least 36 hours (48-hour default). A verified stale copy survives temporary upstream download failures; failed scheduled/manual refreshes produce a nonzero exit status if stale.
- **Offline evidence:** Seven local fetch-mock tests in [test/anidb-title-dump.test.ts](../test/anidb-title-dump.test.ts) pass in [CI](https://github.com/Mark-Picknell/WeebMoeNexus/actions/runs/37967245252): first download, persisted reuse, stale fallback, invalid content protection, corrupt-first-download rejection, concurrent-request coalescing, and minimum refresh cadence. **CI deliberately does not make an upstream network call**; a live AniDB dump download has not been claimed.
- **Since completed:** `P2-02` parses the cached XML into an in-memory title index. **Still open:** `P2-03` normalization, `P2-04` MCP `search_anime`, match evidence and fuzzy matching. A local index alone is not a user-facing search tool.

### Completed exact-title index slice (2026-10-09)

- **P2-02:** Added [src/providers/anidb/title-index.ts](../src/providers/anidb/title-index.ts) for official AniDB `animetitles` XML: `aid`, `title`, `xml:lang` and `type` are preserved as structured data. The in-memory index supports source-ID lookup and **exact-title collision lookup** without merging same-name anime; romanization/case/fuzzy matching deliberately deferred to `P2-03` and `P2-06`.
- **Offline evidence:** [test/anidb-title-index.test.ts](../test/anidb-title-index.test.ts) verifies title kinds, Japanese and English aliases, XML entities, identical names assigned to different anime IDs, malformed/missing data rejection, gzip cache loading and a 1,500-anime synthetic stress case. The manual `npm run titles:refresh` command also parses and reports counts; [CI passed](https://github.com/Mark-Picknell/WeebMoeNexus/actions/runs/37967851520).
- **Limits:** No live upstream title dump was downloaded during these CI tests. This is a local library, **not yet** an exposed `search_anime` MCP endpoint or evidence that user-facing golden queries pass.

### Completed title-normalization slice (2026-10-09)

- **P2-03:** Added [title-normalization.ts](../src/providers/anidb/title-normalization.ts) and `AniDbTitleIndex.findNormalizedTitle()`. Stable Unicode/case/punctuation/width normalization and conservative romaji macron keys match **source-provided** Japanese, English and romanized aliases while preserving AniDB ID, original title, source language and kind. Distinct anime with colliding normalized titles remain separate hits; no invented transliteration or implicit character identity.
- **Offline evidence:** [test/anidb-title-normalization.test.ts](../test/anidb-title-normalization.test.ts) checks Japanese voiced kana, fullwidth/halfwidth, romaji macrons, whitespace/punctuation folding, alternate anime with the same title, unchanged exact lookups, and preservation of multiple source aliases. [CI passed](https://github.com/Mark-Picknell/WeebMoeNexus/actions/runs/37971913555).
- **Since completed:** `P2-04` local MCP `search_anime` and `P2-05` explicit source alias/match evidence now pass an in-memory protocol integration test. **Still open:** `P2-06` fuzzy matching; no character name/attribute search or hosted connector is claimed.

### Completed local MCP title-search slice (2026-10-09)

- **P2-04:** Added [title-search-service.ts](../src/services/title-search-service.ts) and registered read-only `search_anime(query, limit)` in [server.ts](../src/server.ts). The tool loads the local AniDB gzip dump lazily, reuses its parsed index until the file changes, and provides bounded query/limit and clear local-cache-missing errors. This **does not** fetch or search AniDB over the network during MCP calls.
- **P2-05:** Result items preserve the original matching alias, language, title kind, exact/normalized match classification, stable AniDB ID, and source URL. Multiple aliases of the same anime are deduplicated; identically named *different* anime remain separate candidates. Total distinct count is available even when a limit hides some results.
- **Offline evidence:** [test/anidb-title-search.test.ts](../test/anidb-title-search.test.ts) covers duplicate aliases, independent same-name anime, source data, Japanese/English/romaji aliases, bounds, missing/corrupt cache, and hot reload. [test/mcp-search-anime.test.ts](../test/mcp-search-anime.test.ts) exercises **real MCP tool listing and invocation** through an in-memory client/server transport, including expected results and invalid input. [CI passed](https://github.com/Mark-Picknell/WeebMoeNexus/actions/runs/37976829986).
- **Limits:** A local title dump must be created via the opt-in `npm run titles:refresh`. Neither a live dump fetch in CI nor deployed ChatGPT connectivity is claimed. `P2-06` fuzzy lookup and **Phase 3 character/person resolution** remain open.

### Completed conservative typo matching slice (2026-10-09)

- **P2-06:** Added [src/providers/anidb/title-fuzzy.ts](../src/providers/anidb/title-fuzzy.ts) and `AniDbTitleIndex.findFuzzyTitle()` for bounded Optimal String Alignment (insertion, deletion, substitution, adjacent swap) on Unicode code points with short-query thresholds (no guessing below 4 symbols; one edit for 4–7; two for 8–14; three for 15+). To avoid accidental Japanese identity conflation, fuzzy fallback currently covers **Latin and romanized titles only**; Japanese/mixed-script aliases remain exact/normalized.
- **Safety and evidence:** The local `search_anime` MCP tool invokes fuzzy matching **only if exact/normalized matches yield zero results**. Fuzzy results are visibly labeled `matchType: "fuzzy"` with `editDistance` and retain source alias, language, kind, AniDB ID and URL; distinct anime sharing the same source title remain separate candidates. Length-bucket indexing limits candidate comparisons, with source-evidence-preserving deduplication and no external network calls.
- **Tests:** [test/anidb-title-fuzzy.test.ts](../test/anidb-title-fuzzy.test.ts) covers transpositions, insertion/deletion/substitution, edit thresholds, Macross identity collisions, Japanese-voicing guardrails, source metadata, short-name and unrelated-name rejection, and 1,500-row stress input. [test/mcp-search-anime.test.ts](../test/mcp-search-anime.test.ts) also checks fuzzy results through an in-memory MCP transport. The initial regression run exposed a Unicode regex escaping defect; it was corrected and the [full final CI passed](https://github.com/Mark-Picknell/WeebMoeNexus/actions/runs/37977981690).
- **Phase exit:** `P2-01–P2-06` are implementation-complete. The Phase 2 heading awaits Mark's acceptance under the documented protocol. This is not evidence of live AniDB title-dump ingestion, fuzzy-search precision in the actual full catalog, hosted MCP connectivity, or semantic character/person resolution.

## Validation track — fixtures, golden cases and release gates

This track runs **alongside** the phases. A completed golden-query **write-up** is not a passing automated golden-query **test**.

- [x] `V-01` **Mark** — Supply the original natural-language discoveries and correct the assistant's mistaken assumptions (Akudama doctor, Macross/Robotech, Plue, Yoshimitsu, Carrera/Viper GTS, etc.).
- [x] `V-02` **JayMe** — Document **GQ-001–GQ-017** in [GOLDEN-QUERIES.md](GOLDEN-QUERIES.md), including known answers, false joins, evidence and pending capabilities.
- [x] `V-03` **JayMe** — Implement original offline mapper/client regression suites; **five** current cases, mocked upstream.
- [x] `V-04` **JayMe** — Verify one registered, conservatively paced AniDB HTTP smoke request for *Akudama Drive* (a15437) and record [successful run](https://github.com/Mark-Picknell/WeebMoeNexus/actions/runs/37867136270).
- [x] `V-05` **JayMe** — Convert golden-query specifications into **versioned, licensed/provenanced offline fixtures** and executable expected-results matrices, including negative/unknown cases.
- [ ] `V-06` **JayMe** — Add deterministic unit/contract tests that explicitly detect known past assistant mistakes (Carrera homonyms, name-order, false credit/kinship, Macross→Robotech omission); tests remain **offline**.
- [x] `V-07` **JayMe** — Expand AniDB XML mapper cases for missing title/character/episode fields, adult/restricted metadata, malformed/unexpected data and exact source attribution.
- [ ] `V-08` **JayMe** — Add tests to CI as features land; distinguish **not implemented**, **test skipped**, **test failed**, and **test passed** in status reporting.
- [ ] `V-09` **Mark** — Review/accept the answer quality for the reference queries and supply targeted corrections when genuinely needed.

## Delivery track — deployment and ChatGPT/Codex use

These tasks were missing from the original phase list. **No externally reachable MCP endpoint or installed ChatGPT plugin is being claimed**. Do not invent a deployed URL or check in fictitious `mcp.json` settings.

- [x] `D-01` **JayMe** — Record portable `plugin.json` identity and local MCP development instructions.
- [x] `D-02` **JayMe** — Establish GitHub Actions offline CI and isolate the manual live AniDB smoke test.
- [ ] `D-03` **Mark** — Approve hosting provider, account permissions, operational budget and public/private access policy.
- [ ] `D-04` **JayMe** — Deploy secured HTTPS MCP endpoint with appropriate host/origin/auth validation and environment configuration.
- [ ] `D-05` **JayMe** — Create accurate MCP/plugin deployment manifest (`mcp.json` when supported) referencing a **verified** endpoint.
- [ ] `D-06` **Mark** — Explicitly connect/install the authorized integration in ChatGPT and, separately, Codex if desired.
- [ ] `D-07` **JayMe** — Verify ChatGPT/Codex connectivity and read-only calls from the actual client(s), with Mark's participation where required.
- [ ] `D-08` **JayMe** — Add production diagnostics, cache handling, rate-limit safeguards and deployment/runbook documentation.
- [ ] `D-09` **Mark** — Perform final user acceptance and authorize release.

## Rebase and handoff

- [x] `R-01` **JayMe** — Audit original roadmap against checked-in code, tests, README, golden cases, manifests and previous successful CI.
- [x] `R-02` **JayMe** — Add task IDs, owners, evidence conventions, known dependencies and missing validation/deployment work without rewriting Git history.
- [x] `R-03` **Mark** — Approve or revise owner assignments and priority order in this proposed baseline. **Approved 2026-10-09; future reassignment remains open.**
- [x] `R-04` **Mark** — Confirm the next slice: **approved** `V-05` fixture matrix + `P1-04` odd-field coverage, then `P2-01` official title dump and `P2-04` `search_anime`. **Accepted 2026-10-09.**
- [x] `R-05` **JayMe** — Begin approved next slice with offline regression tests and commit/code review; do **not** mistake planning for implementation.

**Phase completion protocol:** Mark reviews requirements and final behavior; JayMe supplies commits/tests and links to evidence; tasks are marked `[x]` only after verification. A phase gains ✅ only when its task list's required items are checked and Mark accepts its exit criteria. If a feature is deliberately deferred, move it to an explicit deferred/backlog section **before** calling the phase complete; never mark unbuilt functionality done.

The project name may be WeebMoeNexus. The data model should still be able to survive code review.
