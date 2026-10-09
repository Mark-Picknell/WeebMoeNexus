import * as z from "zod/v4";

export const relationGraphInputSchema = z.object({
  anidbId: z.number().int().positive(),
  maxDepth: z.number().int().min(1).max(3).default(1)
    .describe("Maximum outgoing-link hops; records at this depth are not fetched"),
  maxNodes: z.number().int().min(1).max(50).default(20)
    .describe("Maximum returned distinct anime IDs, including the root"),
  maxEdges: z.number().int().min(1).max(200).default(100)
    .describe("Maximum returned source relation rows, including repeated typed links"),
  maxReads: z.number().int().min(1).max(10).default(5)
    .describe("Maximum source-record read attempts, including cached reads and the root")
});

export const relationGraphResultSchema = z.object({
  rootAnimeId: z.number().int().positive(),
  limits: relationGraphInputSchema.omit({ anidbId: true }),
  readAttempts: z.number().int().nonnegative(),
  recordsRead: z.number().int().nonnegative(),
  termination: z.enum([
    "exhausted", "depth_limit", "node_limit", "edge_limit", "read_limit", "source_read_failed"
  ]),
  truncated: z.boolean(),
  nodes: z.array(z.object({
    anidbId: z.number().int().positive(),
    depth: z.number().int().nonnegative(),
    // A name on an incoming edge is not a separately verified target title.
    title: z.string().nullable(),
    url: z.string().url(),
    recordRead: z.boolean(),
    relationsComplete: z.boolean()
  })),
  edges: z.array(z.object({
    sourceAnimeId: z.number().int().positive(),
    targetAnimeId: z.number().int().positive(),
    relationType: z.string(),
    targetTitle: z.string().nullable(),
    targetUrl: z.string().url(),
    evidenceSourceUrl: z.string().url(),
    retrievedAt: z.string()
  })),
  frontier: z.array(z.object({
    anidbId: z.number().int().positive(),
    depth: z.number().int().nonnegative(),
    reason: z.enum([
      "depth_limit", "node_limit", "edge_limit", "read_limit", "source_read_failed", "halted"
    ])
  })),
  failures: z.array(z.object({
    anidbId: z.number().int().positive(),
    code: z.literal("source_read_failed"),
    message: z.string()
  }))
});

export type RelationGraphInput = z.input<typeof relationGraphInputSchema>;
export type RelationGraphResult = z.infer<typeof relationGraphResultSchema>;
