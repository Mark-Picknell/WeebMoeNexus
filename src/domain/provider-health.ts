import * as z from "zod/v4";
import { ProviderLookupError, providerErrorSchema } from "./provider-error.js";

export const providerConfigurationSchema = z.enum(["ready", "not_configured", "invalid_configuration"]);
export type ProviderConfiguration = z.infer<typeof providerConfigurationSchema>;
export const OBSERVATION_STALE_AFTER_MS = 300_000;

const safeFailureSchema = z.strictObject({
  code: z.union([providerErrorSchema.shape.code, z.literal("unknown")]),
  reason: z.union([providerErrorSchema.shape.reason, z.literal("unknown")]),
  httpStatus: providerErrorSchema.shape.httpStatus,
  apiCode: providerErrorSchema.shape.apiCode,
  retried: z.literal(false)
});
export const providerObservationSchema = z.discriminatedUnion("outcome", [
  z.strictObject({ outcome: z.literal("validated_success"), observedAt: z.iso.datetime({ offset: true }), networkAttempted: z.literal("yes") }),
  z.strictObject({ outcome: z.literal("failed"), observedAt: z.iso.datetime({ offset: true }), networkAttempted: z.enum(["yes", "no", "unknown"]), error: safeFailureSchema })
]);
export type ProviderObservation = z.infer<typeof providerObservationSchema>;

export const providerOperationHealthSchema = z.strictObject({
  scope: z.literal("anime_http_reads"),
  configuration: providerConfigurationSchema,
  activeProbe: z.literal(false),
  observation: providerObservationSchema.nullable(),
  freshness: z.enum(["unobserved", "recent", "stale", "clock_uncertain"]),
  ageMs: z.number().int().nonnegative().nullable(),
  staleAfterMs: z.literal(OBSERVATION_STALE_AFTER_MS)
}).superRefine((value, ctx) => {
  if (value.observation === null) {
    if (value.freshness !== "unobserved" || value.ageMs !== null) ctx.addIssue({ code: "custom", message: "An unobserved operation has no age or freshness claim" });
  } else if (value.freshness === "clock_uncertain") {
    if (value.ageMs !== null) ctx.addIssue({ code: "custom", message: "Clock uncertainty cannot expose a reliable age" });
  } else if (value.ageMs === null || value.freshness !== (value.ageMs < OBSERVATION_STALE_AFTER_MS ? "recent" : "stale")) {
    ctx.addIssue({ code: "custom", message: "Observed freshness must agree with the age threshold" });
  }
});
export type ProviderOperationHealth = z.infer<typeof providerOperationHealthSchema>;

/** Process-local observation only. Recording never fetches or retries anything. */
export class ProviderOperationHealthTracker {
  private last: ProviderObservation | null = null;
  constructor(private readonly now: () => number = Date.now) {}

  recordSuccess(): void {
    this.last = { outcome: "validated_success", observedAt: new Date(this.now()).toISOString(), networkAttempted: "yes" };
  }

  recordFailure(error: unknown): void {
    const observedAt = new Date(this.now()).toISOString();
    if (error instanceof ProviderLookupError) {
      const { code, reason, httpStatus, apiCode } = error.details;
      const safe = safeFailureSchema.safeParse({ code, reason, httpStatus, apiCode, retried: false });
      if (safe.success) {
        this.last = { outcome: "failed", observedAt,
        networkAttempted: ["missing_client", "invalid_configuration", "local_backoff", "local_capacity"].includes(reason) ? "no" : "yes",
          error: safe.data
        };
        return;
      }
    }
    // Malformed or unclassified diagnostic data must not replace the original
    // lookup error with an observer validation exception.
    this.last = { outcome: "failed", observedAt, networkAttempted: "unknown", error: { code: "unknown", reason: "unknown", httpStatus: null, apiCode: null, retried: false } };
  }

  snapshot(configuration: ProviderConfiguration): ProviderOperationHealth {
    const age = this.last === null ? null : this.now() - Date.parse(this.last.observedAt);
    const freshness = age === null ? "unobserved" : age < 0 ? "clock_uncertain" : age < OBSERVATION_STALE_AFTER_MS ? "recent" : "stale";
    return providerOperationHealthSchema.parse({ scope: "anime_http_reads", configuration, activeProbe: false,
      observation: this.last, freshness, ageMs: age !== null && age >= 0 ? age : null, staleAfterMs: OBSERVATION_STALE_AFTER_MS });
  }
}
