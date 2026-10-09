import type { AnimeRecord } from "../domain/anime.js";

/**
 * A deliberately bounded subset of AniDB episode-list notation.
 *
 * AniDB supplies per-character <episodes> as a raw string, not an immutable,
 * independently verified list of scene appearances. Preserve the original;
 * never invent negative evidence from missing or unrecognized tokens.
 *
 * Supported: 1, 02, S1, C2, T3, P4, O5, and same-kind finite ranges such as
 * 1-3 or S1-S3, with comma-separated terms.
 */
const TYPE_PREFIX: Readonly<Record<number, string>> = {
  1: "", 2: "S", 3: "C", 4: "T", 5: "P", 6: "O"
};
const TOKEN = /^([SCTPO]?)([1-9]\d{0,5})$/i;
const MAX_REFERENCES = 256;
const MAX_RAW_LENGTH = 4096;

export type AppearanceParseStatus = "unknown" | "complete" | "partial";
export type AppearanceCoverage = "unknown" | "all_references_listed" |
  "some_references_unlisted";

export interface CharacterEpisodeEvidence {
  raw: string | null;
  /** Complete means supported tokens parsed, NOT that source data is exhaustive. */
  parseStatus: AppearanceParseStatus;
  coverage: AppearanceCoverage;
  /** Typed AniDB episode identifiers, canonicalized without leading zeroes. */
  references: string[];
  /** AniDB EIDs corresponding to positive references listed in the SAME anime. */
  linkedEpisodeIds: number[];
  /** Parsed references absent from the source anime's episode metadata. */
  unresolvedReferences: string[];
  /** Unsupported/ambiguous tokens preserved rather than guessed. */
  unparsedTokens: string[];
  sourceEpisodeMetadataCount: number;
}

function canonical(token: string): string | null {
  const match = TOKEN.exec(token.trim());
  if (!match) return null;
  const n = Number(match[2]);
  if (!Number.isSafeInteger(n) || n <= 0) return null;
  return (match[1] ?? "").toUpperCase() + String(n);
}

function sourceEpisodeKey(episode: AnimeRecord["episodes"][number]): string | null {
  const number = episode.number.trim();
  const key = canonical(number);
  if (!key) return null;
  const prefixFromKind = episode.kind === null ? null : TYPE_PREFIX[episode.kind];
  if (prefixFromKind === undefined) return null;
  if (prefixFromKind === null) return key;
  if (/^[SCTPO]/i.test(key)) {
    // If the prefix contradicts the explicit type, do not fabricate a join.
    if (key[0] !== prefixFromKind) return null;
    return key;
  }
  return prefixFromKind + key;
}

export function normalizeCharacterEpisodeAppearances(
  anime: AnimeRecord,
  raw: string | null
): CharacterEpisodeEvidence {
  const base = {
    raw,
    references: [] as string[],
    linkedEpisodeIds: [] as number[],
    unresolvedReferences: [] as string[],
    unparsedTokens: [] as string[],
    sourceEpisodeMetadataCount: anime.episodes.length
  };
  if (!raw || !raw.trim()) {
    return { ...base, parseStatus: "unknown", coverage: "unknown" };
  }
  if (raw.length > MAX_RAW_LENGTH) {
    return {
      ...base,
      parseStatus: "partial",
      coverage: "unknown",
      unparsedTokens: ["Source episode-list length exceeds supported limit"]
    };
  }

  const refs = new Set<string>();
  for (const part of raw.split(",")) {
    const token = part.trim();
    if (!token) {
      base.unparsedTokens.push(part);
      continue;
    }
    const single = canonical(token);
    if (single) {
      if (refs.size >= MAX_REFERENCES && !refs.has(single)) {
        base.unparsedTokens.push(token);
      } else {
        refs.add(single);
      }
      continue;
    }
    const parts = token.split("-");
    if (parts.length !== 2) {
      base.unparsedTokens.push(token);
      continue;
    }
    const start = canonical(parts[0]!);
    const end = canonical(parts[1]!);
    if (!start || !end) {
      base.unparsedTokens.push(token);
      continue;
    }
    const prefixStart = /^([SCTPO]?)/.exec(start)![1]!;
    const prefixEnd = /^([SCTPO]?)/.exec(end)![1]!;
    const startNum = Number(start.slice(prefixStart.length));
    const endNum = Number(end.slice(prefixEnd.length));
    if (
      prefixStart !== prefixEnd ||
      startNum > endNum ||
      endNum - startNum + 1 > MAX_REFERENCES ||
      refs.size + (endNum - startNum + 1) > MAX_REFERENCES
    ) {
      base.unparsedTokens.push(token);
      continue;
    }
    for (let value = startNum; value <= endNum; value++) {
      refs.add(prefixStart + value);
    }
  }

  base.references = [...refs];
  const listed = new Map<string, number[]>();
  for (const episode of anime.episodes) {
    const key = sourceEpisodeKey(episode);
    if (!key) continue;
    const ids = listed.get(key) ?? [];
    ids.push(episode.id);
    listed.set(key, ids);
  }
  const linked = new Set<number>();
  for (const key of base.references) {
    const matches = listed.get(key);
    if (matches?.length) {
      for (const id of matches) linked.add(id);
    } else {
      base.unresolvedReferences.push(key);
    }
  }
  base.linkedEpisodeIds = [...linked];

  return {
    ...base,
    parseStatus: base.unparsedTokens.length ? "partial" : "complete",
    coverage: anime.episodes.length === 0 || base.references.length === 0
      ? "unknown"
      : base.unresolvedReferences.length
        ? "some_references_unlisted" : "all_references_listed"
  };
}
