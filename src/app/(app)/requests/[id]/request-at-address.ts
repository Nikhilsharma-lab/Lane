import "server-only"

import { getMember } from "@/lib/ensure-workspace"
import { readRequestPage } from "@/lib/data/request-page"

/**
 * The signed-in member and the Request at this address, or null when there is none for them to open. The layout's
 * 404 check and the tab title (#271, A114, A117) share it, and readRequestPage is the page's own read, so neither
 * costs a second round trip.
 */
export async function requestAtAddress(params: Promise<{ id: string }>) {
  const [{ id }, member] = await Promise.all([params, getMember()])
  return { member, selected: member ? await readRequestPage(member, id) : null }
}
