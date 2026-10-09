import { promises as fs } from "node:fs";
import { gunzipSync } from "node:zlib";
import { XMLParser, XMLValidator } from "fast-xml-parser";
import { validateTitleGzip } from "./title-dump.js";
import { aniDbTitleLookupKeys } from "./title-normalization.js";
import { boundedTitleEditDistance, titleEditBudget } from "./title-fuzzy.js";

/**
 * AniDB's officially published title-dump record. Keep the original spelling,
 * title kind and language: interpretation/normalization comes in P2-03.
 */
export interface AniDbTitle {
  value: string;
  language: string;
  kind: string;
}

export interface AniDbTitleRecord {
  anidbId: number;
  preferredTitle: string;
  titles: readonly AniDbTitle[];
}

export interface AniDbExactTitleMatch {
  anidbId: number;
  preferredTitle: string;
  matchedTitle: AniDbTitle;
}

export interface AniDbFuzzyTitleMatch extends AniDbExactTitleMatch {
  editDistance: number;
}

/**
 * In-memory index built entirely from the disk-cached dump.
 *
 * The exact-title map retains *all* hits, including independent anime that
 * share a title, and distinguishes multiple aliases for the same anime.
 * Normalized alias lookup keeps the original matched spelling and source ID.
 * P2-04 will add the MCP search surface.
 */
export class AniDbTitleIndex {
  readonly animeCount: number;
  readonly titleCount: number;

  constructor(
    private readonly byId: ReadonlyMap<number, AniDbTitleRecord>,
    private readonly byExactTitle: ReadonlyMap<string, readonly AniDbExactTitleMatch[]>,
    private readonly byNormalizedTitle: ReadonlyMap<string, readonly AniDbExactTitleMatch[]>,
    private readonly normalizedKeysByLength: ReadonlyMap<number, readonly string[]>,
    titleCount: number
  ) {
    this.animeCount = byId.size;
    this.titleCount = titleCount;
  }

  getAnime(anidbId: number): AniDbTitleRecord | null {
    return this.byId.get(anidbId) ?? null;
  }

  findExactTitle(value: string): readonly AniDbExactTitleMatch[] {
    return this.byExactTitle.get(value) ?? [];
  }

  /**
   * Match source-supplied Japanese, English, and romanized aliases after
   * conservative text normalization. Keep all colliding anime distinct.
   * One alias is returned once even when multiple lookup keys match it.
   */
  findNormalizedTitle(value: string): readonly AniDbExactTitleMatch[] {
    const matches: AniDbExactTitleMatch[] = [];
    const seen = new Set<AniDbExactTitleMatch>();
    for (const key of aniDbTitleLookupKeys(value)) {
      for (const hit of this.byNormalizedTitle.get(key) ?? []) {
        if (!seen.has(hit)) {
          seen.add(hit);
          matches.push(hit);
        }
      }
    }
    return matches;
  }

  /**
   * Return candidate aliases with a small bounded edit distance.
   * Search only nearby Unicode-codepoint length buckets, not every title on
   * each query. Original source records remain untouched and distinguishable.
   * The search service invokes this only if no deterministic alias matched.
   */
  findFuzzyTitle(value: string): readonly AniDbFuzzyTitleMatch[] {
    const distanceByHit = new Map<AniDbExactTitleMatch, number>();
    for (const queryKey of aniDbTitleLookupKeys(value)) {
      const keyLength = [...queryKey].length;
      const budget = titleEditBudget(keyLength);
      if (budget === 0) continue;

      for (let length = keyLength - budget; length <= keyLength + budget; length++) {
        for (const candidateKey of this.normalizedKeysByLength.get(length) ?? []) {
          if (candidateKey === queryKey) continue;
          const distance = boundedTitleEditDistance(queryKey, candidateKey, budget);
          if (distance === null || distance === 0) continue;
          for (const hit of this.byNormalizedTitle.get(candidateKey) ?? []) {
            const earlier = distanceByHit.get(hit);
            if (earlier === undefined || distance < earlier) {
              distanceByHit.set(hit, distance);
            }
          }
        }
      }
    }
    return [...distanceByHit.entries()]
      .map(([hit, editDistance]) => ({ ...hit, editDistance }))
      .sort((a, b) =>
        a.editDistance - b.editDistance ||
        a.anidbId - b.anidbId ||
        a.matchedTitle.value.localeCompare(b.matchedTitle.value)
      );
  }
}

