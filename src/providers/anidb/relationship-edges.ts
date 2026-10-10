import * as z from "zod/v4";
import { animeRecordSchema, type AnimeRecord } from "../../domain/anime.js";
import { entityReferenceSchema, relationshipEdgeSchema, relationshipEvidenceSchema, type EntityReference, type RelationshipEdge, type RelationshipEvidence } from "../../domain/relationship-edge.js";

export const aniDbRelationshipProjectionSchema = z.strictObject({
  scope: z.literal("one_anidb_record"),
  sourceWork: entityReferenceSchema.extend({ provider: z.literal("anidb"), kind: z.literal("work") }),
  reportedRows: z.number().int().nonnegative(),
  edges: z.array(relationshipEdgeSchema),
  unresolved: z.array(z.strictObject({
    type: z.enum(["production_credit", "voice_credit"]),
    reason: z.literal("missing_contributor_id"),
    evidence: z.array(relationshipEvidenceSchema).min(1)
  }))
}).refine(r => r.reportedRows === r.edges.length + r.unresolved.length, "Every reported row must remain accounted for");
export type AniDbRelationshipProjection = z.infer<typeof aniDbRelationshipProjectionSchema>;

/** Pure projection of an already retrieved record. No reads or inferred edges. */
export function projectAniDbRelationshipEdges(input: AnimeRecord): AniDbRelationshipProjection {
  const anime = animeRecordSchema.parse(input);
  const ref = (kind: EntityReference["kind"], id: number): EntityReference => {
    z.number().int().positive().safe().parse(id);
    return { provider: "anidb", kind, id: String(id) };
  };
  const sourceWork = ref("work", anime.id);
  const source = anime.provenance.find(p => p.providerId === String(anime.id));
  if (!source || source.sourceUrl !== `https://anidb.net/anime/${anime.id}`) {
    throw new Error("AniDB edge projection requires matching source provenance");
  }
  // Also validate timestamps for an empty record, which has no edge evidence.
  z.iso.datetime({ offset: true }).parse(source.retrievedAt);
  const evidence = (sourceField: string, row: unknown): RelationshipEvidence[] => [{
    sourceRecord: sourceWork, sourceUrl: source.sourceUrl,
    retrievedAt: source.retrievedAt, sourceField,
    reportedValue: JSON.stringify(row), polarity: "positive"
  }];
  const edges: RelationshipEdge[] = [];
  const unresolved: AniDbRelationshipProjection["unresolved"] = [];

  anime.creators.forEach((creator, index) => {
    const proof = evidence(`creators[${index}]`, creator);
    if (creator.id === null) {
      unresolved.push({ type: "production_credit", reason: "missing_contributor_id", evidence: proof });
    } else {
      edges.push(relationshipEdgeSchema.parse({ type: "production_credit", from: ref("contributor", creator.id), to: sourceWork, role: creator.role, evidence: proof }));
    }
  });
  anime.characters.forEach((character, index) => {
    const characterRef = ref("character", character.id);
    const actor = character.voiceActor;
    if (actor === null) return;
    const proof = evidence(`characters[${index}].voiceActor`, { characterId: character.id, voiceActor: actor });
    if (actor.id === null) {
      unresolved.push({ type: "voice_credit", reason: "missing_contributor_id", evidence: proof });
    } else {
      edges.push(relationshipEdgeSchema.parse({ type: "voice_credit", from: ref("contributor", actor.id), to: characterRef, work: sourceWork, language: null, evidence: proof }));
    }
  });
  anime.relations.forEach((relation, index) => {
    edges.push(relationshipEdgeSchema.parse({ type: "reported_work_relation", from: sourceWork, to: ref("work", relation.id), label: relation.relation, evidence: evidence(`relations[${index}]`, relation) }));
  });

  return aniDbRelationshipProjectionSchema.parse({
    scope: "one_anidb_record", sourceWork,
    reportedRows: anime.creators.length + anime.characters.filter(c => c.voiceActor !== null).length + anime.relations.length,
    edges, unresolved
  });
}
