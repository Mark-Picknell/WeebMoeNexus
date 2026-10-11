import assert from "node:assert/strict";
import test from "node:test";
import { providerCapabilitySchema, providerDeclarationSchema } from "../src/domain/provider-registry.js";
import { aniDbCapabilityDeclaration } from "../src/providers/anidb/capabilities.js";

test("registry separates implemented plugin scope from native-provider uncertainty", () => {
  const registry = aniDbCapabilityDeclaration();
  assert.ok(providerDeclarationSchema.safeParse(registry).success);
  const byId = new Map(registry.capabilities.map(c => [c.id, c]));
  assert.equal(byId.get("anime_by_id")!.nativeProvider.assessment, "supported");
  assert.ok(byId.get("anime_by_id")!.nativeProvider.scope.includes("15437"));
  assert.equal(byId.get("scoped_character_lookup")!.implementation, "implemented");
  assert.equal(byId.get("scoped_character_lookup")!.nativeProvider.assessment, "unverified");
  for (const id of ["global_character_discovery", "character_species", "character_aliases", "scene_character_presence", "cross_provider_identity", "semantic_relationships"]) {
    assert.equal(byId.get(id)!.implementation, "not_implemented");
    assert.equal(byId.get(id)!.nativeProvider.assessment, "not_assessed");
    assert.deepEqual(byId.get(id)!.tools, []);
  }
});

test("offline contracts cannot establish native support, absence or undocumented status", () => {
  const input = aniDbCapabilityDeclaration().capabilities[0]!;
  for (const assessment of ["supported", "unavailable", "undocumented"]) {
    assert.equal(providerCapabilitySchema.safeParse({ ...input, nativeProvider: { assessment, scope: "synthetic conclusion", evidence: [{ ...input.evidence[0], basis: "offline_contract" }] } }).success, false);
  }
  assert.equal(providerCapabilitySchema.safeParse({ ...input, nativeProvider: { assessment: "unavailable", scope: "one live miss cannot prove global absence", evidence: input.nativeProvider.evidence } }).success, false);
});

test("unknown and not-assessed capabilities stay distinct from unavailable and undocumented", () => {
  const input = aniDbCapabilityDeclaration().capabilities[0]!;
  for (const assessment of ["unverified", "not_assessed"]) {
    assert.ok(providerCapabilitySchema.safeParse({ ...input, nativeProvider: { assessment, scope: "explicit unknown", evidence: [] } }).success);
  }
  const documented = { ...input.evidence[0], basis: "documentation" };
  for (const assessment of ["unavailable", "undocumented"]) {
    assert.ok(providerCapabilitySchema.safeParse({ ...input, nativeProvider: { assessment, scope: "Synthetic documented contract, not a claim about AniDB", evidence: [documented] } }).success);
  }
});

test("unimplemented capabilities cannot advertise tools, and duplicate IDs reject", () => {
  const registry = aniDbCapabilityDeclaration();
  assert.equal(providerCapabilitySchema.safeParse({ ...registry.capabilities[0], implementation: "not_implemented" }).success, false);
  assert.equal(providerDeclarationSchema.safeParse({ ...registry, capabilities: [registry.capabilities[0], registry.capabilities[0]] }).success, false);
});

test("capability evidence validates dates and URLs and does not expose configuration", () => {
  const input = aniDbCapabilityDeclaration().capabilities[0]!;
  for (const change of [{ url: "file:///private" }, { checkedOn: "today" }, { scope: " " }]) {
    assert.equal(providerCapabilitySchema.safeParse({ ...input, evidence: [{ ...input.evidence[0], ...change }] }).success, false);
  }
  const serialized = JSON.stringify(aniDbCapabilityDeclaration());
  assert.equal(serialized.includes("api.anidb.net:9001"), false);
  assert.equal(serialized.includes("ANIDB_CLIENT"), false);
});

test("registry calls are independent copies and perform no fetch", () => {
  const original = globalThis.fetch;
  let calls = 0;
  globalThis.fetch = () => { calls++; throw new Error("No probe permitted"); };
  try {
    const first = aniDbCapabilityDeclaration();
    first.capabilities[0]!.tools.length = 0;
    first.capabilities[0]!.evidence[0]!.scope = "mutated";
    const next = aniDbCapabilityDeclaration();
    assert.deepEqual(next.capabilities[0]!.tools, ["get_anime_by_anidb_id"]);
    assert.notEqual(next.capabilities[0]!.evidence[0]!.scope, "mutated");
    assert.equal(calls, 0);
  } finally { globalThis.fetch = original; }
});

test("bounded name search and episode metadata ranking register exact tools without claiming global or scene identification", () => {
  const byId = new Map(aniDbCapabilityDeclaration().capabilities.map(c => [c.id, c]));
  const names = byId.get("selected_character_name_search")!;
  assert.equal(names.implementation, "implemented");
  assert.deepEqual(names.tools, ["search_characters_in_selected_anime"]);
  assert.equal(names.nativeProvider.assessment, "unverified");
  assert.match(names.scope, /one to five/);
  assert.ok(names.limitations.some(x => x.includes("No global")));
  const episodes = byId.get("episode_candidate_metadata_ranking")!;
  assert.equal(episodes.implementation, "implemented");
  assert.deepEqual(episodes.tools, ["rank_episode_characters"]);
  assert.equal(episodes.nativeProvider.assessment, "unverified");
  assert.ok(episodes.limitations.some(x => x.includes("No actual media")));
  assert.equal(byId.get("global_character_discovery")?.implementation, "not_implemented");
  assert.equal(byId.get("scene_character_presence")?.implementation, "not_implemented");
});
