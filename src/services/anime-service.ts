import type { AniDbConfig } from "../config.js";
import { animeRecordSchema, type AnimeRecord } from "../domain/anime.js";
import { ProviderLookupError } from "../domain/provider-error.js";
import { AniDbClient } from "../providers/anidb/client.js";
import { mapAniDbAnimeXml } from "../providers/anidb/mapper.js";
import { AniDbAnimeCache, type AnimeCacheEntry } from "../providers/anidb/anime-cache.js";
import { ProviderOperationHealthTracker, type ProviderOperationHealth } from "../domain/provider-health.js";

export class AnimeService {
  private readonly anidb: AniDbClient;
  private readonly cache = new Map<number, AnimeCacheEntry>();
  private readonly cacheSizes = new Map<number, number>();
  private cacheBytes = 0;
  private readonly diskCache: AniDbAnimeCache | null;
  private readonly inFlight = new Map<number, Promise<AnimeRecord>>();
  private readonly now: () => number;
  private readonly health: ProviderOperationHealthTracker;

  private remember(anidbId: number, entry: AnimeCacheEntry): void {
    const size = Buffer.byteLength(JSON.stringify(entry), "utf8");
    const previous = this.cacheSizes.get(anidbId) ?? 0;
    this.cache.delete(anidbId); this.cacheSizes.delete(anidbId); this.cacheBytes -= previous;
    if (size > 16 * 1024 * 1024) return;
    while (this.cache.size >= 256 || this.cacheBytes + size > 16 * 1024 * 1024) {
      const oldest = this.cache.keys().next().value!;
      this.cacheBytes -= this.cacheSizes.get(oldest)!;
      this.cache.delete(oldest); this.cacheSizes.delete(oldest);
    }
    this.cache.set(anidbId, entry); this.cacheSizes.set(anidbId, size); this.cacheBytes += size;
  }

  constructor(private readonly config: AniDbConfig, options: { now?: () => number } = {}) {
    this.now = options.now ?? Date.now;
    this.anidb = new AniDbClient(config, this.now);
    this.diskCache = config.cacheDirectory?.trim() ? new AniDbAnimeCache(config) : null;
    this.health = new ProviderOperationHealthTracker(this.now);
  }

  get anidbConfigured(): boolean {
    return this.anidb.configured;
  }

  /** Inspection is passive: no provider request or cache read is triggered. */
  getProviderHealth(): ProviderOperationHealth {
    return this.health.snapshot(this.anidb.configurationState);
  }

  async getByAniDbId(anidbId: number): Promise<AnimeRecord> {
    const cached = this.cache.get(anidbId);
    if (cached && cached.expiresAt > this.now() && cached.cachedAt <= this.now()) {
      return cached.value;
    }
    if (cached) {
      this.cache.delete(anidbId); this.cacheBytes -= this.cacheSizes.get(anidbId)!; this.cacheSizes.delete(anidbId);
    }

    const pending = this.inFlight.get(anidbId);
    if (pending) return pending;
    const request = this.load(anidbId).finally(() => this.inFlight.delete(anidbId));
    this.inFlight.set(anidbId, request);
    return request;
  }

  private async load(anidbId: number): Promise<AnimeRecord> {
    const persisted = await this.diskCache?.read(anidbId, this.now());
    // Recheck after asynchronous I/O; an entry can expire during a read.
    if (persisted && persisted.expiresAt > this.now() && persisted.cachedAt <= this.now()) {
      this.remember(anidbId, persisted);
      return persisted.value;
    }

    let value: AnimeRecord;
    try {
      const xml = await this.anidb.getAnimeXml(anidbId);
      try {
        value = animeRecordSchema.parse(mapAniDbAnimeXml(xml));
        if (value.id !== anidbId) throw new Error("Source ID mismatch");
      } catch {
        throw new ProviderLookupError({
          code: "unavailable", reason: "invalid_response",
          message: "AniDB response could not be validated for the requested anime. No retry was attempted.",
          httpStatus: null, apiCode: null
        });
      }
      this.health.recordSuccess();
    } catch (error) {
      this.health.recordFailure(error);
      throw error;
    }

    const cachedAt = this.now();
    const entry = { cachedAt, expiresAt: cachedAt + this.config.cacheTtlMs, value };
    this.remember(anidbId, entry);
    if (this.diskCache && !await this.diskCache.write(anidbId, entry)) {
      console.warn("AniDB disk cache write failed; validated result remains available in memory.");
    }

    return value;
  }
}
