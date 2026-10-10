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

## Passive operation health

[provider-health.ts](../src/domain/provider-health.ts) keeps only the most recent
completed anime HTTP read observation within one process. It reports validated
success or failure, observation time, whether a network attempt occurred, and safe
error codes/reasons/HTTP/API status. Raw messages, endpoint values, credentials,
client names, cache paths and queried IDs are excluded.

Configuration readiness uses the same preflight as the actual client read.
`ready` means locally valid configuration, not a verified registration or reachable
provider. The existing `anidbConfigured` flag retains its original client-present
meaning. Inspection makes no request or cache read and never retries a failure.

Memory/disk cache hits do not create or renew HTTP observations and cannot hide a
more recent failed read. Restart clears health history; a disk hit then leaves
HTTP status unobserved. A later explicitly requested, validated HTTP success
replaces a failure observation. The read/cache/error behavior otherwise remains
the existing behavior; health inspection does not prevent or schedule reads.

Observations become stale at five minutes. Clock reversal produces explicit
uncertainty, not a negative age. A scoped `not_found` result is not an assertion
that the provider is down; there is no global `healthy` Boolean. Title dump refresh,
local title-index availability, every past error, other processes and provider-wide
service health are outside this observation's scope. Freshness is computed at
inspection time and does not trigger background probes.
