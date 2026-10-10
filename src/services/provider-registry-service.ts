import { providerRegistryResultSchema, type ProviderDeclaration, type ProviderRegistryResult } from "../domain/provider-registry.js";
import type { ProviderOperationHealth } from "../domain/provider-health.js";

export interface RegisteredProviderStatusSource {
  declaration(): ProviderDeclaration;
  health(): ProviderOperationHealth;
}

/** Read explicitly registered adapters only. No auto-discovery or active probes. */
export function getProviderRegistry(sources: readonly RegisteredProviderStatusSource[], now: () => number = Date.now): ProviderRegistryResult {
  return providerRegistryResultSchema.parse({
    generatedAt: new Date(now()).toISOString(), scope: "registered_adapters_only",
    providers: sources.map(source => ({ declaration: source.declaration(), health: source.health() }))
  });
}
