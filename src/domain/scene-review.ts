import * as z from "zod/v4";
import { sceneObservationRecordSchema, type SceneObservationRecord } from "./scene-observation.js";

/**
 * Untrusted, local-only review events. A user's support of a proposal does
 * not authenticate a reviewer, verify a source, or change canonical identity.
 */
export const sceneReviewEventSchema = z.strictObject({
  eventId: z.string().regex(/^rv-[a-z0-9]{10,48}$/),
  observationId: sceneObservationRecordSchema.shape.observationId,
  recordedAt: z.iso.datetime({ offset: true }),
  actor: z.literal("unverified_local_reviewer"),
  action: z.enum(["supports_proposal", "disputes_proposal", "requests_evidence", "withdraws_report"]),
  note: z.string().trim().min(1).max(300).nullable()
});
export type SceneReviewEvent = z.infer<typeof sceneReviewEventSchema>;

const assessmentSchema = z.strictObject({
  scope: z.literal("unverified_observer_review"),
  status: z.enum([
    "unreviewed", "observer_supported_unverified", "disputed",
    "contested", "needs_more_evidence", "withdrawn"
  ]),
  supportingEvents: z.number().int().nonnegative(),
  disputingEvents: z.number().int().nonnegative(),
  needsEvidenceEvents: z.number().int().nonnegative(),
  canonicalIdentityChanged: z.literal(false)
});
export const sceneReviewHistorySchema = z.strictObject({
  observation: sceneObservationRecordSchema,
  events: z.array(sceneReviewEventSchema).max(64),
  assessment: assessmentSchema
});
export type SceneReviewHistory = z.infer<typeof sceneReviewHistorySchema>;

/** Replay the entire append-only event sequence; never let the last vote win. */
export function assessSceneReviews(raw: SceneObservationRecord, events: SceneReviewEvent[] = []): SceneReviewHistory {
  const observation = sceneObservationRecordSchema.parse(raw);
  const rows = z.array(sceneReviewEventSchema).max(64).parse(events);
  const ids = new Set<string>();
  let previous = Date.parse(observation.reportedAt);
  let withdrawn = false;
  for (const event of rows) {
    if (event.observationId !== observation.observationId) throw new Error("Review event targets a different observation");
    if (ids.has(event.eventId)) throw new Error("Duplicate review event ID");
    ids.add(event.eventId);
    const time = Date.parse(event.recordedAt);
    if (!Number.isFinite(time) || time < previous) throw new Error("Review event chronology must be nondecreasing");
    previous = time;
    if (withdrawn) throw new Error("Withdrawn observations cannot be silently reactivated");
    if (observation.proposedCharacterId === null && ["supports_proposal", "disputes_proposal"].includes(event.action)) {
      throw new Error("A proposal review requires a proposed character ID");
    }
    if (event.action === "withdraws_report") withdrawn = true;
  }

  const supportingEvents = rows.filter(r => r.action === "supports_proposal").length;
  const disputingEvents = rows.filter(r => r.action === "disputes_proposal").length;
  const needsEvidenceEvents = rows.filter(r => r.action === "requests_evidence").length;
  const status = withdrawn ? "withdrawn"
    : supportingEvents && disputingEvents ? "contested"
    : disputingEvents ? "disputed"
    : needsEvidenceEvents ? "needs_more_evidence"
    : supportingEvents ? "observer_supported_unverified" : "unreviewed";
  return sceneReviewHistorySchema.parse({
    observation, events: rows,
    assessment: {
      scope: "unverified_observer_review",
      status, supportingEvents, disputingEvents, needsEvidenceEvents,
      canonicalIdentityChanged: false
    }
  });
}

/** New event appended to replayed history, never edited in place. */
export function appendSceneReview(raw: SceneReviewHistory, event: SceneReviewEvent): SceneReviewHistory {
  const previous = sceneReviewHistorySchema.parse(raw);
  const verified = assessSceneReviews(previous.observation, previous.events);
  if (JSON.stringify(verified.assessment) !== JSON.stringify(previous.assessment)) {
    throw new Error("The supplied review assessment does not match its event evidence");
  }
  return assessSceneReviews(previous.observation, [...previous.events, event]);
}
