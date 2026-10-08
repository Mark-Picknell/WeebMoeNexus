import * as z from "zod/v4";

export const titleSchema = z.object({
  language: z.string(),
  kind: z.string(),
  value: z.string()
});

export const relationSchema = z.object({
  id: z.number().int().positive(),
  relation: z.string(),
  title: z.string().nullable()
});

export const voiceActorSchema = z.object({
  id: z.number().int().positive().nullable(),
  name: z.string(),
  picture: z.string().nullable()
});

export const characterSchema = z.object({
  id: z.number().int().positive(),
  name: z.string(),
  role: z.string().nullable(),
  gender: z.string().nullable(),
  picture: z.string().nullable(),
  voiceActor: voiceActorSchema.nullable()
});

export const episodeSchema = z.object({
  id: z.number().int().positive(),
  number: z.string(),
  kind: z.number().int().nullable(),
  airDate: z.string().nullable(),
  lengthMinutes: z.number().int().nonnegative().nullable()
});

export const provenanceSchema = z.object({
  provider: z.literal("anidb"),
  providerId: z.string(),
  sourceUrl: z.string().url(),
  retrievedAt: z.string()
});

export const animeRecordSchema = z.object({
  id: z.number().int().positive(),
  titles: z.array(titleSchema),
  preferredTitle: z.string(),
  type: z.string().nullable(),
  episodeCount: z.number().int().nonnegative().nullable(),
  startDate: z.string().nullable(),
  endDate: z.string().nullable(),
  restricted: z.boolean(),
  description: z.string().nullable(),
  picture: z.string().nullable(),
  url: z.string().nullable(),
  relations: z.array(relationSchema),
  characters: z.array(characterSchema),
  episodes: z.array(episodeSchema),
  provenance: z.array(provenanceSchema)
});

export type AnimeRecord = z.infer<typeof animeRecordSchema>;
