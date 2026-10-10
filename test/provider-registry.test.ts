import assert from "node:assert/strict";
import test from "node:test";
import { ProviderOperationHealthTracker } from "../src/domain/provider-health.js";
import { providerRegistryResultSchema } from "../src/domain/provider-registry.js";
import { aniDbCapabilityDeclaration } from "../src/providers/anidb/capabilities.js";
import { getProviderRegistry } from "../src/services/provider-registry-service.js";

test("registry assembles only registered local sources and returns independent validated data", () => {
  const original = globalThis.fetch;
  let fetches = 0, declarations = 0, healthReads = 0;
  globalThis.fetch = () => { fetches++; throw new Error("No active probe"); };
  try {
    const tracker = new ProviderOperationHealthTracker(() => 1_000_000);
    const declaration = aniDbCapabilityDeclaration();
    const source = { declaration: () => { declarations++; return declaration; }, health: () => { healthReads++; return tracker.snapshot("ready"); } };
    const result = getProviderRegistry([source], () => 1_000_000);
    assert.ok(providerRegistryResultSchema.safeParse(result).success);
    assert.equal(result.generatedAt, new Date(1_000_000).toISOString());
    assert.equal(result.scope, "registered_adapters_only");
    assert.deepEqual(result.providers.map(p => p.declaration.provider), ["anidb"]);
    assert.equal(result.providers[0]!.health.freshness, "unobserved");
    result.providers[0]!.declaration.capabilities.length = 0;
    assert.ok(declaration.capabilities.length > 0);
    assert.equal(declarations, 1); assert.equal(healthReads, 1); assert.equal(fetches, 0);
    assert.deepEqual(getProviderRegistry([], () => 1_000_000).providers, [], "no implicit provider discovery");
  } finally { globalThis.fetch = original; }
});

test("registry rejects duplicate provider identities rather than silently merging them", () => {
  const tracker = new ProviderOperationHealthTracker(() => 1_000_000);
  const source = { declaration: aniDbCapabilityDeclaration, health: () => tracker.snapshot("ready") };
  assert.throws(() => getProviderRegistry([source, source]), /unique/);
});

test("failed local status readers cannot be omitted into a falsely complete registry", () => {
  assert.throws(() => getProviderRegistry([{ declaration: aniDbCapabilityDeclaration, health: () => { throw new Error("Synthetic reader failure"); } }]), /Synthetic reader failure/);
});
