# Structured AniDB read failures (P1-06)

Research and implementation date: **2026-10-09**. These are WeebMoeNexus error
categories, not AniDB numeric protocol codes.

The five AniDB-backed MCP read tools return `isError: true`, readable text and
`structuredContent: { error: { provider, code, reason, message, httpStatus,
apiCode, retried } }` on a root provider failure. Their existing success schemas
remain unchanged. Partial relation traversal remains a successful partial graph
with its original `source_read_failed` termination/frontier marker; each failure
may additionally contain `providerError` with the same typed details.

| Code | Classification implemented |
|---|---|
| `not_found` | Explicit root XML error label `No such anime` or `Anime not found`; scoped to this provider lookup |
| `banned` | Explicit root XML error label `Banned` or `Client banned` |
| `outdated` | Explicit root XML error label `Client version outdated` or `Client version is outdated` |
| `misconfigured` | Missing/blank local client, invalid endpoint/client version, or root error label `Unknown client`, `Invalid client`, `Client not registered` |
| `unavailable` | Unknown API errors, HTTP failures, transport/body-read failures, malformed XML, invalid normalized records or requested/returned ID mismatch |

Label matching is case-insensitive, whitespace-normalized and ignores final
periods/exclamation marks; it is applied **only to a parsed root `<error>`**.
An anime description containing “banned” is ordinary content. Root error XML
with a declaration is recognized. Numeric-only or unfamiliar errors stay
`unavailable` even when their numeric code happens to match a test fixture.

`reason` distinguishes `missing_client`, `invalid_configuration`, `api_error`,
`rate_limited`, `http_error`, `network_error` and `invalid_response`. HTTP 429
means `unavailable / rate_limited`, requesting backoff **without asserting a
confirmed ban**. Generic HTTP 404 or 403 means `unavailable / http_error`, not
proof an anime is absent or a client is banned. Nonnegative safe integer XML `code`
attributes are preserved as `apiCode`; missing, malformed or
unsafe numeric attributes become null. HTTP status and API code remain separate.

All failures have `retried: false`. No automatic retry, ban probe, negative-result
cache or provider account change was added. The existing pace gate is retained.
Successful anime records alone enter the cache, after schema and requested-ID
validation. Raw upstream bodies, transport exceptions and configured URLs are
not copied into the structured error or its readable message.

Existing `AniDbConfigurationError` and `AniDbUpstreamError` exports remain
compatible subclasses of `ProviderLookupError`, so previous `instanceof`
checks continue to work. MCP input validation errors and local title-cache
errors retain their existing separate contracts.

## Evidence and limits

- [Provider regressions](../test/provider-errors.test.ts) cover configuration,
  XML declarations/labels, arbitrary numeric evidence, HTTP/transport failures,
  the description false-ban bug, response validation/cache rejection and typed
  partial graph failures.
- [In-memory MCP tests](../test/mcp-provider-errors.test.ts) invoke all five
  provider-backed read tools and validate the structured error envelope.
- Fixtures are synthetic, with deliberately arbitrary numeric API codes. They
  prove this classification contract, not a verified live AniDB code inventory.
- The official [AniDB HTTP API reference](https://wiki.anidb.net/HTTP_API_Definition)
  returned HTTP 403 during this research. No authoritative numeric-code table
  was inspected. Numeric mappings are therefore deliberately unimplemented;
  UDP API code tables must not be substituted for HTTP API semantics.
- No live AniDB request was made for this slice. Runtime labels outside the
  recognized set conservatively remain unclassified `unavailable` errors.
