import { McpServer } from "@modelcontextprotocol/server";
import * as z from "zod/v4";
import { loadAniDbConfig } from "./config.js";
import { animeRecordSchema } from "./domain/anime.js";
import { AnimeService } from "./services/anime-service.js";
import { LocalAnimeTitleSearch } from "./services/title-search-service.js";
import { getRelatedAnimeFromRecord } from "./services/related-anime-service.js";

const service = new AnimeService(loadAniDbConfig());

export function buildServer(): McpServer {
  // The MCP HTTP transport calls this zero-argument factory with a request
  // context, so do not repurpose its parameter for test dependency injection.
  const titleSearch = new LocalAnimeTitleSearch();
  const server = new McpServer(
    {
      name: "weeb-moe-nexus",
      version: "0.1.0"
    },
    {
      instructions:
        "Use WeebMoeNexus for anime metadata and relationship lookup. search_anime matches locally cached AniDB titles and aliases, with a conservative typo fallback, not character names. Prefer stable IDs when known. AniDB is rate-limited and cached; do not repeatedly call the same lookup just to re-check an unchanged answer."
    }
  );

  server.registerTool(
    "health",
    {
      title: "Check WeebMoeNexus health",
      description:
        "Check whether the WeebMoeNexus MCP server is running and whether the AniDB provider is configured.",
      inputSchema: z.object({}),
      outputSchema: z.object({
        name: z.literal("weeb-moe-nexus"),
        status: z.literal("ok"),
        anidbConfigured: z.boolean()
      }),
      annotations: {
        readOnlyHint: true,
        idempotentHint: true,
        destructiveHint: false,
        openWorldHint: false
      }
    },
    async () => {
      const output = {
        name: "weeb-moe-nexus" as const,
        status: "ok" as const,
        anidbConfigured: service.anidbConfigured
      };

      return {
        content: [{ type: "text", text: JSON.stringify(output) }],
        structuredContent: output
      };
    }
  );

  server.registerTool(
    "get_anime_by_anidb_id",
    {
      title: "Get anime by AniDB ID",
      description:
        "Fetch one anime by its numeric AniDB ID. Returns normalized titles, dates, relations, characters, episodes, restricted-content metadata, and provenance.",
      inputSchema: z.object({
        anidbId: z.number().int().positive().describe("Numeric AniDB anime ID")
      }),
      outputSchema: animeRecordSchema,
      annotations: {
        readOnlyHint: true,
        idempotentHint: true,
        destructiveHint: false,
        openWorldHint: true
      }
    },
    async ({ anidbId }) => {
      try {
        const output = await service.getByAniDbId(anidbId);
        return {
          content: [
            {
              type: "text",
              text: `${output.preferredTitle} (AniDB #${output.id})`
            }
          ],
          structuredContent: output
        };
      } catch (error) {
        const message =
          error instanceof Error ? error.message : "Unknown AniDB lookup failure";

        return {
          isError: true,
          content: [{ type: "text", text: message }]
        };
      }
    }
  );

  server.registerTool(
    "search_anime",
    {
      title: "Search anime by title",
      description:
        "Search a locally cached AniDB title dump by exact and normalized titles (Japanese, English and romaji aliases), falling back to conservative typo matching only when no deterministic alias matches. Returns distinct anime IDs, matched source titles, and edit distance for fuzzy results. Never searches character names. Run 'npm run titles:refresh' to initialize the offline title cache.",
      inputSchema: z.object({
        query: z.string().trim().min(1).max(160).describe("Anime title or title alias"),
        limit: z.number().int().min(1).max(25).default(10)
          .describe("Maximum distinct anime candidates to return")
      }),
      outputSchema: z.object({
        query: z.string(),
        totalMatches: z.number().int().nonnegative(),
        results: z.array(z.object({
          anidbId: z.number().int().positive(),
          title: z.string(),
          matchedTitle: z.string(),
          matchedLanguage: z.string(),
          matchedKind: z.string(),
          matchType: z.enum(["exact", "normalized", "fuzzy"]),
          editDistance: z.number().int().positive().optional(),
          sourceUrl: z.string().url()
        }))
      }),
      annotations: {
        readOnlyHint: true,
        idempotentHint: true,
        destructiveHint: false,
        openWorldHint: false
      }
    },
    async ({ query, limit }) => {
      try {
        const output = await titleSearch.search(query, limit);
        return {
          content: [{
            type: "text",
            text: output.totalMatches === 0
              ? `No locally indexed AniDB title aliases or conservative typo candidates matched "${output.query}". This does not prove the anime does not exist.`
              : `Found ${output.totalMatches} distinct indexed AniDB anime candidate(s) for "${output.query}" (showing ${output.results.length}).`
          }],
          structuredContent: output
        };
      } catch (error) {
        return {
          isError: true,
          content: [{
            type: "text",
            text: error instanceof Error ? error.message : "Unknown title search failure"
          }]
        };
      }
    }
  );

  server.registerTool(
    "get_related_anime",
    {
      title: "Get direct anime relationships from AniDB",
      description:
        "Read AniDB's directly reported related-anime links for one source anime ID. Returns original relation labels, optional related-work titles, AniDB IDs and per-edge source provenance. Does not infer reverse links, traverse a franchise graph, or fetch related targets. Missing links mean no relations were reported in this source response, not proof no relationships exist.",
      inputSchema: z.object({
        anidbId: z.number().int().positive()
          .describe("Source anime's AniDB ID")
      }),
      outputSchema: z.object({
        sourceAnimeId: z.number().int().positive(),
        sourceTitle: z.string(),
        sourceUrl: z.string().url(),
        reportedRelationCount: z.number().int().nonnegative(),
        relations: z.array(z.object({
          sourceAnimeId: z.number().int().positive(),
          targetAnimeId: z.number().int().positive(),
          relationType: z.string(),
          targetTitle: z.string().nullable(),
          targetUrl: z.string().url(),
          evidenceSourceUrl: z.string().url(),
          retrievedAt: z.string()
        }))
      }),
      annotations: {
        readOnlyHint: true,
        idempotentHint: true,
        destructiveHint: false,
        openWorldHint: true
      }
    },
    async ({ anidbId }) => {
      try {
        // Uses the existing paced AniDB client + normalized anime cache.
        // Do not fetch linked targets; this operation reports one source's
        // explicit, directed assertions only.
        const anime = await service.getByAniDbId(anidbId);
        const output = getRelatedAnimeFromRecord(anime);
        return {
          content: [{
            type: "text",
            text: output.reportedRelationCount === 0
              ? `AniDB's source record for ${output.sourceTitle} (#${anidbId}) does not report related anime. That does not establish that none exist.`
              : `AniDB reports ${output.reportedRelationCount} direct relation(s) for ${output.sourceTitle} (#${anidbId}); relation labels and targets are source data, not inferred identities.`
          }],
          structuredContent: output
        };
      } catch (error) {
        return {
          isError: true,
          content: [{
            type: "text",
            text: error instanceof Error ? error.message : "Unknown AniDB relation lookup failure"
          }]
        };
      }
    }
  );

  return server;
}
