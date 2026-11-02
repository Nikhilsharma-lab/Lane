import Link from "@/components/link"
import { Inbox } from "lucide-react"
import { EmptyState } from "@/components/arc/empty-state/empty-state"
import buttonStyles from "@/components/arc/button/button.module.css"
import { PageStrip } from "@/components/shell/page-strip"
import { DetailArrivalReset } from "./detail-context"
import { DetailBackLink } from "./detail-back-link"

// #271: its own module, apart from detail-view.tsx, so the unknown-Request 404 (shell/missing-in-frame.tsx) carries
// none of the detail islands.
const secondaryLink = `${buttonStyles.button} ${buttonStyles.secondary} ${buttonStyles.sm}`

/** The strip names the state as the page h1; the body says what happened, as the error frames do.
 * Plan item 2.5: a missing Request and one this person may not see read the same, with no existence leak.
 * Reached with J or K, its heading takes the focus the title would have had. */
export function RequestUnavailable({ returnHref, requestId }: { returnHref: string; requestId?: string }) {
  return <section className="flex min-w-0 flex-1 flex-col"><DetailArrivalReset requestId={requestId} /><PageStrip leading={<DetailBackLink href={returnHref} always />} title="Request unavailable" heading /><div className="flex flex-1 items-center justify-center p-5"><EmptyState icon={<Inbox />} title="This Request can’t be opened" description="It couldn’t be found or is not available in this workspace." action={<Link className={secondaryLink} href={returnHref}>Back to Requests</Link>} /></div></section>
}
