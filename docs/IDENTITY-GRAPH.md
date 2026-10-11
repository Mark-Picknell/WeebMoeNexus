# Canonical identity graph

`buildIdentityGraph` is a bounded, provider-independent graph over supplied
provider/kind-local entity references. Explicit `same_entity` / `different_entity`
assertions and project-owned canonical anchors require source evidence. Missing
endpoints, mixed-kind identity links, duplicate nodes and cross-kind canonical
IDs reject. Limits are 500 nodes, 2,000 assertions and 500 anchors.

Only positive mappings and explicit shared canonical anchors connect candidate
components. Names, title similarity, credits, historical referents, adaptation,
mascot reuse, cameo, crossover and ordinary relationship reachability never
produce identity mappings. Work/character/contributor/historical-person kinds
stay separate even when IDs or names match.

Components retain every member and candidate canonical ID. A contrary identity
assertion inside a transitive component or multiple canonical IDs yields
`conflicting`, with a null selected canonical ID and original evidence intact.
An unanchored component remains `unassigned`; the service never manufactures a
canonical ID from a display name or provider ID. Resolution is scoped to supplied
evidence, not proof that any source mapping is objectively correct.

Component hashes describe the sorted membership set, are stable across node
ordering, and are **not canonical identity IDs**. An evidence change may alter
membership or conflict status. All source assertions and anchors remain in the
returned input, including duplicates, contrary assertions and retrieval times.
No majority vote, inverse relationship construction or newest-wins policy.

This is an executable identity graph substrate, not a global resolver, a second
provider adapter or a production persistent mapping catalog. A caller must
supply sanctioned mapping evidence and canonical anchors; current AniDB tools
do not discover such cross-provider mappings. Canonical grouping does not
automatically align field contexts or merge field values. Those comparisons
remain explicitly scoped by the [field contract](FIELD-EVIDENCE.md).

The versioned fixture corpus is wholly authored synthetic data, with independent
provider namespaces and no copied API responses. It exercises contradictory
provider fields, Carrera name collisions, source mappings and cross-media
adaptation/portrayal links. Passing it does not pass the natural-language golden
queries or establish live catalog identity.
