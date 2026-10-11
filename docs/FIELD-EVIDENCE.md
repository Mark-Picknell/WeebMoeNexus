# Field evidence, disagreements and source preference

## Source claims

`FieldClaim` is one scalar assertion attached to a provider/kind-local subject,
field and exact context. Its evidence retains the source record, HTTP(S) URL,
retrieval time, normalized field path and reported scalar. Context includes the
source work and qualifiers such as title language/kind or episode ID. Repeated
rows remain repeated assertions; names do not merge IDs or namespaces.

`projectAniDbFieldClaims` is a pure projection of an already validated anime
record. It covers work metadata/titles, character metadata/episode-reference
text, contributor names/production roles, and episode metadata. Relationships
and credit endpoints remain in the separate [edge contract](RELATIONSHIP-EDGES.md).
The evidence is **normalized scalar data, not original XML bytes or lexemes**.
The mapper has already trimmed strings and interpreted numbers. Source URLs
identify the source record; they are not claims of live verification.

Missing values, missing contributor IDs, generated display labels, unavailable
species/alias fields and lost `restricted` attribute presence remain explicit
unknown observations. The legacy mapper defaults `restricted` to false; this
projection conservatively emits an unknown for that field even if true was
normalized. Preferred titles are a derived display choice, not a new source
assertion. A missing episode number's `?` and generated character names cannot
become source facts. The normalized record cannot distinguish a genuine source
name identical to its fallback; that collision also stays unknown.

No character scene presence, catalog completeness, global identity resolution,
source authenticity or provider integration is inferred. A source absence is
not a negative assertion. Episode qualifiers identify rows in one work record,
not a new work or character identity. Empty arrays are not exhaustive denials.

This is an additive domain/provider substrate; existing anime/MCP schemas are
unchanged. All contract fixtures are authored synthetic data and make no live
catalog claims.

## Conflict assessment

`assessFieldClaims` compares at most 1,000 claims and 1,000 unknown observations
against explicitly selected subjects (at most ten, all of one kind), one field,
one exact context and a declared `single` or `multiple` cardinality. Membership
is a comparison request, **not an identity merge**. Other subjects, work scopes
and qualifiers are excluded with counts. Future cross-provider comparisons need
separately evidenced subject/context alignment; this service cannot establish it.

Two distinct positive values conflict only for a single-valued field. Multiple
names/aliases can coexist. Positive and explicit negative assertions of the
same typed value always conflict. Negative assertions of a different value do
not contradict a positive assertion. Nulls/unknowns never become negatives.
States are `unknown`, `reported`, `negative_only` and `conflicting`; these are
states of the selected evidence, not global truth, completeness or consensus.

Each conflict points to indexes in the retained claim array. Repeated assertions
and differing retrieval dates remain visible, without voting, deduplication or
automatic newest-wins resolution. Scalar equality is exact and type-sensitive;
case variants and differing labels can be flagged as single-value disagreement
without claiming a taxonomy or natural-language contradiction has been proved.
All comparison arrays are copied, and grouping is linear rather than pairwise.
