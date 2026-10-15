import * as z from "zod/v4";
import {titleCandidateSchema} from "./titled-character-search.js";
import {scopedSceneRecallResultSchema} from "./scoped-scene-recall.js";
const id=z.number().int().positive().safe();

/** Title is only a way to select one source work, never global clue discovery. */
export const titledSceneRecallInputSchema=z.strictObject({
  animeTitle:z.string().trim().min(2).max(160),
  cues:z.array(z.string().trim().min(2).max(80)).min(1).max(6),
  episodeId:id.optional(),
  mode:z.enum(["any","all"]).default("any"),
  limit:z.number().int().min(1).max(25).default(10)
});
export type TitledSceneRecallInput=z.input<typeof titledSceneRecallInputSchema>;
export const titledSceneRecallResultSchema=z.strictObject({
  scope:z.literal("local_title_index_to_source_clue_recall"),
  animeTitleQuery:z.string().min(1),
  titleMatchCount:z.number().int().nonnegative(),
  workCandidates:z.array(titleCandidateSchema).max(25),
  status:z.enum([
    "no_local_work_match","ambiguous_work_requires_selection",
    "fuzzy_work_requires_selection","unique_work_searched"
  ]),
  selectedAnimeId:id.nullable(),
  sourceRecall:scopedSceneRecallResultSchema.nullable()
}).superRefine((row,ctx)=>{
  const unique=row.status==="unique_work_searched";
  if((row.sourceRecall!==null)!==unique||(row.selectedAnimeId!==null)!==unique){
    ctx.addIssue({code:"custom",message:"Source recall is only returned for one uniquely selected non-fuzzy work"});
  }
  if(unique&&(row.titleMatchCount!==1||
    row.workCandidates[0]?.anidbId!==row.selectedAnimeId||
    row.workCandidates[0]?.matchType==="fuzzy"||
    row.sourceRecall?.sourceAnimeId!==row.selectedAnimeId)){
    ctx.addIssue({code:"custom",message:"Unique non-fuzzy local source work must match recalled source ID"});
  }
});
export type TitledSceneRecallResult=z.infer<typeof titledSceneRecallResultSchema>;
