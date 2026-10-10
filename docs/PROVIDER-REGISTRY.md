# Provider capabilities and passive health

The registry separates what this plugin implements from what is verified about a
provider's native API. [provider-registry.ts](../src/domain/provider-registry.ts)
defines the domain contract; [AniDB declarations](../src/providers/anidb/capabilities.ts)
contain pinned implementation evidence and explicit scope/limitations.

| Axis | Values | Meaning |
|---|---|---|
| Plugin implementation | `implemented`, `not_implemented` | Inspected plugin behavior; not an upstream availability claim. |
| Native provider assessment | `supported`, `unavailable`, `undocumented`, `unverified`, `not_assessed` | Evidence-scoped provider knowledge; these states are not interchangeable. |
| Evidence basis | `implementation`, `offline_contract`, `live_smoke`, `documentation` | What a cited source can actually establish. |

Offline tests cannot prove native support, unavailability or undocumented status.
Conclusive provider assessments require scoped documentation; `supported` can also
cite a specifically observed live operation. An evidence URL's presence does not
authenticate its content or make a narrow observation universal.

The initial inventory includes only the active AniDB adapter. It records one
historical anime smoke read, not a current probe or catalog-wide validation.
Other mapped capabilities retain unverified live completeness. Missing plugin
features, including species/character aliases, global character discovery, scene
identification and cross-provider identity, do not imply AniDB cannot provide them.
Typed semantic-edge schemas do not count as a source adapter for those semantics.

Declarations do not read local caches, refresh title dumps, contact providers,
validate external accounts or expose configuration values. Returned declarations
are fresh copies. All new contract fixtures are synthetic. Operational health and
MCP inspection are subsequent slices of P4-04; the task stays open until verified.
