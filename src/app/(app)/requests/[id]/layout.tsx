import { headers } from "next/headers"
import { notFound } from "next/navigation"
import { requestAtAddress } from "./request-at-address"

/**
 * #271 (A117): an unknown Request address answers a real 404. The status can only change before the page starts
 * streaming, and the Request skeleton (loading.tsx, inside this layout) streams first, so the check sits here.
 * Only a full page load waits for it, and on the page's own read (readRequestPage), which it starts anyway. A move
 * inside the app or a read ahead (an RSC request) has no status to set: it goes straight to the skeleton, and the
 * page shows "This Request can't be opened" as before. The root not-found draws that screen for the 404,
 * inside the frame (src/components/shell/missing-in-frame.tsx).
 */
export default async function RequestLayout({ children, params }: { children: React.ReactNode; params: Promise<{ id: string }> }) {
  if ((await headers()).get("rsc") !== "1") {
    const { member, selected } = await requestAtAddress(params)
    if (member && !selected) notFound()
  }
  return children
}
