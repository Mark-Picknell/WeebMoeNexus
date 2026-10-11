# Deployment runbook

Prepared 2026-10-11 UTC. This is a tested deployment recipe, not evidence of a
hosted endpoint. D-03 reserves hosting, permissions, budget and access policy to
Mark. D-04–D-07 require real deployment and client observations.

## Concrete initial deployment

Use one always-on Node 22 container behind the approved host's managed HTTPS
proxy, one persistent `/data` volume, and one process/replica. The AniDB gate and
backoff are process-local; scaling replicas would bypass aggregate pacing.
Do not expose the container's HTTP port directly to the internet. Preserve the
approved hostname in `Host`; forwarded host/IP headers are not trusted.

| Setting | Hosted public read-only | Private bearer access |
|---|---|---|
| `WMN_HTTP_MODE` | `public` | `bearer` |
| `WMN_PUBLIC_READ_ONLY` | `true` | Omit |
| `WMN_BIND_HOST` | `0.0.0.0` inside private container network | Same |
| `WMN_ALLOWED_HOSTS` | Actual approved hostname, without scheme/port | Same |
| `WMN_ALLOWED_ORIGINS` | Exact approved browser origins, or omit | Same |
| `WMN_BEARER_TOKEN` | Omit | Host secret, at least 32 printable characters |
| `ANIDB_CLIENT`, `ANIDB_CLIENT_VERSION` | Registered `weebmoenexus`, `1` | Same |
| `ANIDB_ANIME_CACHE_DIR` | `/data/anime` | Same |
| `ANIDB_TITLE_DUMP_CACHE_PATH` | `/data/anime-titles.xml.gz` | Same |

Default startup remains loopback-only. Invalid modes, wildcard hosts, malformed
origins, short secrets and accidental public binding in local mode fail startup
with a generic error. Bearer tokens are fixed API keys, not OAuth. Do not commit
the host's environment, secret values or provider credentials.

Build with `docker build -t weeb-moe-nexus:review .`. The multi-stage image builds
with the lockfile, prunes development dependencies and runs as the non-root
`node` user. Mount an appropriately owned persistent volume at `/data`; apply
the table's settings through the approved host. Container CI builds the image
and checks `/healthz` from inside it without exposing ports or reading AniDB.

After deployment authorization, populate the title index explicitly with
`node dist/cli/refresh-anidb-titles.js` in the container. This is a live sanctioned
dump download, never a startup/CI action. Refresh no more often than the existing
48-hour default; the code enforces a 36-hour minimum. A failed refresh preserves
the prior valid file and returns an unsuccessful exit status. Repeated manual
invocation is unnecessary. `search_anime` cannot download or repair its cache.

## Operational boundaries

| Control | Implemented limit/behavior |
|---|---|
| Routes | `/mcp`; `GET /healthz`; other paths return 404 |
| Host/origin | SDK host allowlist; exact hosted origins; absent Origin allowed for server clients |
| Admission | Global 120 MCP requests/minute, at most 32 active responses; 429 on excess |
| Request transfer | 64 KiB buffered body, including chunked transfer; request/header timeouts 30/15 seconds |
| Connections | 5-second keepalive; at most 16 SDK subscriptions |
| AniDB queue | At most 32 running/queued HTTP operations; no retry on overflow |
| Upstream reads | Existing ≥2-second pacing, 2.5-second default; 15-second transfer timeout; 8 MiB response bound |
| Ban/429 | Five-minute process-local pause; queued/new uncached reads fail locally; no timed retry job |
| Memory anime cache | At most 256 entries and 16 MiB of serialized entry data, oldest insertion evicted |
| Disk anime cache | Existing atomic, versioned, scoped successes, 8 MiB/file, original provenance/expiry; 72-hour default |
| Shutdown | Stop admission, close MCP/HTTP; force close after 10 seconds |

Memory's serialized size is an accounting budget, not total process RAM. Title
indexes and active parsing also consume RAM. Expired anime disk files are
ignored, not automatically deleted. Set a volume quota and monitor usage;
remove expired disposable entries during controlled maintenance and retain the
valid title dump. Cache misses may contact AniDB, so clearing all caches can
increase upstream demand. No cache hit renews source age or clears a recorded
failure. Restarting loses backoff; after a ban, keep the service paused at least
five minutes rather than using restarts to bypass the pause.

JSON application diagnostics contain event names, response status and duration;
they omit request URLs, arguments, headers, tokens, IP addresses and provider
bodies. Provider cache write failures use a fixed warning. The manual title
refresh is an operator command and can include local paths/upstream error text;
keep that output restricted. Configure the proxy to omit authorization/query
details from its own logs. Decide proxy retention with the host before writing
the public privacy policy. `/healthz` indicates process liveness only;
`get_provider_status` reports passive observations, never an upstream probe.

A public endpoint still needs proxy-level connection/abuse controls, TLS, volume
quotas, monitoring, spend limits and backup/retention decisions. The application
budget is shared among callers, so one caller can exhaust it; it is not a
per-user quota or a distributed limiter. Do not claim OAuth, signed user
identity, successful hosting or directory acceptance from these offline tests.

## Verification, maintenance and rollback

1. Record approved host/account, one-replica policy, volume quota, spending cap,
   access mode, hostname and secret handling under D-03.
2. Run the production image, check TLS/host rejection, and confirm the writable
   volume and read-only tool inventory. Populate the approved title cache.
3. From the trusted checkout run `node scripts/verify-deployment.mjs <actual-https-mcp-url>`.
   Private verification uses the `api_key` argument and a host-injected
   `WMN_BEARER_TOKEN`. The script only lists tools and calls health/status. It
   removes its earlier report before attempting verification and never saves
   secrets. A successful report does not pass live catalog accuracy or D-07.
4. Record actual ChatGPT/Codex installation and a bounded read with Mark under
   D-06/D-07. A safe not-found/ban response remains a failed lookup, not success.
5. Monitor safe HTTP diagnostics, passive provider errors, memory/volume use and
   title-refresh exits. On ban/429, stop unnecessary reads; do not probe recovery.
6. Roll back to the recorded prior image/commit. Retain scoped valid cache files
   unless normalization requires invalidation; restarting cannot refresh their
   evidence. Rotate compromised secrets through the host, never through Git.

See [publication preparation](PUBLICATION.md) for packaging and remaining gates.
