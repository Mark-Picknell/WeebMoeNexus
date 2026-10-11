# Scene observations, unverified reviews, and source candidate previews

**2026-10-11 UTC; bounded implementation slices for P6-02, P6-03 and P6-04.**
These are **pure, local, testable contracts**, not authenticated user storage,
image upload, visual analysis, deployed tools or accepted Phase 6 deliverables.

## What is actually implemented

1. `recordSceneObservation` validates a user-reported scene observation with
   a known AniDB work ID, nullable source episode EID and playback-relative
   millisecond offset, timestamp, up to 16 typed observations (each with
   `observed` or `uncertain` certainty), and a nullable character proposal.
   Its initial provenance is `unverified_submitter_assertion`; review state is
   `unreviewed`. Raw media bytes, external image URLs, unknown attributes,
   unsafe IDs, unbounded fields and unconsented requests are rejected.
2. The optional image reference contains **only a SHA-256 digest** and a
   submitter-claimed rights basis plus affirmative permission. This is neither
   an upload, proof of ownership/license, machine-verified authorization nor
   consent for retention or publication. The required consent scope is
   `ephemeral_local_processing_only`; there is no storage or user account.
   Do not repurpose the digest as a content retrieval URL or claim actual
   media is inspected. Images and video are not processed.
3. `assessSceneReviews` and `appendSceneReview` retain typed review-event
   ancestry with IDs, attribution explicitly marked **unverified**, times and
   action (support, dispute, request evidence, withdrawal). Events must target
   the same observation, use distinct IDs and ordered times. A withdrawal is
   terminal for that observation ID; a correction requires a new observation
   with its own ancestry. Opposing reviews remain `contested`, even when
   one side is numerically larger or newer. Support alone is only
   `observer_supported_unverified`, **never provider verified**. Derived
   summaries cannot be silently forged on append.
4. `previewSceneCandidates` combines one source anime record and one
   independently assessed observation ledger. Only the established
   `rankEpisodeCharacters` source metadata decides the source list order.
   A character proposal is displayed as an **observer flag**, not an identity
   join, verified trait match, new provider record, or extra candidate.
   Duplicate source rows remain distinct. Withdrawn proposals have no active
   flags. Truncated candidate pages return `not_checked_truncated` instead
   of implying absence; missing source episodes and unknown episode choices
   remain separate statuses. Trait matching is explicitly `not_available`.

## Trust and scope boundaries

| Type of evidence | Allowed interpretation | Not established |
| --- | --- | --- |
| Source episode references | Source-reported positive metadata, with incomplete coverage possible | A verified frame sighting or confirmed nonappearance |
| User description and identity proposal | Unverified local report at a claimed time/context | Provider metadata, canonical character identity or authentic submitter |
| Review event | Unverified statement supporting, disputing or withdrawing a proposal | Approved moderator, authenticated account, adjudicated truth |
| Claimed image digest and rights | Opaque digest and user's permission statement | Media bytes, valid license, image examination or publication consent |

All three new modules are non-networking, non-persistent and not registered as
MCP write tools. There is no upload endpoint, model-based hair/clothing
comparison, provider-side write, public feedback ingestion, anti-abuse control,
authenticated review identity or change to the canonical identity graph.

## Verified regression evidence

- `test/scene-observation.test.ts` — time/location ambiguity, consent, digest
  constraints, strict input, provenance and immutability
- `test/scene-review.test.ts` — review-event ancestry, conflicting opinions,
  inability to silently resurrect retracted claims and forged summaries
- `test/scene-candidate-preview.test.ts` — source-vs-observer evidence separation,
  same-anime scoping, truncation, unknown episodes and withdrawals

[Latest code CI: 246/246 offline tests, TypeScript build and production image
passed](https://github.com/Mark-Picknell/WeebMoeNexus/actions/runs/38107449164).
No third-party media or live AniDB lookup was used in these fixtures.

## What still needs real implementation and review

- P6-02: authorized frame/voice scene observations and a genuine visual/voice
  evidence comparison; source-episode ranking alone does not identify frames
- P6-03: user identity, corrections/confirmation workflow, authenticated
  consent, durable retention/deletion policy and *authorized* reference-image
  upload with independently verified legal/usage conditions
- P6-04: replayable durable review store, abuse prevention and explicit human
  quality-control policy before feedback influences canonical metadata
- P6-01, P6-06, golden semantic acceptance, Mark's final review and publication

These partial slices **do not check off** P6-02, P6-03 or P6-04. The register
remains **54/87 complete, 33 outstanding**. Observations, user opinions and
provider claims retain their distinct provenance.
