import {normalizeAniDbTitle} from "../providers/anidb/title-normalization.js";
import type {AnimeRecord} from "../domain/anime.js";
import type {AnimeTitleSearchResult} from "./title-search-service.js";
import {titleCandidateSchema} from "../domain/titled-character-search.js";
import {
  titledSceneRecallInputSchema,titledSceneRecallResultSchema,
  type TitledSceneRecallInput,type TitledSceneRecallResult
} from "../domain/titled-scene-recall.js";
import {recallCharacterCluesFromSelectedWork} from "./scoped-scene-recall-service.js";

/**
 * Constrained local title match => ONE source record => descriptive clues.
 * A fuzzy hit, ambiguous title, absent index match or malformed search
 * result never triggers a provider source fetch.
 */
export async function recallCharacterCluesInUniqueTitledAnime(
  raw:TitledSceneRecallInput,
  titleReader:{search(query:string,limit:number):Promise<AnimeTitleSearchResult>},
  animeReader:{getByAniDbId(id:number):Promise<AnimeRecord>}
):Promise<TitledSceneRecallResult>{
 const input=titledSceneRecallInputSchema.parse(raw);
 if([...normalizeAniDbTitle(input.animeTitle)].length<2)
   throw new RangeError("Anime title needs at least two meaningful characters");
 const keys=new Set<string>();
 for(const cue of input.cues){
   const key=normalizeAniDbTitle(cue);
   if([...key].length<2)throw new RangeError("Recall cue needs two meaningful characters");
   if(keys.has(key))throw new RangeError("Repeated normalized recall cue");
   keys.add(key);
 }
 // Every user-supplied constraint has been validated before local I/O.
 const hits=await titleReader.search(input.animeTitle,25);
 if(!Number.isSafeInteger(hits.totalMatches)||hits.totalMatches<0||
   hits.totalMatches<hits.results.length||hits.results.length>25){
   throw new Error("Invalid local title search candidate counts");
 }
 const candidates=hits.results.map(c=>titleCandidateSchema.parse(c));
 if(new Set(candidates.map(x=>x.anidbId)).size!==candidates.length){
   throw new Error("Duplicate AniDB work IDs in local title result");
 }
 if(hits.totalMatches===1 && candidates.length!==1){
   throw new Error("One claimed title match must include exactly one source candidate");
 }
 const chosen=hits.totalMatches===1?candidates[0]:undefined;
 const status:TitledSceneRecallResult["status"]=
   hits.totalMatches===0?"no_local_work_match":
   hits.totalMatches>1?"ambiguous_work_requires_selection":
   !chosen||chosen.matchType==="fuzzy"?"fuzzy_work_requires_selection":"unique_work_searched";
 const sourceRecall=status==="unique_work_searched"&&chosen?
   await recallCharacterCluesFromSelectedWork({
     anidbId:chosen.anidbId,cues:input.cues,mode:input.mode,
     ...(input.episodeId===undefined?{}:{episodeId:input.episodeId}),
     limit:input.limit
   },animeReader):null;
 return titledSceneRecallResultSchema.parse({
   scope:"local_title_index_to_source_clue_recall",
   animeTitleQuery:input.animeTitle,titleMatchCount:hits.totalMatches,
   workCandidates:candidates,status,
   selectedAnimeId:sourceRecall?.sourceAnimeId??null,
   sourceRecall
 });
}
