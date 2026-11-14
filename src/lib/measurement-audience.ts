/**
 * Who a Request's work is for, in the measurement plan's own words ("All users"), with no zod: the Journey's step
 * model and the release record read it, and the step model is in the Request page's first load.
 */
import type { MeasurementPlanDraft } from "./request-measurement"

type Audience = Pick<MeasurementPlanDraft["measurement"], "audience" | "audienceName">

/** The plan's audience choices in Lane's words, the one source for the plan's picker and every label. */
export const AUDIENCE_LABELS = { all: "All users", new: "New users", returning: "Returning users" } as const
const CUSTOM_AUDIENCE = "Custom audience"

export function measurementAudienceLabel(measurement: Audience): string {
  return measurement.audience === "custom" ? measurement.audienceName?.trim() || CUSTOM_AUDIENCE : AUDIENCE_LABELS[measurement.audience]
}

/**
 * The audience a release must reach: the agreed goal's, in the plan's own words, as Impact names it ("All users" when
 * the goal names none). New release records save this label (#278); older ones keep the words they were saved with.
 */
export function agreedAudience(request: { expectedImpact: unknown }): string {
  const measurement = (request.expectedImpact as { measurement?: { audience?: unknown; audienceName?: string } } | null)?.measurement
  const audience = measurement?.audience
  return audience === "all" || audience === "new" || audience === "returning" || audience === "custom"
    ? measurementAudienceLabel({ audience, audienceName: measurement?.audienceName })
    : "All users"
}

/**
 * An audience inside a sentence: Lane's own labels (and the release record's older default) in lower case, a name
 * someone typed exactly as typed.
 */
export const audienceInSentence = (audience: string) =>
  [...Object.values(AUDIENCE_LABELS), CUSTOM_AUDIENCE, "Everyone this Request is for"].includes(audience) ? audience[0].toLowerCase() + audience.slice(1) : audience
