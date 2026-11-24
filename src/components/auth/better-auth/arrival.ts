import { rememberLastUsed } from "@/app/(app)/workspace-actions"
import { callAction } from "@/lib/action-call"
import { settle } from "@/lib/auth-answer"
import { addressAfterArriving } from "@/lib/onboarding-address"

/**
 * #391: call it once an invitation is accepted. Saves the joined workspace as the person's last-used one and answers
 * where to go now, by a full page load: the role step after their first workspace, else home.
 */
export async function rememberJoined(): Promise<string> {
  return addressAfterArriving(await settle(() => callAction(() => rememberLastUsed())))
}