const xmlParser = new XMLParser({
  ignoreAttributes: false,
  attributeNamePrefix: "@_",
  textNodeName: "#text",
  parseTagValue: false,
  parseAttributeValue: false,
  trimValues: true
});

type XmlNode = Record<string, unknown>;

function asArray(value: unknown): unknown[] {
  if (value == null) return [];
  return Array.isArray(value) ? value : [value];
}

function asNode(value: unknown): XmlNode | null {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    return null;
  }
  return value as XmlNode;
}

function textValue(value: unknown): string {
  if (typeof value === "string" || typeof value === "number") {
    return String(value).trim();
  }
  const node = asNode(value);
  return node ? textValue(node["#text"]) : "";
}

/** Parse XML from a *local* validated dump, without any network requests. */
export function parseAniDbTitleXml(xml: string): AniDbTitleIndex {
  const validity = XMLValidator.validate(xml);
  if (validity !== true) {
    throw new Error("AniDB title dump XML is malformed");
  }
  const root = asNode(xmlParser.parse(xml))?.animetitles;
  const parent = asNode(root);
  if (!parent) throw new Error("AniDB title dump requires an animetitles root");

  const byId = new Map<number, AniDbTitleRecord>();
  const exact = new Map<string, AniDbExactTitleMatch[]>();
  const normalized = new Map<string, AniDbExactTitleMatch[]>();
  let titleCount = 0;

  for (const rawAnime of asArray(parent.anime)) {
    const anime = asNode(rawAnime);
    if (!anime) throw new Error("AniDB title dump contains an invalid anime record");

    const rawId = String(anime["@_aid"] ?? "");
    const anidbId = Number(rawId);
    if (!/^[1-9]\d*$/.test(rawId) || !Number.isSafeInteger(anidbId)) {
      throw new Error("AniDB title dump contains an invalid anime ID");
    }
    if (byId.has(anidbId)) {
      throw new Error(`AniDB title dump repeats anime ID ${anidbId}`);
    }

    const titles: AniDbTitle[] = [];
    for (const rawTitle of asArray(anime.title)) {
      const title = asNode(rawTitle);
      if (!title) {
        throw new Error(`AniDB anime ${anidbId} has a title without metadata`);
      }
      const value = textValue(title);
      const language = textValue(title["@_xml:lang"]);
      const kind = textValue(title["@_type"]);
      if (!value || !language || !kind) {
        throw new Error(`AniDB anime ${anidbId} has incomplete title metadata`);
      }
      titles.push({ value, language, kind });
      titleCount++;
    }

    if (titles.length === 0) {
      throw new Error(`AniDB anime ${anidbId} has no titles`);
    }
    // The source's main romanized title is authoritative when present.
    // English is a presentation fallback only, not a replacement for main.
    const preferredTitle =
      titles.find(title => title.kind === "main")?.value ??
      titles.find(title => title.language === "en")?.value ??
      titles[0]!.value;
    const record: AniDbTitleRecord = {
      anidbId,
      preferredTitle,
      titles
    };
    byId.set(anidbId, record);
    for (const matchedTitle of titles) {
      const hit = { anidbId, preferredTitle, matchedTitle };
      const matches = exact.get(matchedTitle.value) ?? [];
      matches.push(hit);
      exact.set(matchedTitle.value, matches);
      for (const key of aniDbTitleLookupKeys(matchedTitle.value)) {
        const keyMatches = normalized.get(key) ?? [];
        keyMatches.push(hit);
        normalized.set(key, keyMatches);
      }
    }
  }

  if (byId.size === 0) throw new Error("AniDB title dump contains no anime");
  const lengthBuckets = new Map<number, string[]>();
  for (const key of normalized.keys()) {
    const length = [...key].length;
    const bucket = lengthBuckets.get(length) ?? [];
    bucket.push(key);
    lengthBuckets.set(length, bucket);
  }
  return new AniDbTitleIndex(byId, exact, normalized, lengthBuckets, titleCount);
}

/**
 * Load a gzip already downloaded by AniDbTitleDumpCache.
 * No calls to AniDB or arbitrary URLs. Size checks guard memory use.
 */
export async function loadAniDbTitleIndex(filePath: string): Promise<AniDbTitleIndex> {
  const compressed = await fs.readFile(filePath);
  validateTitleGzip(compressed);
  const xml = gunzipSync(compressed, { maxOutputLength: 128 * 1024 * 1024 });
  return parseAniDbTitleXml(xml.toString("utf8"));
}
