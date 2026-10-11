import * as z from "zod/v4";

const sourceId = z.number().int().positive().safe();
const note = z.string().trim().min(1).max(200);

/**
 * Unauthenticated, client-described observations. These are not provider
 * assertions or verified character facts; no file or image bytes are accepted.
 */
export const sceneObservationInputSchema = z.strictObject({
  observationId: z.string().regex(/^ob-[a-z0-9]{10,48}$/),
  reportedAt: z.iso.datetime({ offset: true }),
  context: z.strictObject({
    anidbId: sourceId,
    episodeId: sourceId.nullable(),
    /** Playback-relative position, not a wall-clock timestamp. */
    offsetMs: z.number().int().nonnegative().safe().nullable()
  }),
  author: z.literal("unverified_user_report"),
  observations: z.array(z.strictObject({
    attribute: z.enum(["hair_color", "clothing", "accessory", "gesture", "voice_quality", "on_screen_text", "other"]),
    reportedValue: note,
    certainty: z.enum(["observed", "uncertain"])
  })).min(1).max(16),
  /** A user's identification proposal, not a verified identity or canonical link. */
  proposedCharacterId: sourceId.nullable(),
  /** Digest and rights *claim* only. No URI, pixels, frames or bytes. */
  imageReference: z.strictObject({
    type: z.literal("digest_only"),
    sha256: z.string().regex(/^[a-f0-9]{64}$/),
    rightsClaim: z.enum(["claimed_owned", "claimed_licensed"]),
    permissionAffirmed: z.literal(true)
  }).nullable(),
  consentScope: z.literal("ephemeral_local_processing_only")
});
export type SceneObservationInput = z.infer<typeof sceneObservationInputSchema>;

export const sceneObservationRecordSchema = z.strictObject({
  ...sceneObservationInputSchema.shape,
  provenance: z.literal("unverified_submitter_assertion"),
  reviewState: z.literal("unreviewed")
});
export type SceneObservationRecord = z.infer<typeof sceneObservationRecordSchema>;

/**
 * Parse and preserve an observation without storage, identity merge, upload,
 * source-provider contact, or a review decision.
 */
export function recordSceneObservation(raw: SceneObservationInput): SceneObservationRecord {
  const input = sceneObservationInputSchema.parse(raw);
  return sceneObservationRecordSchema.parse({
    ...input, provenance: "unverified_submitter_assertion", reviewState: "unreviewed"
  });
}
