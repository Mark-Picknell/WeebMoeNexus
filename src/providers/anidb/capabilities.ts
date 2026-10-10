import { providerDeclarationSchema, type ProviderCapability, type ProviderDeclaration } from "../../domain/provider-registry.js";

// Pinned repository evidence describes the inspected implementation, not the
// entirety of AniDB's native API or live catalog coverage.
const inspected = "2026-10-10";
const base = "https://github.com/Mark-Picknell/WeebMoeNexus/blob/ae9b9dd7dead056c80497d40c4daf2db8e552d83/";
const code = (path: string, scope: string) => ({ url: base + path, checkedOn: inspected, basis: "implementation" as const, scope });

function capability(id: string, implementation: ProviderCapability["implementation"], tools: string[], scope: string, path: string, limitations: string[]): ProviderCapability {
  return {
    id, implementation, tools, scope, limitations,
    evidence: [code(path, scope)],
    nativeProvider: {
      assessment: "unverified", scope: "The implementation audit does not establish this field's live completeness or a full native API capability inventory.", evidence: []
    }
  };
}

/** Fresh copies prevent callers from rewriting the registry's source facts. */
export function aniDbCapabilityDeclaration(): ProviderDeclaration {
  const capabilities: ProviderCapability[] = [
    capability("anime_by_id", "implemented", ["get_anime_by_anidb_id"], "One explicitly selected AniDB anime through the registered HTTP client and success cache.", "src/services/anime-service.ts", ["A cached result does not establish current upstream availability.", "A single verified live read does not validate the entire catalog."]),
    capability("title_search", "implemented", ["search_anime"], "Local title-dump aliases, normalized matches and conservative typo fallback.", "src/services/title-search-service.ts", ["Requires a separately initialized local title index; registry inspection does not load or refresh it.", "No character or semantic-attribute search."]),
    capability("scoped_character_lookup", "implemented", ["find_character", "get_character"], "Characters reported within one known source anime.", "src/server.ts", ["No global character endpoint or cross-work discovery.", "Absent rows mean unreported metadata, not confirmed nonexistence."]),
    capability("work_relations", "implemented", ["get_related_anime", "traverse_anime_relations"], "Source-directed work links and bounded outgoing traversal.", "src/services/relation-graph-service.ts", ["No automatic inverse edges, complete franchise coverage or semantic adaptation classification."]),
    capability("voice_credits", "implemented", ["get_anime_by_anidb_id", "find_character", "get_character"], "Character-attached source voice-actor fields.", "src/providers/anidb/mapper.ts", ["No scene-level speaking attribution, global person resolution or verified voice-language field."]),
    capability("production_credits", "implemented", ["get_anime_by_anidb_id"], "Every mapped creator production-credit row, including nullable IDs/names.", "src/providers/anidb/mapper.ts", ["Contributors can be organizations; a role or shared name does not establish personhood or kinship."]),
    capability("episode_reference_join", "implemented", ["find_character", "get_character"], "Bounded raw appearance-reference parsing and joins against listed episodes in the same record.", "src/services/episode-appearance-service.ts", ["Only a conservative syntax subset; unsupported and unlisted references remain visible.", "An episode metadata join is not scene-level observation."]),
    capability("entity_comparison", "implemented", ["compare_anime_entities"], "Character/contributor occurrences in 1–5 caller-selected works.", "src/services/entity-comparison-service.ts", ["Missing species/aliases remain unknown; no global or cross-provider identity merge."]),
    capability("global_character_discovery", "not_implemented", [], "No global character search in this plugin.", "src/server.ts", ["Native provider support has not been assessed by this registry."]),
    capability("character_species", "not_implemented", [], "No verified species ingestion or species discovery.", "src/services/entity-comparison-service.ts", ["Accepting a comparison constraint does not supply source evidence for that constraint."]),
    capability("character_aliases", "not_implemented", [], "No mapped character-alias ingestion; anime title aliases are a separate capability.", "src/services/entity-comparison-service.ts", ["No guessed name-order inversion or translation aliases."]),
    capability("scene_character_presence", "not_implemented", [], "No frame/scene-level character identification.", "docs/ROADMAP.md", ["Series credits and episode references cannot become scene assertions."]),
    capability("cross_provider_identity", "not_implemented", [], "No canonical identity resolver across providers.", "docs/ROADMAP.md", ["Only AniDB is integrated; pending provider approvals are separate tasks."]),
    capability("semantic_relationships", "not_implemented", [], "Typed portrayal/adaptation/inheritance/cameo/crossover contracts exist, but no source adapter emits those semantic edges.", "docs/RELATIONSHIP-EDGES.md", ["Raw source relation labels stay uninterpreted."])
  ];
  capabilities[0]!.nativeProvider = {
    assessment: "supported",
    scope: "One historical registered-client anime read for AniDB 15437; no current availability or catalog-wide guarantee.",
    evidence: [{ url: "https://github.com/Mark-Picknell/WeebMoeNexus/actions/runs/37867136270", checkedOn: "2026-10-09", basis: "live_smoke", scope: "Historical live HTTP anime lookup of AniDB 15437." }]
  };
  // Not implemented in this plugin must not be interpreted as unavailable
  // from AniDB. No native API investigation was performed for these entries.
  for (const item of capabilities.filter(c => c.implementation === "not_implemented")) {
    item.nativeProvider = { assessment: "not_assessed", scope: "No native-provider availability conclusion is made by this implementation registry.", evidence: [] };
  }
  return providerDeclarationSchema.parse({ provider: "anidb", integration: "active_adapter", assessedOn: inspected, capabilities });
}
