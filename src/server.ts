import { McpServer } from "@modelcontextprotocol/server";
import * as z from "zod/v4";
import { loadAniDbConfig } from "./config.js";
import { animeRecordSchema } from "./domain/anime.js";
import { AnimeService } from "./services/anime-service.js";

const service = new AnimeService(loadAniDbConfig());

export function buildServer(): McpServer {
  const server = new McpServer(
    {
      name: "weeb-moe-nexus",
      version: "0.1.0"
    },
    {
      instructions:
        "Use WeebMoeNexus for anime metadata and relationship lookup. Prefer stable IDs when known. AniDB is rate-limited and cached; do not repeatedly call the same lookup just to re-check an unchanged answer."
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

  return server;
}
