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
  capabilities.push({
    ...capability("field_evidence", "implemented", ["get_anime_evidence"], "Normalized field claims, unknowns, exact scoped conflicts and non-destructive caller-selected source preference for one requested work.", "src/server.ts", ["Only AniDB is integrated; priorities cannot fetch or authorize another provider.", "Normalized scalars are not raw XML, source authenticity or global truth.", "No canonical cross-provider identity or automatic conflict resolution."]),
    evidence: [
      { url: "https://github.com/Mark-Picknell/WeebMoeNexus/blob/a94e2c4caa35dc540b8975e7630115c4fb5458c3/src/providers/anidb/field-claims.ts", checkedOn: inspected, basis: "implementation", scope: "Pinned normalized AniDB field projection and explicit unknowns." },
      { url: "https://github.com/Mark-Picknell/WeebMoeNexus/blob/c5fd534853fec9ed0cd0777522270a9dc434136d/src/services/field-assessment-service.ts", checkedOn: inspected, basis: "implementation", scope: "Pinned exact-context conflict assessment; no winner or identity inference." },
      { url: "https://github.com/Mark-Picknell/WeebMoeNexus/blob/main/src/services/anime-evidence-service.ts", checkedOn: inspected, basis: "implementation", scope: "Current one-record MCP composition and display preferences; this URL follows main." }
    ]
  });
  // Registered, bounded features added after the pinned initial inventory.
  // These are plugin implementation observations, not new AniDB-native API claims.
  capabilities.push({
    ...capability(
      "selected_character_name_search", "implemented",
      ["search_characters_in_selected_anime"],
      "Name matching in one to five explicitly requested AniDB anime source records; optional reported work-title context.",
      "src/services/selected-character-search-service.ts",
      ["No global character catalog, automatic work discovery, source-guessed aliases/species, or identity joins.",
       "All relevant reads use the existing paced cache; missing rows prove only unreported metadata in the examined works."]
    ),
    evidence: [{
      url: "https://github.com/Mark-Picknell/WeebMoeNexus/blob/8be490331f0440fa49d7b75cad07e51e5bf10c0b/src/services/selected-character-search-service.ts",
      checkedOn: "2026-10-11", basis: "implementation" as const,
      scope: "Verified bounded selected-work character name matching, source-row provenance and no automatic discovery."
    }]
  });
  capabilities.push({
    ...capability(
      "episode_candidate_metadata_ranking", "implemented",
      ["rank_episode_characters"],
      "Rank character rows for one selected source anime and listed EID based solely on positive episode-reference joins.",
      "src/services/episode-character-ranking-service.ts",
      ["Missing or partial episode information remains unverified, never an inferred absence.",
       "No actual media frame examination, visual trait matching or scene observation."]
    ),
    evidence: [{
      url: "https://github.com/Mark-Picknell/WeebMoeNexus/blob/8cb825ce7177609df80c6160c0f9052b3f3f02a7/src/services/episode-character-ranking-service.ts",
      checkedOn: "2026-10-11", basis: "implementation" as const,
      scope: "Verified source metadata ranking only; does not establish scene-character presence."
    }]
  });
  capabilities.push({
    ...capability(
      "title_to_character_lookup", "implemented",
      ["find_character_by_anime_title"],
      "Local AniDB title-index match followed by ONE source anime character-name search, only when work-title ID is uniquely exact/normalized.",
      "src/services/titled-character-search-service.ts",
      [
        "Fuzzy-only and ambiguous title matches require user selection; no source anime is fetched in those states.",
        "Requires a previously initialized local title dump and the existing configured source reader.",
        "No global character discovery, cross-work identity resolution or scene-level recognition."
      ]
    ),
    evidence: [{
      url: "https://github.com/Mark-Picknell/WeebMoeNexus/blob/7d3851a79ab9fb47d2f7d7039cc269fa36dfa111/src/services/titled-character-search-service.ts",
      checkedOn: "2026-10-11", basis: "implementation" as const,
      scope: "One unique deterministic local title match to a single bounded character-name source read."
    }]
  });
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
