import type { AniDbConfig } from "../config.js";
import { animeRecordSchema, type AnimeRecord } from "../domain/anime.js";
import { ProviderLookupError } from "../domain/provider-error.js";
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
    let value: AnimeRecord;
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

    this.cache.set(anidbId, {
      expiresAt: Date.now() + this.config.cacheTtlMs,
      value
    });

    return value;
  }
}

