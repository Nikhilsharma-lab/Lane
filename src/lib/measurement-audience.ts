/**
 * Who a Request's work is for, in the measurement plan's own words ("All users"), with no zod: the Journey's step
 * model and the release record read it, and the step model is in the Request page's first load.
 */
import type { MeasurementPlanDraft } from "./request-measurement"

type Audience = Pick<MeasurementPlanDraft["measurement"], "audience" | "audienceName">

export function measurementAudienceLabel(measurement: Audience): string {
  return measurement.audience === "custom" ? measurement.audienceName?.trim() || "Custom audience"
    : { all: "All users", new: "New users", returning: "Returning users" }[measurement.audience]
}

/** What a saved goal names as its audience, as Impact reads it: the plan's label, else "All users". */
export function planAudience(expectedImpact: unknown): string {
  const measurement = (expectedImpact as { measurement?: { audience?: unknown; audienceName?: string } } | null)?.measurement
  const audience = measurement?.audience
  return audience === "all" || audience === "new" || audience === "returning" || audience === "custom"
    ? measurementAudienceLabel({ audience, audienceName: measurement?.audienceName })
    : "All users"
}

// Lane's own words for an audience (and the release record's older default) read lower-case mid-sentence.
const LANE_WORDS = new Set(["All users", "New users", "Returning users", "Custom audience", "Everyone this Request is for"])

/** An audience inside a sentence: Lane's own labels in lower case, a name someone typed exactly as typed. */
export const audienceInSentence = (audience: string) => LANE_WORDS.has(audience) ? audience[0].toLowerCase() + audience.slice(1) : audience
