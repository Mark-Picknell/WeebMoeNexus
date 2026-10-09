import { XMLParser } from "fast-xml-parser";
import type { AnimeRecord } from "../../domain/anime.js";

const parser = new XMLParser({
  ignoreAttributes: false,
  attributeNamePrefix: "@_",
  textNodeName: "#text",
  trimValues: true,
  parseTagValue: false,
  parseAttributeValue: false
});

function list<T>(value: T | T[] | undefined | null): T[] {
  if (value == null) return [];
  return Array.isArray(value) ? value : [value];
}

function text(value: unknown): string {
  if (value == null) return "";
  if (typeof value === "string" || typeof value === "number") return String(value);
  if (typeof value === "object" && "#text" in (value as Record<string, unknown>)) {
    return text((value as Record<string, unknown>)["#text"]);
  }
  return "";
}

function nullableText(value: unknown): string | null {
  const result = text(value).trim();
  return result.length ? result : null;
}

function nullableInt(value: unknown): number | null {
  const raw = nullableText(value);
  if (raw == null) return null;
  const parsed = Number.parseInt(raw, 10);
  return Number.isFinite(parsed) ? parsed : null;
}

function positiveInt(value: unknown, field: string): number {
  const parsed = nullableInt(value);
  if (parsed == null || parsed <= 0) {
    throw new Error(`AniDB response contained invalid ${field}`);
  }
  return parsed;
}

function attr(
  node: unknown,
  name: string
): string | null {
  if (!node || typeof node !== "object") return null;
  return nullableText((node as Record<string, unknown>)[`@_${name}`]);
}

export function mapAniDbAnimeXml(
  xml: string,
  retrievedAt = new Date().toISOString()
): AnimeRecord {
  const document = parser.parse(xml) as Record<string, unknown>;

  if ("error" in document) {
    throw new Error(`AniDB API error: ${text(document.error)}`);
  }

  const anime = document.anime as Record<string, any> | undefined;
  if (!anime) throw new Error("AniDB response did not contain an <anime> record.");

  const id = positiveInt(anime["@_id"], "anime id");

  const titles = list<any>(anime.titles?.title)
    .map((title) => ({
      language: attr(title, "xml:lang") ?? attr(title, "lang") ?? "und",
      kind: attr(title, "type") ?? "unknown",
      value: text(title).trim()
    }))
    .filter((title) => title.value.length > 0);

  const preferredTitle =
    titles.find((title) => title.kind === "main")?.value ??
    titles.find((title) => title.language === "en")?.value ??
    titles[0]?.value ??
    `AniDB #${id}`;

  const relations = list<any>(anime.relatedanime?.anime).map((relation) => ({
    id: positiveInt(relation["@_id"], "related anime id"),
    relation: attr(relation, "type") ?? "related",
    title: nullableText(relation)
  }));

  // AniDB supplies production credits as <creators><name id type>.
  // Keep every source row: one person/company can have multiple roles and
  // different contributors can share a romanized display name.
  const creators = list<any>(anime.creators?.name).map((creator) => {
    const rawId = attr(creator, "id");
    const id = rawId !== null && /^[1-9]\\d*$/.test(rawId)
      ? Number(rawId) : null;
    return {
      id: id !== null && Number.isSafeInteger(id) ? id : null,
      name: nullableText(creator),
      role: attr(creator, "type")
    };
  });

  const characters = list<any>(anime.characters?.character).map((character) => {
    const seiyuu = character.seiyuu;
    return {
      id: positiveInt(character["@_id"], "character id"),
      name: nullableText(character.name) ?? `AniDB character #${character["@_id"]}`,
      role: attr(character, "type"),
      gender: nullableText(character.gender),
      picture: nullableText(character.picture),
      episodeAppearancesRaw: nullableText(character.episodes),
      voiceActor: seiyuu
        ? {
            // Seiyuu IDs share AniDB's creator/person namespace; do not
            // convert invalid/malformed IDs into apparent identity matches.
            id: (() => {
              const rawId = attr(seiyuu, "id");
              if (!rawId || !/^[1-9]\\d*$/.test(rawId)) return null;
              const parsed = Number(rawId);
              return Number.isSafeInteger(parsed) ? parsed : null;
            })(),
            name: text(seiyuu).trim(),
            picture: attr(seiyuu, "picture")
          }
        : null
    };
  });

  const episodes = list<any>(anime.episodes?.episode).map((episode) => ({
    id: positiveInt(episode["@_id"], "episode id"),
    number: nullableText(episode.epno) ?? "?",
    kind: nullableInt(episode.epno?.["@_type"]),
    airDate: nullableText(episode.airdate),
    lengthMinutes: nullableInt(episode.length)
  }));

  return {
    id,
    titles,
    preferredTitle,
    type: nullableText(anime.type),
    episodeCount: nullableInt(anime.episodecount),
    startDate: nullableText(anime.startdate),
    endDate: nullableText(anime.enddate),
    restricted: String(anime["@_restricted"] ?? "0") === "1",
    description: nullableText(anime.description),
    picture: nullableText(anime.picture),
    url: nullableText(anime.url),
    relations,
    creators,
    characters,
    episodes,
    provenance: [
      {
        provider: "anidb",
        providerId: String(id),
        sourceUrl: `https://anidb.net/anime/${id}`,
        retrievedAt
      }
    ]
  };
}
