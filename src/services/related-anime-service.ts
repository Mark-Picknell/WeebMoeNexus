import type { AnimeRecord } from "../domain/anime.js";

export interface RelatedAnimeEdge {
  sourceAnimeId: number;
  targetAnimeId: number;
  /** Exactly as reported in the AniDB anime XML (possibly generic "related"). */
  relationType: string;
  /** Null means AniDB supplied no related-work title, not that no title exists. */
  targetTitle: string | null;
  /** Navigation link constructed from AniDB target ID; NOT evidence of a verified target read. */
  targetUrl: string;
  /** The source anime record that actually asserted the relation. */
  evidenceSourceUrl: string;
  retrievedAt: string;
}

export interface RelatedAnimeResult {
  sourceAnimeId: number;
  sourceTitle: string;
  sourceUrl: string;
  /** Distinguishes zero reported links from an assertion of no relationship. */
  reportedRelationCount: number;
  relations: RelatedAnimeEdge[];
}

/**
 * Project *direct, source-reported* AniDB related-anime edges.
 *
 * No reverse edges, inferred franchise membership, traversal, remote fetches
 * for target anime, or merging different relation types. Absence of reported
 * edges is absence of metadata only, not proof of no related works.
 */
export function getRelatedAnimeFromRecord(anime: AnimeRecord): RelatedAnimeResult {
  const source = anime.provenance.find(p =>
    p.provider === "anidb" && p.providerId === String(anime.id)
  );
  if (!source) {
    throw new Error("AniDB relationship data lacks matching source provenance");
  }

  const relations: RelatedAnimeEdge[] = anime.relations.map(relation => ({
    sourceAnimeId: anime.id,
    targetAnimeId: relation.id,
    relationType: relation.relation,
    targetTitle: relation.title,
    targetUrl: `https://anidb.net/anime/${relation.id}`,
    evidenceSourceUrl: source.sourceUrl,
    retrievedAt: source.retrievedAt
  }));

  return {
    sourceAnimeId: anime.id,
    sourceTitle: anime.preferredTitle,
    sourceUrl: source.sourceUrl,
    reportedRelationCount: relations.length,
    relations
  };
}
