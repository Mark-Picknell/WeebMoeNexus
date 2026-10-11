import * as z from "zod/v4";
import type { AnimeRecord } from "../domain/anime.js";
import { animeEvidenceInputSchema, animeEvidenceResultSchema, type AnimeEvidenceInput, type AnimeEvidenceResult } from "../domain/anime-evidence.js";
import { entityReferenceKey, fieldContextKey, type FieldClaim, type FieldProjection } from "../domain/field-claim.js";
import type { FieldAssessmentInput } from "../domain/field-assessment.js";
import { ProviderLookupError } from "../domain/provider-error.js";
import { projectAniDbFieldClaims } from "../providers/anidb/field-claims.js";
import { preferFieldClaims } from "./source-preference-service.js";

// Conservative known normalized field rules. Unrecognized fields are never
// assumed exhaustive/single-valued; future providers need reviewed field rules.
const singleFields = new Set(["type", "episodeCount", "startDate", "endDate", "description", "picture", "url",
  "gender", "role", "episodeAppearancesRaw", "episode.number", "episode.kind", "episode.airDate", "episode.lengthMinutes"]);

/** Inspect exactly one explicitly requested record. No targets or other providers. */
export async function getAnimeEvidence(input: AnimeEvidenceInput,
  reader: { getByAniDbId(id: number): Promise<AnimeRecord> }): Promise<AnimeEvidenceResult> {
  const request = animeEvidenceInputSchema.parse(input);
  const anime = await reader.getByAniDbId(request.anidbId);
  try {
    if (anime.id !== request.anidbId) throw new Error("Source record mismatch");
    const projection = projectAniDbFieldClaims(anime);
    z.array(z.unknown()).max(1000).parse(projection.claims);
    z.array(z.unknown()).max(1000).parse(projection.unknowns);
    const groups = new Map<string, { request: FieldAssessmentInput; claims: FieldClaim[]; unknowns: FieldProjection["unknowns"] }>();
    function group(row: FieldClaim | FieldProjection["unknowns"][number]) {
      if (row.subject === null) return null;
      const key = JSON.stringify([entityReferenceKey(row.subject), row.field, fieldContextKey(row.context)]);
      if (!groups.has(key)) groups.set(key, {
        request: { subjects: [row.subject], field: row.field, context: row.context, cardinality: singleFields.has(row.field) ? "single" : "multiple" },
        claims: [], unknowns: []
      });
      return groups.get(key)!;
    }
    for (const claim of projection.claims) group(claim)!.claims.push(claim);
    const unassignedUnknownIndexes: number[] = [];
    projection.unknowns.forEach((unknown, index) => {
      const target = group(unknown);
      if (target) target.unknowns.push(unknown); else unassignedUnknownIndexes.push(index);
    });
    return animeEvidenceResultSchema.parse({ scope: "one_anidb_record", anidbId: request.anidbId, projection,
      fields: [...groups.values()].map(g => preferFieldClaims(g.request, g.claims, g.unknowns, request.sourcePreference)),
      unassignedUnknownIndexes });
  } catch {
    throw new ProviderLookupError({ code: "unavailable", reason: "invalid_response",
      message: "AniDB field evidence could not validate the requested record within its evidence budget. No retry was attempted.", httpStatus: null, apiCode: null });
  }
}
