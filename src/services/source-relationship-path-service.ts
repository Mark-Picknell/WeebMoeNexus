import { animeRecordSchema, type AnimeRecord } from "../domain/anime.js";
import { ProviderLookupError } from "../domain/provider-error.js";
import {
 sourceRelationshipPathInputSchema, sourceRelationshipPathResultSchema,
 type SourceRelationshipPathInput, type SourceRelationshipPathResult,
 type SourcePathEdge, type SourcePathRef
} from "../domain/source-relationship-path.js";

function key(ref: SourcePathRef): string {return ref.kind + ":" + ref.id;}
const MAX_NODES = 1000, MAX_EDGES = 2500;

export function findSourceRelationshipPathInRecords(
  raw: SourceRelationshipPathInput, records: AnimeRecord[]
): SourceRelationshipPathResult {
  const input = sourceRelationshipPathInputSchema.parse(raw);
  if (records.length !== input.anidbIds.length || records.some((r,i) => r.id !== input.anidbIds[i])) {
    throw new Error("Selected source records must match requested work IDs and order");
  }
  type Node = SourceRelationshipPathResult["nodesOnPath"][number];
  const nodes = new Map<string,Node>(), edges: SourcePathEdge[] = [];
  const selected = new Set(input.anidbIds);
  let unresolvedCreditRows = 0, workRelationsOutsideSelection = 0;
  function node(ref: SourcePathRef, name: string | null, sourceId: number) {
    const k = key(ref);
    const current = nodes.get(k) ?? {
      ...ref, sourceNames: [] as string[], sourceRecords: [] as number[], entityClass: "source_reference_only" as const
    };
    if (name && !current.sourceNames.includes(name)) current.sourceNames.push(name);
    if (!current.sourceRecords.includes(sourceId)) current.sourceRecords.push(sourceId);
    nodes.set(k,current);
    if (nodes.size > MAX_NODES) throw new Error("Bounded source node budget exceeded");
  }
  function add(edge: SourcePathEdge) {
    edges.push(edge);
    if (edges.length > MAX_EDGES) throw new Error("Bounded source edge budget exceeded");
  }
  for (const rawRecord of records) {
    const anime = animeRecordSchema.parse(rawRecord);
    const provenance = anime.provenance.find(p => p.provider === "anidb" &&
      p.providerId === String(anime.id) && p.sourceUrl === `https://anidb.net/anime/${anime.id}` &&
      Number.isFinite(Date.parse(p.retrievedAt)));
    if (!provenance) throw new Error("Selected anime lacks matching source provenance");
    const srcUrl = provenance.sourceUrl, retrievedAt = provenance.retrievedAt;
    const work: SourcePathRef = {kind:"work",id:anime.id};
    node(work, anime.titles.length ? anime.preferredTitle : null, anime.id);
    anime.characters.forEach((ch,i) => {
      const character: SourcePathRef = {kind:"character", id:ch.id};
      node(character,ch.name === `AniDB character #${ch.id}` ? null : ch.name,anime.id);
      add({type:"character_in_work",from:character,to:work,sourceAnimeId:anime.id,
        sourceUrl:srcUrl,retrievedAt,sourceField:`characters[${i}]`,reportedLabel:ch.role});
      if (ch.voiceActor !== null) {
        if (ch.voiceActor.id === null) unresolvedCreditRows++;
        else {
          const contributor: SourcePathRef={kind:"contributor",id:ch.voiceActor.id};
          node(contributor,ch.voiceActor.name || null,anime.id);
          add({type:"voice_credit",from:contributor,to:character,sourceAnimeId:anime.id,
            sourceUrl:srcUrl,retrievedAt,sourceField:`characters[${i}].voiceActor`,reportedLabel:null});
        }
      }
    });
    anime.creators.forEach((credit,i) => {
      if (credit.id===null) {unresolvedCreditRows++;return;}
      const contributor: SourcePathRef={kind:"contributor",id:credit.id};
      node(contributor,credit.name,anime.id);
      add({type:"production_credit",from:contributor,to:work,sourceAnimeId:anime.id,
        sourceUrl:srcUrl,retrievedAt,sourceField:`creators[${i}]`,reportedLabel:credit.role});
    });
    anime.relations.forEach((r,i) => {
      if (!selected.has(r.id)) {workRelationsOutsideSelection++;return;}
      const target:SourcePathRef={kind:"work",id:r.id};
      // Selected work node is added when its source record is processed,
      // never treat the incoming edge title as verified target metadata.
      add({type:"reported_work_relation",from:work,to:target,sourceAnimeId:anime.id,
        sourceUrl:srcUrl,retrievedAt,sourceField:`relations[${i}]`,reportedLabel:r.relation});
    });
  }

  const fromKey=key(input.from), toKey=key(input.to);
  let status: SourceRelationshipPathResult["status"] = "endpoint_not_reported";
  let steps: SourceRelationshipPathResult["path"] = [];
  const adjacency = new Map<string, {edge: SourcePathEdge; navigation: "along_reported_direction" | "against_reported_direction"; next:string}[]>();
  edges.forEach(edge => {
    const a=key(edge.from),b=key(edge.to);
    if (!adjacency.has(a))adjacency.set(a,[]);
    if (!adjacency.has(b))adjacency.set(b,[]);
    adjacency.get(a)!.push({edge,navigation:"along_reported_direction",next:b});
    adjacency.get(b)!.push({edge,navigation:"against_reported_direction",next:a});
  });
  if (nodes.has(fromKey) && nodes.has(toKey)) {
    status="no_path_within_limit";
    if (fromKey===toKey) status="found";
    else {
      const visited = new Set<string>([fromKey]);
      const queue: {key:string;path:SourceRelationshipPathResult["path"]}[]=[{key:fromKey,path:[]}];
      for(let cursor=0;cursor<queue.length;cursor++){
        const item=queue[cursor]!;
        if(item.path.length>=input.maxHops)continue;
        for (const next of adjacency.get(item.key)??[]) {
          if(visited.has(next.next))continue;
          const path=[...item.path,{edge:next.edge,navigation:next.navigation}];
          if(next.next===toKey){steps=path;status="found";break;}
          visited.add(next.next);
          queue.push({key:next.next,path});
        }
        if(status==="found")break;
      }
    }
  }
  const pathKeys = status==="found"
    ? [fromKey,...steps.map(s=>key(s.navigation==="along_reported_direction"?s.edge.to:s.edge.from))]
    : [];
  return sourceRelationshipPathResultSchema.parse({
    scope:"explicit_selected_anidb_source_path",examinedAnimeIds:input.anidbIds,
    from:input.from,to:input.to,maxHops:input.maxHops,status,
    pathHops:status==="found"?steps.length:null,
    sourceNodeCount:nodes.size,sourceEdgeCount:edges.length,
    path:steps,nodesOnPath:pathKeys.map(k=>nodes.get(k)!),
    unresolvedCreditRows,workRelationsOutsideSelection,selectedPoolOnly:true
  });
}

/** Stop at first source read failure; no implicit catalog discovery. */
export async function findSourceRelationshipPath(
 raw: SourceRelationshipPathInput,
 reader:{getByAniDbId(id:number):Promise<AnimeRecord>}
):Promise<SourceRelationshipPathResult>{
 const input=sourceRelationshipPathInputSchema.parse(raw);
 const records:AnimeRecord[]=[];
 for(const id of input.anidbIds){
   const anime=await reader.getByAniDbId(id);
   try {
     if(anime.id!==id)throw new Error("Source ID mismatch");
     records.push(animeRecordSchema.parse(anime));
   }catch{
     throw new ProviderLookupError({
       code:"unavailable",reason:"invalid_response",
       message:"Selected relationship path reader received an invalid source record; no retry attempted.",
       httpStatus:null,apiCode:null
     });
   }
 }
 try{return findSourceRelationshipPathInRecords(input,records);}
 catch {
   throw new ProviderLookupError({
     code:"unavailable",reason:"invalid_response",
     message:"Selected relationship path could not verify source evidence; no retry attempted.",
     httpStatus:null,apiCode:null
   });
 }
}
