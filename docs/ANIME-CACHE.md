# AniDB anime success cache — P1-07

Implemented scope: normalized, validated AniDB anime responses persist locally
and can be reused after a process restart. This applies through `AnimeService`
to every existing AniDB-backed read tool. It does not add a provider, background
refresh, hosted storage, stale-success mode or a new MCP output schema.

## Configuration

| Setting | Behavior |
| --- | --- |
| `ANIDB_ANIME_CACHE_DIR` | Application default `.cache/anidb/anime`, relative to the working directory. Empty disables persistence. |
| `ANIDB_CACHE_TTL_MS` | Existing default 259,200,000 ms (72 hours), clamped by environment loading to at least 60,000 ms. |
| Direct `AniDbConfig.cacheDirectory` | Optional; direct callers omitting it retain memory-only behavior. Offline tests use temporary directories or disable persistence explicitly. |

Use a writable persistent volume to retain data across deployment replacement;
an ephemeral container filesystem only survives as long as that filesystem.
Cache files are ignored by Git. They contain public source metadata, not client
credentials. An opaque SHA-256 scope partitions endpoint, client name, client
version and protocol version; changing any of those selects another directory.
Source configuration is not written into the envelope. This is a disposable
cache under a trusted local directory, not tamper-proof evidence storage.

## Read and expiry contract

1. Return a fresh in-memory record first.
2. Coalesce concurrent misses for the same ID within one service instance.
3. Read at most an 8 MiB versioned JSON envelope from disk. Reject non-files,
   changed-size reads, invalid JSON/schema, unknown versions, scope mismatch,
   wrong anime/source IDs, invalid source URL/timestamp, missing provenance,
   future cache creation times and invalid/expired intervals.
4. Revalidate against the current `AnimeRecord` schema and recheck expiry after
   asynchronous I/O. Preserve original `retrievedAt`, source fields and expiry.
5. On a miss, make one normal paced AniDB read, validate and match the requested
   anime ID, then cache a successful normalized record in memory and on disk.

Envelope `cachedAt` and `expiresAt` are epoch milliseconds. Effective disk expiry
is the earlier of the saved expiry and `cachedAt + current TTL`: shortening the
TTL applies on restart, while lengthening it cannot extend the saved lifetime.
Neither disk hits nor process restarts reset that lifetime. A mapper/schema
semantic change must bump the envelope version even when its old shape could
still pass Zod. No root XML/API errors or transport failures are persisted.

Missing, corrupt or unreadable cache files are misses. A refresh failure exposes
the existing structured provider error, with no automatic retry and no stale
record substituted as success. The last disk file may remain for inspection,
but its existence does not make it valid. A later explicit call can try again.

## Writes and limits

Write a unique, exclusive temporary file in the destination directory, then
rename it to publish the complete envelope. New files request mode `0600` and
new directories `0700` where the platform supports Unix modes. Temporary files
are cleaned up after ordinary success/failure; an abrupt process kill can leave
an ignored temporary file. A failed replacement preserves the existing file.
Disk write failure (including an oversized normalized result) emits a generic
diagnostic without filesystem paths, configuration or upstream material; the
validated result remains usable in memory.

The cache uses Node's [documented filesystem operations](https://nodejs.org/docs/latest-v22.x/api/fs.html),
including exclusive creation and same-directory rename. This does not promise
power-loss durability, distributed locking, or identical rename guarantees on
every network filesystem. Separate service instances/processes do not share an
in-flight map or rate gate; shared-host coordination remains future operational
work. Atomic replacement prevents partial JSON publication but does not order
independent writers by source age. Expired entries and abandoned temporary files
have no automatic disk eviction; operators can remove the disposable cache.

The official title-dump cache is a separate component with its own refresh and
explicit stale fallback contract. To force a genuinely live standalone smoke
request from a previously used workspace, set `ANIDB_ANIME_CACHE_DIR=` for that
invocation; ordinary CI never issues live AniDB requests.

## Offline evidence

`test/anidb-anime-cache.test.ts` covers two actual Node processes with a blocked
fetch on restart; unchanged normalized content/provenance; TTL expiry and
shorter/longer reconfiguration; corrupt, future, wrong-ID and incompatible data;
oversized files; endpoint/client scope separation; filesystem write/rename
failure; preservation of the previous file and temporary cleanup; rejection of
provider errors and invalid XML/IDs; concurrent success/failure coalescing;
later explicit success after a shared failure; and persistence configuration.
Existing MCP fixture tests explicitly disable shared disk persistence to keep
their synthetic data isolated. All upstream responses are synthetic; no live
AniDB response or catalog completeness is claimed by these tests.
