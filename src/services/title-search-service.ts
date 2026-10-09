import { promises as fs } from "node:fs";
import { resolve } from "node:path";
import type { AniDbExactTitleMatch, AniDbTitleIndex } from "../providers/anidb/title-index.js";
import { loadAniDbTitleIndex } from "../providers/anidb/title-index.js";

export const DEFAULT_TITLE_INDEX_PATH = ".cache/anidb/anime-titles.xml.gz";

export interface AnimeTitleCandidate {
  anidbId: number;
  title: string;
  matchedTitle: string;
  matchedLanguage: string;
  matchedKind: string;
  matchType: "exact" | "normalized" | "fuzzy";
  /** Present only for fuzzy results; a measured character edit distance. */
  editDistance?: number;
  sourceUrl: string;
}

export interface AnimeTitleSearchResult {
  query: string;
  totalMatches: number;
  results: AnimeTitleCandidate[];
}

/**
 * Exact and normalized aliases take priority over conservative fuzzy fallback.
 * No invented romanization, character search, or HTTP calls.
 * One candidate per distinct AniDB ID.
 */
export function searchAniDbTitles(
  index: AniDbTitleIndex,
  query: string,
  limit: number
): AnimeTitleSearchResult {
  const trimmed = query.trim();
  if (!trimmed || trimmed.length > 160) {
    throw new RangeError("Title search query must contain 1–160 characters");
  }
  if (!Number.isInteger(limit) || limit < 1 || limit > 25) {
    throw new RangeError("Title search limit must be an integer between 1 and 25");
  }

  const byId = new Map<number, AnimeTitleCandidate>();
  const add = (
    hit: AniDbExactTitleMatch,
    matchType: AnimeTitleCandidate["matchType"],
    editDistance?: number
  ) => {
    // Source titles may duplicate and normalize to identical values;
    // keep a single anime with the strongest available match.
    if (byId.has(hit.anidbId)) return;
    byId.set(hit.anidbId, {
      anidbId: hit.anidbId,
      title: hit.preferredTitle,
      matchedTitle: hit.matchedTitle.value,
      matchedLanguage: hit.matchedTitle.language,
      matchedKind: hit.matchedTitle.kind,
      matchType,
      ...(editDistance === undefined ? {} : { editDistance }),
      sourceUrl: `https://anidb.net/anime/${hit.anidbId}`
    });
  };

  // The two passes make literal matches outrank normalized matches.
  for (const hit of index.findExactTitle(trimmed)) add(hit, "exact");
  for (const hit of index.findNormalizedTitle(trimmed)) add(hit, "normalized");
  // Only use typo tolerance when no deterministic alias matched at all:
  // do not pollute exact results with superficially similar identities.
  if (byId.size === 0) {
    for (const hit of index.findFuzzyTitle(trimmed)) {
      add(hit, "fuzzy", hit.editDistance);
    }
  }

  // Within a given match class the result ordering is source-independent and
  // stable across dump reorderings. Never rank synonyms as proof of identity.
  const ordered = [...byId.values()].sort((a, b) => {
    const rank = { exact: 0, normalized: 1, fuzzy: 2 } as const;
    if (a.matchType !== b.matchType) return rank[a.matchType] - rank[b.matchType];
    if (a.matchType === "fuzzy" && b.matchType === "fuzzy") {
      const difference = (a.editDistance ?? 4) - (b.editDistance ?? 4);
      if (difference !== 0) return difference;
    }
    return a.anidbId - b.anidbId;
  });
  return { query: trimmed, totalMatches: ordered.length, results: ordered.slice(0, limit) };
}

/** Local disk title-index reader with lazy initialization and mtime invalidation. */
export class LocalAnimeTitleSearch {
  private cached: {
    mtimeMs: number;
    size: number;
    index: AniDbTitleIndex;
  } | null = null;
  private loading: Promise<AniDbTitleIndex> | null = null;
  private readonly path: string;

  constructor(path = process.env.ANIDB_TITLE_DUMP_CACHE_PATH ?? DEFAULT_TITLE_INDEX_PATH) {
    this.path = resolve(path);
  }

  async search(query: string, limit = 10): Promise<AnimeTitleSearchResult> {
    // Reject an invalid request before any disk access.
    if (!query.trim() || query.trim().length > 160) {
      throw new RangeError("Title search query must contain 1–160 characters");
    }
    if (!Number.isInteger(limit) || limit < 1 || limit > 25) {
      throw new RangeError("Title search limit must be an integer between 1 and 25");
    }
    const index = await this.getIndex();
    return searchAniDbTitles(index, query, limit);
  }

  private async getIndex(): Promise<AniDbTitleIndex> {
    let info;
    try {
      info = await fs.stat(this.path);
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === "ENOENT") {
        throw new Error(
          "AniDB title index is not cached locally. Run 'npm run titles:refresh' before searching."
        );
      }
      throw error;
    }
    if (!info.isFile()) throw new Error("AniDB title index cache path is not a file");
    if (this.cached && this.cached.mtimeMs === info.mtimeMs && this.cached.size === info.size) {
      return this.cached.index;
    }
    if (this.loading) return this.loading;
    const mtimeMs = info.mtimeMs;
    const size = info.size;
    this.loading = loadAniDbTitleIndex(this.path).then(index => {
      this.cached = { mtimeMs, size, index };
      return index;
    }).finally(() => {
      this.loading = null;
    });
    return this.loading;
  }
}
