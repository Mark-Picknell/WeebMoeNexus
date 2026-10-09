import { createHash, randomUUID } from "node:crypto";
import { promises as fs } from "node:fs";
import { resolve } from "node:path";
import * as z from "zod/v4";
import type { AniDbConfig } from "../../config.js";
import { animeRecordSchema, type AnimeRecord } from "../../domain/anime.js";

export const MAX_ANIME_CACHE_BYTES = 8 * 1024 * 1024;
export interface AnimeCacheEntry {
  cachedAt: number;
  expiresAt: number;
  value: AnimeRecord;
}

// Bump when normalization/evidence semantics change, even if Zod still accepts
// the old shape. Cache data is disposable; it is not a source of new evidence.
const envelopeSchema = z.object({
  version: z.literal(1),
  scope: z.string(),
  cachedAt: z.number().int().nonnegative().safe(),
  expiresAt: z.number().int().positive().safe(),
  value: animeRecordSchema
});

/** Local, best-effort success cache. No negative entries or stale fallback. */
export class AniDbAnimeCache {
  private readonly directory: string;
  private readonly scope: string;

  constructor(private readonly config: AniDbConfig) {
    // Partition custom endpoints and client identities without storing their
    // configuration or authentication material in cache filenames/content.
    this.scope = createHash("sha256").update(JSON.stringify([
      config.apiUrl, config.client.trim(), config.clientVersion, 1
    ])).digest("hex");
    this.directory = resolve(config.cacheDirectory!, this.scope);
  }

  private path(id: number): string {
    if (!Number.isSafeInteger(id) || id <= 0) throw new Error("Invalid cache key");
    return resolve(this.directory, `${id}.json`);
  }

  async read(id: number, now: number): Promise<AnimeCacheEntry | null> {
    let handle: Awaited<ReturnType<typeof fs.open>> | undefined;
    try {
      handle = await fs.open(this.path(id), "r");
      const info = await handle.stat();
      if (!info.isFile() || info.size <= 0 || info.size > MAX_ANIME_CACHE_BYTES) return null;
      // One extra byte detects growth without allocating an unbounded read.
      const buffer = Buffer.alloc(info.size + 1);
      let length = 0;
      while (length < buffer.length) {
        const { bytesRead } = await handle.read(buffer, length, buffer.length - length, length);
        if (bytesRead === 0) break;
        length += bytesRead;
      }
      if (length !== info.size) return null;
      const parsed = envelopeSchema.safeParse(JSON.parse(buffer.subarray(0, length).toString("utf8")));
      if (!parsed.success) return null;
      const entry = parsed.data;
      if (entry.scope !== this.scope || entry.value.id !== id || entry.cachedAt > now ||
          entry.expiresAt <= entry.cachedAt || entry.value.provenance.length !== 1) return null;
      const source = entry.value.provenance[0]!;
      if (source.providerId !== String(id) || source.sourceUrl !== `https://anidb.net/anime/${id}` ||
          !Number.isFinite(Date.parse(source.retrievedAt))) return null;
      // A shorter configured TTL applies immediately. A longer TTL never
      // extends the original envelope expiry or resets age on restart.
      const expiresAt = Math.min(entry.expiresAt, entry.cachedAt + this.config.cacheTtlMs);
      if (!Number.isFinite(expiresAt) || expiresAt <= now) return null;
      return { cachedAt: entry.cachedAt, expiresAt, value: entry.value };
    } catch {
      // Missing, corrupt, unreadable and incompatible files are cache misses.
      return null;
    } finally {
      await handle?.close().catch(() => {});
    }
  }

  async write(id: number, entry: AnimeCacheEntry): Promise<boolean> {
    let temporary: string | undefined;
    try {
      const path = this.path(id);
      const envelope = envelopeSchema.parse({ version: 1, scope: this.scope, ...entry });
      if (envelope.value.id !== id) return false;
      const body = JSON.stringify(envelope);
      if (Buffer.byteLength(body, "utf8") > MAX_ANIME_CACHE_BYTES) return false;
      await fs.mkdir(this.directory, { recursive: true, mode: 0o700 });
      temporary = `${path}.${randomUUID()}.tmp`;
      await fs.writeFile(temporary, body, { encoding: "utf8", flag: "wx", mode: 0o600 });
      // Same-directory rename publishes a complete entry; never truncate the
      // last file in place. This does not promise power-loss durability.
      await fs.rename(temporary, path);
      return true;
    } catch {
      return false;
    } finally {
      if (temporary) await fs.unlink(temporary).catch(() => {});
    }
  }
}
