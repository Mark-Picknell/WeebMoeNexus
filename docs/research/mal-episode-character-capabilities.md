# P3-06 — MyAnimeList episode/character coverage audit

**Research date:** 2026-10-09  
**Owner:** JayMe  
**Scope:** Publicly documented/supported access. No provider accounts were connected, no user credentials obtained, no MAL/Jikan API requests performed, and no adapter enabled by this research.

## Decision

**No supported, documented episode-to-character appearance edge was verified in the currently published MAL API v2 or the documented Jikan v4 routes inspected.**

This is an **absence of verified API capability**, not a claim that MAL has no such data internally, that third-party integrations can never obtain it, or that a character was absent from an episode. Our program must encode it as `unknown`, never `false` or an empty authoritative appearance list.

| Source and supported/documented route | Verified ability | Episode-specific character appearances |
|---|---|---|
| Official MyAnimeList API v2 (`https://api.myanimelist.net/v2`) | Anime search/details; anime work metadata including `num_episodes`; documented detail fields; OAuth/user lists | **Not verified / not documented in the inspected public API references**. No character-to-episode link should be inferred. |
| Jikan v4 (separate unofficial read-only MAL-based API), `GET /anime/{id}/characters` | Anime-wide character roles and voice credits | **Not in documented response shape**; no per-episode character list. |
| Jikan v4, `GET /anime/{id}/episodes` | Paginated episode IDs, titles, aired/filler/recap metadata | **Not in documented response shape**; not a character-appearance list. |
| Jikan v4, `GET /anime/{id}/episodes/{episode}` | Episode-specific metadata and synopsis | **Not in documented response shape**. Free-text synopsis is not a structured assertion that a character actually appears. |
| Jikan v4, `GET /characters/{id}/anime` and `/characters/{id}/voices` | Character's associated anime and voice actors | **Work-level associations, not episode memberships**. |
| Current WeebMoeNexus AniDB anime record | AniDB character `episodes` raw field; conservative parser and cross-check against episode entries from the **same AniDB anime** | **Positive, source-reported references where available**; missing/unsupported syntax remains unknown. |

## Evidence reviewed

1. Official API documentation location: https://myanimelist.net/apiconfig/references/api/v2 (direct browsing of this page did not yield its content in this research session). Do **not** claim a direct live official spec verification.
2. Independently audited *MAL MCP* project, which reports inspecting the official embedded OpenAPI schema in July 2026: https://github.com/UmutKDev/myanimelist-mcp/blob/main/NOTES.md — documents anime/search/detail fields; does not establish character episode appearances.
3. MyAnimeList API v2 implementation/wrapper listing official reference and anime `fields`: https://github.com/Chris-Kode/myanimelist-api-v2/blob/master/README.md
4. Jikan v4 upstream OpenAPI routes: https://github.com/jikan-me/jikan-rest/blob/master/storage/api-docs/api-docs.json — `/anime/{id}/characters`, `/anime/{id}/episodes`, `/anime/{id}/episodes/{episode}`, `/characters/{id}/anime`, and `/characters/{id}/voices`. **Jikan is separate from the official MAL v2 API.**
5. Jikan.JS documentation of actual returned types: https://rpdjf.github.io/Jikan.js/all_symbols.html — `AnimeCharacterRole` includes character, role and voice actors; `AnimeEpisode` and `AnimeEpisodeFull` include episode metadata but no character list.
6. Independent field inventory noting Jikan `/episodes` versus `/episodes/X` have different metadata: https://github.com/Fribb/MyAnimeList.bundle/issues/40

## Primary-source recheck during continuity handoff (2026-10-09)

The official MAL reference URL was attempted again and remained inaccessible to
direct inspection. A targeted search for official MAL documentation did not
recover an inspectable official schema. **Official MAL v2 episode-character
support remains unverified**, not established as absent. Anime-wide character
and voice-actor fields verified below are **Jikan fields**; this investigation
has not directly verified their availability in the official MAL v2 API.

Jikan's upstream OpenAPI document was directly inspected at pinned commit
[`1e33a79bcc9161f1831e4428004e110c67a48676`](https://github.com/jikan-me/jikan-rest/blob/1e33a79bcc9161f1831e4428004e110c67a48676/storage/api-docs/api-docs.json)
(OpenAPI information version `4.0.0`). Its own description identifies Jikan as
unofficial, unaffiliated with MAL, and based on website parsing. Documented
Jikan routes therefore **do not establish a MAL-sanctioned mechanism**.

| Documented GET route | HTTP 200 schema | Relevant documented data |
|---|---|---|
| `/anime/{id}/characters` | `anime_characters` | `data[].character`, `role`, `voice_actors[].person`, `language`; no episode-membership field |
| `/anime/{id}/episodes` | `anime_episodes` | `data[]` episode IDs, video URLs, titles, air dates, score, filler/recap flags and forum URL; no character list |
| `/anime/{id}/episodes/{episode}` | wrapper containing `anime_episode` | Episode ID, URL, titles, duration, air date, filler/recap and synopsis; no character list |
| `/characters/{id}/anime` | `character_anime` | `data[].role` and `anime`; work-level association only |
| `/characters/{id}/voices` | `character_voice_actors` | `data[].language` and `person`; no episode-membership field |

This inventory records **documentation properties**, not invented API responses
or an assertion that an undocumented property cannot exist. The inspected
schema does not document a character-to-episode appearance edge in these
responses. No production or live data endpoint was called. Earlier secondary
references remain above as the provenance of the first audit; this recheck's
Jikan conclusions rely on its upstream schema.

## Graph design implication

The following are **separate sourced edges**, not one implicit join:

- `Anime --CHARACTER_CREDITED_IN--> Character`
- `Anime --HAS_EPISODE--> Episode`
- `Character --VOICED_BY--> Person`
- `Character --APPEARS_IN_EPISODE--> Episode` **only when separately sourced** (e.g. an AniDB source field with safely parsed positive references), never because character and episode share an anime.
- `Character --MAY_APPEAR_IN_EPISODE--> Episode` can be a future lower-confidence inference if explicitly requested; do not add it to current verified result sets.

The MAL/Jikan work-level character list and episode list cannot be cartesian-joined into an episode appearance table. Nor may an arbitrary AniDB `aid` or episode `eid` be treated as interchangeable with a MAL identifier; cross-provider IDs are independent until verified via explicit mapping.

Episode metadata coverage can be sparse, postponed or different across providers. **No episode-level negative filter** should exclude a potential character when appearance metadata is missing.

## Implementation/approval boundary

- **Research task P3-06:** completed by documenting the absence of *verified supported* episode-character linkage and recording the appropriate unknown state.
- **Not done:** A MAL account/API registration, consent, authentication, official MAL live endpoint probe, Jikan use in production, cross-provider ID reconciliation, scene-frame recognition or a co-watching engine.
- Future `P4-06` remains Mark-owned: he chooses and authorizes any MAL or other provider integration before actual adapter/network work. Further validation against official MAL's spec remains desirable when directly accessible.

The answer is intentionally modest: **no confirmed episode-to-character edge from MAL/Jikan was found**. It is not a proof of impossibility.

