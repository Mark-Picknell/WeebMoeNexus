import type { AniDbConfig } from "../config.js";
import type { AnimeRecord } from "../domain/anime.js";
import { AniDbClient } from "../providers/anidb/client.js";
import { mapAniDbAnimeXml } from "../providers/anidb/mapper.js";

interface CacheEntry {
  expiresAt: number;
  value: AnimeRecord;
}

export class AnimeService {
  private readonly anidb: AniDbClient;
  private readonly cache = new Map<number, CacheEntry>();

  constructor(private readonly config: AniDbConfig) {
    this.anidb = new AniDbClient(config);
  }

  get anidbConfigured(): boolean {
    return this.anidb.configured;
  }

  async getByAniDbId(anidbId: number): Promise<AnimeRecord> {
    const cached = this.cache.get(anidbId);
    if (cached && cached.expiresAt > Date.now()) {
      return cached.value;
    }

    const xml = await this.anidb.getAnimeXml(anidbId);
    const value = mapAniDbAnimeXml(xml);

    this.cache.set(anidbId, {
      expiresAt: Date.now() + this.config.cacheTtlMs,
      value
    });

    return value;
  }
}
