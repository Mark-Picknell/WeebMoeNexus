import * as z from "zod/v4";

export const providerErrorSchema = z.object({
  provider: z.literal("anidb"),
  code: z.enum(["not_found", "banned", "unavailable", "outdated", "misconfigured"]),
  reason: z.enum([
    "missing_client", "invalid_configuration", "api_error", "rate_limited",
    "http_error", "network_error", "invalid_response", "local_backoff", "local_capacity"
  ]),
  message: z.string(),
  httpStatus: z.number().int().min(100).max(599).nullable(),
  apiCode: z.number().int().nonnegative().nullable(),
  retried: z.literal(false)
});

export type ProviderError = z.infer<typeof providerErrorSchema>;

/** Stable, sanitized provider details; raw bodies, URLs and causes are not exposed. */
export class ProviderLookupError extends Error {
  readonly details: ProviderError;

  constructor(details: Omit<ProviderError, "provider" | "retried">) {
    super(details.message);
    this.name = "ProviderLookupError";
    this.details = { provider: "anidb", retried: false, ...details };
  }
}

/** Success output schemas stay intact. MCP error results carry an additive envelope. */
export function providerErrorResult(error: ProviderLookupError) {
  return {
    isError: true as const,
    content: [{ type: "text" as const, text: error.message }],
    structuredContent: { error: error.details }
  };
}
