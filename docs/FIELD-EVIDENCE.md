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
