import { promises as fs } from "node:fs";
import { gunzipSync } from "node:zlib";
import { XMLParser, XMLValidator } from "fast-xml-parser";
import { validateTitleGzip } from "./title-dump.js";

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

/**
 * In-memory index built entirely from the disk-cached dump.
 *
 * The exact-title map retains *all* hits, including independent anime that
 * share a title, and distinguishes multiple aliases for the same anime.
 * P2-03/P2-04 will add text normalization and an MCP search surface.
 */
export class AniDbTitleIndex {
  readonly animeCount: number;
  readonly titleCount: number;

  constructor(
    private readonly byId: ReadonlyMap<number, AniDbTitleRecord>,
    private readonly byExactTitle: ReadonlyMap<string, readonly AniDbExactTitleMatch[]>,
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
      const matches = exact.get(matchedTitle.value) ?? [];
      matches.push({ anidbId, preferredTitle, matchedTitle });
      exact.set(matchedTitle.value, matches);
    }
  }

  if (byId.size === 0) throw new Error("AniDB title dump contains no anime");
  return new AniDbTitleIndex(byId, exact, titleCount);
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
