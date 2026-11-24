import { requestSession } from "@/lib/auth-client"

let asked = false

/** Asks for the session, once for this load of the page however often the frame mounts. A failure waits for the next one. */
export async function keepSession() {
  if (asked) return
  asked = true
  await requestSession()
}
