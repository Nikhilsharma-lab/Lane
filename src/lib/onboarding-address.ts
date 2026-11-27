import type { AuthAnswer } from "./auth-answer"
import { HOME } from "./auth-return-address"

/** Where someone signed in with no workspace joins or starts one. */
export const ONBOARDING_URL = "/onboarding"

const STEP_PARAM = "step"
const ROLE_STEP = "role"
/**
 * #391: Onboarding's address with the role step's marker. A person comes here once, from their first workspace; the
 * role step takes the marker off the address when it opens, so a reload or the browser's history doesn't reopen it.
 */
export const ROLE_STEP_URL = `${ONBOARDING_URL}?${STEP_PARAM}=${ROLE_STEP}`

/** Whether Onboarding was opened with the role step's marker. */
export const asksForRoleStep = (query: Record<string, string | string[] | undefined>) => query[STEP_PARAM] === ROLE_STEP

/**
 * Where someone goes once they've created or joined a workspace, from what remembering it answered: the role step
 * after their first, else home. Home too when it couldn't be remembered; they're in the workspace all the same.
 */
export function addressAfterArriving(remembered: AuthAnswer<{ first: boolean }>): string {
  return remembered.ok && remembered.data?.first ? ROLE_STEP_URL : HOME
}
