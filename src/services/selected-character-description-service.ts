import {animeRecordSchema,type AnimeRecord} from "../domain/anime.js";
import {ProviderLookupError} from "../domain/provider-error.js";
import {normalizeAniDbTitle} from "../providers/anidb/title-normalization.js";
import {
  selectedCharacterDescriptionInputSchema,selectedCharacterDescriptionResultSchema,
  type SelectedCharacterDescriptionInput,type ParsedSelectedCharacterDescriptionInput,
  type SelectedCharacterDescriptionResult
} from "../domain/selected-character-description.js";

function parse(raw:SelectedCharacterDescriptionInput):ParsedSelectedCharacterDescriptionInput{
  const input=selectedCharacterDescriptionInputSchema.parse(raw);
  const unique=new Set<string>();
  for(const cue of input.cues){
    const key=normalizeAniDbTitle(cue);
    if([...key].length<2)throw new RangeError("Description cues require two meaningful characters");
    if(unique.has(key))throw new RangeError("Duplicate normalized source-description cue");
    unique.add(key);
  }
  return input;
}

/**
 * Only literal normalized *descriptive text* mentions are searchable here.
 * A phrase in prose may be negated or describe someone else. Never infer that
 * its subject has the trait and never backfill unreported character metadata.
 */
export function searchSelectedCharacterDescriptions(
 raw:SelectedCharacterDescriptionInput,records:AnimeRecord[]
):SelectedCharacterDescriptionResult {
 const input=parse(raw);
 if(records.length!==input.anidbIds.length||
    records.some((r,i)=>r.id!==input.anidbIds[i]))throw new Error("Selected source anime records must match requested work IDs and order");
 const cues=input.cues.map(cue=>({requested:cue,key:normalizeAniDbTitle(cue)}));
 const candidates:SelectedCharacterDescriptionResult["candidates"]=[];
 let totalReportedCharacterRows=0,descriptionsReported=0,legacyDescriptionUnknownRows=0;
 for(const rawRecord of records){
   const anime=animeRecordSchema.parse(rawRecord);
   const evidence=anime.provenance.find(p=>p.provider==="anidb" &&
     p.providerId===String(anime.id) &&
     p.sourceUrl===`https://anidb.net/anime/${anime.id}` &&
     Number.isFinite(Date.parse(p.retrievedAt)));
   if(!evidence)throw new Error("Selected character description requires matching source provenance");
   const sourceUrl=evidence.sourceUrl,retrievedAt=evidence.retrievedAt;
   totalReportedCharacterRows+=anime.characters.length;
   anime.characters.forEach((character,sourceRowIndex)=>{
     if(character.description===undefined){legacyDescriptionUnknownRows++;return;}
     if(character.description===null)return;
     descriptionsReported++;
     const normalized=normalizeAniDbTitle(character.description);
     const found=cues.flatMap(cue=>{
       const location=(` ${normalized} `).indexOf(` ${cue.key} `);
       if(location<0)return [];
       const left=Math.max(0,location-70),right=Math.min(normalized.length,location+cue.key.length+70);
       const excerpt=normalized.slice(left,right).slice(0,220);
       return [{requestedCue:cue.requested,
         sourceField:`characters[${sourceRowIndex}].description`,
         normalizedExcerpt:excerpt,
         evidenceKind:"literal_normalized_text_mention" as const
       }];
     });
     if(found.length===0||(input.mode==="all"&&found.length!==cues.length))return;
     const foundKeys=new Set(found.map(x=>normalizeAniDbTitle(x.requestedCue)));
     candidates.push({
       sourceAnimeId:anime.id,sourceAnimeTitle:anime.titles.length?anime.preferredTitle:null,
       sourceUrl,retrievedAt,sourceRowIndex,characterId:character.id,
       characterName:character.name===`AniDB character #${character.id}`?null:character.name,
       characterUrl:`https://anidb.net/character/${character.id}`,
       characterType:character.characterType??null,
       descriptionCoverage:"reported_text",
       matchedCues:found,
       unverifiedCues:cues.filter(cue=>!foundKeys.has(cue.key)).map(cue=>cue.requested),
       assertionStatus:"lexical_mentions_only"
     });
   });
 }
 candidates.sort((a,b)=>b.matchedCues.length-a.matchedCues.length||
   a.sourceAnimeId-b.sourceAnimeId||
   a.characterId-b.characterId||a.sourceRowIndex-b.sourceRowIndex);
 return selectedCharacterDescriptionResultSchema.parse({
   scope:"selected_anidb_character_description_text_only",
   examinedAnimeIds:input.anidbIds,cues:input.cues,mode:input.mode,
   totalReportedCharacterRows,descriptionsReported,legacyDescriptionUnknownRows,
   matchedCharacterRows:candidates.length,truncated:candidates.length>input.limit,
   sourceMentionsAreNotVerifiedTraits:true,
   candidates:candidates.slice(0,input.limit)
 });
}

/** Fail closed on source errors; reads are only caller-selected cached works. */
export async function searchCharacterDescriptionsAcrossSelectedAnime(
 raw:SelectedCharacterDescriptionInput,
 reader:{getByAniDbId(id:number):Promise<AnimeRecord>}
):Promise<SelectedCharacterDescriptionResult>{
 const input=parse(raw);const records:AnimeRecord[]=[];
 for(const id of input.anidbIds){
   const record=await reader.getByAniDbId(id);
   try{
     if(record.id!==id)throw new Error("Incorrect requested AniDB record ID");
     records.push(animeRecordSchema.parse(record));
   }catch{
     throw new ProviderLookupError({code:"unavailable",reason:"invalid_response",
       message:"Selected source character profile was invalid; no retry attempted.",
       httpStatus:null,apiCode:null});
   }
 }
 try{return searchSelectedCharacterDescriptions(input,records);}
 catch{
   throw new ProviderLookupError({code:"unavailable",reason:"invalid_response",
     message:"Could not verify selected source character descriptions; no retry attempted.",
     httpStatus:null,apiCode:null});
 }
}
