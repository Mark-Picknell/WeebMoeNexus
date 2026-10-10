# Typed relationship assertions

P3-11 defines source-backed assertions, separately from identity resolution.
The contract is in [relationship-edge.ts](../src/domain/relationship-edge.ts).
References contain a provider, entity kind and provider-local ID. A name is a
display value, never an ID; matching numeric IDs in different kinds/providers
do not identify the same entity. Contributors can include organizations.

| Type | Reported direction | Meaning and limit |
|---|---|---|
| `voice_credit` | Contributor → character, scoped to work | Reported performer credit; language can be unknown. No real/fictional identity or kinship claim. |
| `production_credit` | Contributor → work | Original production role, nullable when missing. No assumption of personhood. |
| `portrayal_of` | Character → character or historical person, scoped to work | One specific portrayal refers to another entity. Multiple portrayals keep distinct source IDs. |
| `adaptation_of` | Adaptation work → source work | Explicit adaptation assertion; no canon equivalence. |
| `inherits_name_from` | Successor character → predecessor character | Explicit inherited name, not the same individual. |
| `cameo_in` | Character → work | Explicit cameo assertion, not proof of an episode or scene. |
| `crossover_with` | Work → work | Reported direction only, even when the concept is reciprocal. |
| `reported_work_relation` | Source work → target work | Original provider label; no automatic conversion to a more specific semantic type. |

Every edge requires at least one evidence item: source-record reference, HTTP(S)
source URL, retrieval timestamp, field path, original field/serialized normalized
row, and positive/negative polarity. Opposing assertions retain their own evidence;
the schema does not select a winner. Empty evidence, unknown relationship kinds,
wrong endpoint kinds and undeclared identity shortcuts reject at validation.
Absent assertions remain unknown. Direction never creates an inverse edge.

This is an internal domain contract, not a new MCP tool, live catalog, provider
integration or cross-provider identity resolver. A schema can validate shape and
evidence presence; it cannot authenticate an assertion's truth. Semantic types
need explicit supporting source fields before a provider adapter may emit them.
The initial contract tests use entirely synthetic evidence and references.

## AniDB projection

[relationship-edges.ts](../src/providers/anidb/relationship-edges.ts) is a pure
projection of an already retrieved and validated normalized anime record.
It emits production credits, character-attached voice credits, and uninterpreted
work-relation rows. Every source row keeps its own evidence and index, including
duplicate roles, repeated targets and self links. Evidence serializes the existing
normalized row; this does not recover original XML formatting or discarded fields.
The evidence URL identifies the asserting anime record, never an unread target.

Contributors with missing source IDs retain separate unresolved credit rows with
their original normalized evidence. Names cannot fabricate identities. Voice
language remains null because the current mapper supplies no language field.
Absent voice credits create no negative claim. The row count accounts for emitted
edges plus unresolved credits; zero rows means no assertions were reported.

The projector validates canonical matching AniDB work provenance, timestamps and
safe IDs. It does not mutate records, perform network requests, fetch related
targets, infer reverse edges, classify production contributors as people or
reinterpret relation labels. Even a label reading `adaptation` remains a
`reported_work_relation` until a separately evidenced adapter mapping exists.
Portrayal, inherited-name, cameo and crossover contracts currently have synthetic
contract coverage only; no AniDB fields for those assertions are invented.

## Offline identity regression coverage

[identity-regressions.test.ts](../test/identity-regressions.test.ts) exercises the
real comparison, relation projection and bounded traversal code, plus the typed
edge contract. It covers the past mistakes recorded in
[GOLDEN-QUERIES.md](GOLDEN-QUERIES.md):

| Case | Executable guardrail | Remaining capability |
|---|---|---|
| Carrera / Viper GTS | Reported work context ranks the correct occurrence; an absent species field stays unknown, even under output truncation. | Global character discovery, species ingestion and similarity ranking. |
| Ogata name order | Two reported name orders under one source ID stay one contributor; different IDs with identical names remain separate. | Resolving unreported aliases or independent providers. |
| Ogata / original Macross | A credit scoped to another work cannot migrate; missing credits do not emit negative edges. | A live, authoritative coverage audit and global person discovery. |
| Shared Oda surname | Character names alone generate no voice, kinship or historical identity edges. | Source-backed historical relationships. |
| Macross → Robotech | A synthetic explicit related-release row remains visible through direct projection and outgoing traversal, despite a different target title. Reported labels remain unchanged; missing titles are not guessed. | Automatic adaptation classification, relationship ranking and bidirectional source discovery. |
| Nobunaga / Yoshimitsu / Plue | Explicit portrayal, inherited-name, cameo and crossover fixtures retain distinct typed references; voice credits cannot target historical people. | Provider adapters for those semantic assertions. |

The fixtures are author-authored synthetic contracts, inspired by the existing
research cases. All XML, IDs and credits in that test file are invented, clearly
labeled data. They establish deterministic behavior under the stated inputs, not
real catalog facts. No live network call or provider access is required. The
golden-query corpus remains `pending_resolver`; these unit contracts do not claim
the natural-language end-to-end golden queries pass.
