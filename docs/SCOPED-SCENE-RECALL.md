# Source-scoped character-clue recall (P6-06 partial)

**Verified 2026-10-15, read-only MCP tool:** `recall_character_clues_in_selected_anime`.

## What this does

Given **one explicitly selected AniDB anime ID**, one to six literal
text cues, and optionally one AniDB **episode ID**, this tool returns
source-reported characters whose *character description prose* contains
complete consecutive normalized cue words. Results can be sorted ahead
when the source itself provides a conservative **positive episode
reference** for that selected episode.

This supplies **candidates for discussion**, not actual scene recognition,
an identified screenshot, episode/frame observation, automatic title
discovery, persistent conversational memory, semantic character attributes,
or spoiler-aware companion playback. No media is read; no user account,
watch history, upload, storage or third-party interaction is needed.

The source and episode ID must be selected by the caller. `search_anime`
can suggest work-title IDs from a separately prepared local title index;
it does not automatically search characters or run this tool.

## Input

| Parameter | Meaning |
| --- | --- |
| `anidbId` | Required, positive safe integer. Exactly **one** source anime, no global discovery. |
| `cues` | 1–6 distinct literal phrases, 2–80 chars each, normalized meaningfully with at least two characters. |
| `episodeId` | Optional positive AniDB episode ID. Source membership is checked in that same work. |
| `mode` | `any` (default) or `all`, applied to literal character-description mentions. |
| `limit` | 1–25 candidates, default 10. Total counts computed before truncation. |

Synthetic request shape (IDs and descriptions **not** live AniDB facts):

```json
{
  "anidbId": 440,
  "cues": ["lab coat", "scalpel"],
  "episodeId": 702,
  "mode": "any",
  "limit": 10
}
```

## Interpretation and ranking

The tool validates parameters **before** any provider read; it obtains one
selected source anime via the existing paced/cached service and fails
closed on wrong work ID, missing provenance or invalid normalized records.
Upstream bans/errors preserve structured provider failures; retries and
unrequested work fetches are not attempted.

A phrase such as “does not wear a lab coat” **matches** `lab coat` as
literal text. It does not establish that the character wears one. Each
candidate includes the source row field `characters[i].description`,
short normalized excerpt, retained character ID/name/source URL, nullable
character type, optional voice actor, matched and unverified cues, and
the complete conservative parsed episode evidence.

If a requested episode **exists in that source anime's episode rows**
and a parseable character episode reference joins that ID, the candidate
has `episodeReferenceStatus: "reported_positive"` and ranks ahead of
other text matches. This represents a **source reference**, never
a claim that the character was observed at any actual timestamp.
Absent/partial/malformed references remain `unverified`, **never**
`not_present`. When the source anime does not list the requested episode,
`sourceEpisodeStatus` is `not_reported`, not proof the episode doesn't
exist elsewhere or in another edition. When no episode ID is supplied,
both statuses explicitly read `not_requested` where appropriate.

Ranking is then by number of matched literal cues and original source-row
order. Every candidate says `assertionStatus: "candidate_not_identification"`.
The top-level result states `sceneIdentification: "not_performed"`
and `sourceMentionsAreNotVerifiedTraits: true`.

Null or missing descriptions do not become affirmative negative evidence;
old cache rows with no `description` field are counted in
`legacyDescriptionUnknownRows` rather than silently dropped.
Counts consider full inspected source rows before output limit.

## Verified tests and boundaries

- `src/domain/scoped-scene-recall.ts`: strict request and result contracts.
- `src/services/scoped-scene-recall-service.ts`: one-work lexical
  candidate retrieval, positive-only episode boosts, provider-safe read.
- `test/scoped-scene-recall.test.ts`: four synthetic source-fixture tests
  for ranking, negative/unknown guardrails, count/truncation,
  invalid input and provenance.
- `src/server.ts` and `test/mcp-scoped-scene-recall.test.ts`: registered
  read-only MCP tool; synthetic in-memory client verifies default
  source behavior, caching, ban, invalid inputs and non-identified scene.
- `test/deployment-mcp.test.ts` and
  `test/scoped-scene-recall-capabilities.test.ts`: 18-tool read-only
  loopback registration and a truthful source-capability declaration.

[Pure-service checkpoint: 313/313 tests passed](https://github.com/Mark-Picknell/WeebMoeNexus/actions/runs/38745086974).

[Registered MCP checkpoint: 315/315 tests passed, TypeScript
and container/liveness green](https://github.com/Mark-Picknell/WeebMoeNexus/actions/runs/38745762651).

**Open:** P6-06 still requires broad character/episode/media identification
and genuine memory reconstruction; P6-01 needs verified appearance traits;
P6-02 requires pause-frame recognition; GQ-001 and GQ-018 require
source-verified live acceptance. No Crunchyroll integration or licensed
watch companion was built.

**Owner register unchanged:** 56 of 87 complete. This checkpoint delivers
a bounded, evidence-preserving building block, not a completed phase.
