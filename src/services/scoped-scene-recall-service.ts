import { animeRecordSchema, type AnimeRecord } from "../domain/anime.js";
import { ProviderLookupError } from "../domain/provider-error.js";
import { normalizeAniDbTitle } from "../providers/anidb/title-normalization.js";
import { normalizeCharacterEpisodeAppearances } from "./episode-appearance-service.js";
import {
  scopedSceneRecallInputSchema, scopedSceneRecallResultSchema,
  type ScopedSceneRecallInput, type ParsedScopedSceneRecallInput,
  type ScopedSceneRecallResult
} from "../domain/scoped-scene-recall.js";

function parse(raw: ScopedSceneRecallInput): ParsedScopedSceneRecallInput {
  const input = scopedSceneRecallInputSchema.parse(raw);
  const keys = new Set<string>();
  for (const cue of input.cues) {
    const key = normalizeAniDbTitle(cue);
    if ([...key].length < 2) throw new RangeError("Clues need two meaningful characters");
    if (keys.has(key)) throw new RangeError("Duplicate normalized clue");
    keys.add(key);
  }
  return input;
}

/**
 * A remembered descriptor may occur in character biography prose, but is
 * neither proof of an attribute nor evidence of the remembered scene.
 * Episode references can only BOOST source-reported positives, never exclude
 * unknown/missing metadata or claim a timestamp-level appearance.
 */
export function recallCharacterCluesInSourceWork(
  raw: ScopedSceneRecallInput, source: AnimeRecord
): ScopedSceneRecallResult {
  const input = parse(raw);
  if (source.id !== input.anidbId) throw new Error("Source work ID differs from explicit request");
  const anime = animeRecordSchema.parse(source);
  const provenance = anime.provenance.find(p =>
    p.provider === "anidb" && p.providerId === String(anime.id) &&
    p.sourceUrl === `https://anidb.net/anime/${anime.id}` &&
    Number.isFinite(Date.parse(p.retrievedAt))
  );
  if (!provenance) throw new Error("Missing matching AniDB source provenance");
  const cues = input.cues.map(requestedCue => ({
    requestedCue, key: normalizeAniDbTitle(requestedCue)
  }));
  const requestedEpisodeId = input.episodeId ?? null;
  const sourceEpisodeStatus = requestedEpisodeId === null ? "not_requested" as const
    : anime.episodes.some(e => e.id === requestedEpisodeId) ? "reported" as const : "not_reported" as const;
  const candidates: ScopedSceneRecallResult["candidates"] = [];
  let descriptionRows = 0, legacyDescriptionUnknownRows = 0;

  anime.characters.forEach((character,sourceRowIndex) => {
    if (character.description === undefined) { legacyDescriptionUnknownRows++; return; }
    if (character.description === null) return;
    descriptionRows++;
    const normalized = normalizeAniDbTitle(character.description);
    const matchedCues = cues.flatMap(cue => {
      const at = (` ${normalized} `).indexOf(` ${cue.key} `);
      if (at < 0) return [];
      const start = Math.max(0,at-70),end = Math.min(normalized.length,at+cue.key.length+70);
      return [{
        requestedCue:cue.requestedCue,
        normalizedExcerpt:normalized.slice(start,end).slice(0,220),
        evidenceKind:"literal_normalized_text_mention" as const
      }];
    });
    if (!matchedCues.length || (input.mode === "all" && matchedCues.length !== cues.length)) return;
    const found = new Set(matchedCues.map(c => normalizeAniDbTitle(c.requestedCue)));
    const episodeEvidence = normalizeCharacterEpisodeAppearances(anime,character.episodeAppearancesRaw);
    const episodeReferenceStatus = requestedEpisodeId === null ? "not_requested" as const
      : sourceEpisodeStatus === "reported" && episodeEvidence.linkedEpisodeIds.includes(requestedEpisodeId)
        ? "reported_positive" as const : "unverified" as const;
    candidates.push({
      sourceRowIndex,characterId:character.id,
      characterName:character.name === `AniDB character #${character.id}` ? null : character.name,
      characterUrl:`https://anidb.net/character/${character.id}`,
      descriptionSourceField:`characters[${sourceRowIndex}].description`,
      matchedCues,
      unverifiedCues:cues.filter(c=>!found.has(c.key)).map(c=>c.requestedCue),
      characterType:character.characterType ?? null,
      voiceActor:character.voiceActor === null ? null : {
        id:character.voiceActor.id,name:character.voiceActor.name
      },
      episodeReferenceStatus,episodeEvidence,
      assertionStatus:"candidate_not_identification"
    });
  });
  candidates.sort((a,b) =>
    Number(b.episodeReferenceStatus === "reported_positive")-Number(a.episodeReferenceStatus === "reported_positive") ||
    b.matchedCues.length-a.matchedCues.length ||
    a.sourceRowIndex-b.sourceRowIndex
  );
  return scopedSceneRecallResultSchema.parse({
    scope:"one_explicit_anidb_work_source_text_clues",
    sourceAnimeId:anime.id,
    sourceAnimeTitle:anime.titles.length ? anime.preferredTitle : null,
    sourceUrl:provenance.sourceUrl,retrievedAt:provenance.retrievedAt,
    requestedCues:input.cues,mode:input.mode,requestedEpisodeId,sourceEpisodeStatus,
    reportedCharacterRows:anime.characters.length,descriptionRows,legacyDescriptionUnknownRows,
    matchedCharacterRows:candidates.length,truncated:candidates.length>input.limit,
    sceneIdentification:"not_performed",sourceMentionsAreNotVerifiedTraits:true,
    candidates:candidates.slice(0,input.limit)
  });
}

/** Validate before contacting one explicitly selected paced/cached work. */
export async function recallCharacterCluesFromSelectedWork(
  raw: ScopedSceneRecallInput, reader: {getByAniDbId(id:number):Promise<AnimeRecord>}
): Promise<ScopedSceneRecallResult> {
  const input = parse(raw);
  const record = await reader.getByAniDbId(input.anidbId);
  try { return recallCharacterCluesInSourceWork(input,record); }
  catch {
    throw new ProviderLookupError({
      code:"unavailable",reason:"invalid_response",
      message:"Cannot validate source metadata for requested work; no additional fetch was attempted.",
      httpStatus:null,apiCode:null
    });
  }
}
