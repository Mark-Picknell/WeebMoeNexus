import * as z from "zod/v4";
import { animeRecordSchema, type AnimeRecord } from "../../domain/anime.js";
import { fieldProjectionSchema, type FieldProjection, type FieldContext } from "../../domain/field-claim.js";
import type { EntityReference } from "../../domain/relationship-edge.js";

/** Pure additive projection. Evidence is normalized data, not original XML lexemes. */
export function projectAniDbFieldClaims(input: AnimeRecord): FieldProjection {
  const anime = animeRecordSchema.parse(input);
  const ref = <K extends EntityReference["kind"]>(kind: K, id: number): EntityReference & { kind: K } => {
    z.number().int().positive().safe().parse(id);
    return { provider: "anidb", kind, id: String(id) };
  };
  const sourceRecord = ref("work", anime.id);
  const sources = anime.provenance.filter(p => p.providerId === String(anime.id));
  if (sources.length !== 1 || sources[0]!.sourceUrl !== `https://anidb.net/anime/${anime.id}`) {
    throw new Error("Field projection requires one matching AniDB source record");
  }
  const source = sources[0]!;
  z.iso.datetime({ offset: true }).parse(source.retrievedAt);
  const proof = { sourceRecord, sourceUrl: source.sourceUrl, retrievedAt: source.retrievedAt };
  const result: FieldProjection = { sourceRecord, claims: [], unknowns: [] };
  const context = (qualifiers: Record<string, string> = {}): FieldContext => ({ work: sourceRecord, qualifiers });
  function add(subject: EntityReference | null, field: string, sourceField: string,
    value: string | number | boolean | null, ctx = context(), reason?: FieldProjection["unknowns"][number]["reason"]) {
    const missing = value === null || value === "";
    if (reason || subject === null || missing) {
      result.unknowns.push({ ...proof, subject, field, context: ctx, sourceField,
        reason: reason ?? (subject === null ? "missing_subject_id" : "missing_value"),
        normalizedValue: value === "" ? null : value });
    } else {
      result.claims.push({ subject, field, context: ctx, value, polarity: "positive",
        evidence: { ...proof, sourceField, representation: "normalized_scalar", reportedValue: value } });
    }
  }
  for (const field of ["type", "episodeCount", "startDate", "endDate", "description", "picture", "url"] as const) {
    add(sourceRecord, field, field, anime[field]);
  }
  add(sourceRecord, "preferredTitle", "preferredTitle", anime.preferredTitle, context(), "derived_display");
  // The legacy mapper defaults missing restricted to false; presence was lost.
  add(sourceRecord, "restricted", "restricted", anime.restricted, context(), "normalization_lost_presence");
  anime.titles.forEach((title, i) => add(sourceRecord, "title", `titles[${i}].value`, title.value,
    context({ language: title.language, kind: title.kind })));
  anime.characters.forEach((character, i) => {
    const subject = ref("character", character.id);
    const base = `characters[${i}]`;
    add(subject, "name", `${base}.name`, character.name, context(),
      character.name === `AniDB character #${character.id}` ? "derived_display" : undefined);
    for (const field of ["role", "gender", "picture", "episodeAppearancesRaw"] as const) {
      add(subject, field, `${base}.${field}`, character[field]);
    }
    for (const field of ["species", "alias"] as const) add(subject, field, base, null, context(), "not_modeled");
    if (character.voiceActor) {
      const actor = character.voiceActor;
      const contributor = actor.id === null ? null : ref("contributor", actor.id);
      add(contributor, "name", `${base}.voiceActor.name`, actor.name);
      add(contributor, "picture", `${base}.voiceActor.picture`, actor.picture);
    }
  });
  anime.creators.forEach((creator, i) => {
    const subject = creator.id === null ? null : ref("contributor", creator.id);
    add(subject, "name", `creators[${i}].name`, creator.name);
    add(subject, "production_role", `creators[${i}].role`, creator.role);
  });
  anime.episodes.forEach((episode, i) => {
    z.number().int().positive().safe().parse(episode.id);
    const id = String(episode.id);
    const ctx = context({ episodeId: id });
    for (const field of ["number", "kind", "airDate", "lengthMinutes"] as const) {
      add(sourceRecord, `episode.${field}`, `episodes[${i}].${field}`, episode[field], ctx,
        field === "number" && episode.number === "?" ? "derived_display" : undefined);
    }
  });
  return fieldProjectionSchema.parse(result);
}
