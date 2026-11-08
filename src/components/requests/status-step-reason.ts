import { JOURNEY_STATUSES, type JourneyStatus } from "@/lib/request-journey"

const order = (status: JourneyStatus) => JOURNEY_STATUSES.findIndex(step => step.status === status)

/** The step a later status waits on. In progress is the pickup itself, so its row reads the pickup's own reason. */
const NEXT_STEP: Partial<Record<JourneyStatus, string>> = {
  done: "Pick it up first",
  measuring: "Record the release first",
  closed: "Record the result once it’s Measuring",
}

/**
 * #240 decision 9 (A228): why the row menu's Status list greys `target` for a Request at `current`. Each later
 * status names the step that has to come first; every earlier one says Requests don't move back.
 */
export function statusStepReason(current: JourneyStatus, target: JourneyStatus): string | undefined {
  if (target === current) return undefined
  if (order(target) < order(current)) return "Requests don’t move back"
  return NEXT_STEP[target]
}
