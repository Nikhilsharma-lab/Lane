"use client"

import Link from "next/link"
import type { ReactNode } from "react"
import { ArrowLeft, Ellipsis, Hash, Link2 } from "lucide-react"
import { Button } from "@/components/arc/button/button"
import { DropdownMenu, type DropdownItem } from "@/components/arc/dropdown-menu/dropdown-menu"
import buttonStyles from "@/components/arc/button/button.module.css"
import { PageStrip } from "@/components/shell/page-strip"
import { requestListHref } from "@/lib/request-workspace"
import { CopyButton } from "./copy-button"
import { useDetailRequest } from "./detail-context"
import { DetailSequence, useDetailSequence } from "./detail-sequence"
import { useRequestListContext } from "./list-view-state"
import { useCopy } from "./use-copy"
import styles from "./detail.module.css"

/** The phone's way back. Desktop has no close control: the crumbs and Esc return to the list.
 * `always` shows it at every width (Request unavailable, which has no content to return from). */
export function DetailBackLink({ href, always = false }: { href: string; always?: boolean }) {
  return <Link href={href} aria-label="Back to Requests" className={`${buttonStyles.button} ${buttonStyles.ghost} ${buttonStyles.sm} ${styles.iconButton} ${always ? "" : styles.back}`}>
    <ArrowLeft size={16} aria-hidden="true" />
  </Link>
}

/** The canonical link the row menu also copies, read at the press: the origin is a browser-only value. */
const requestLink = (id: string) => new URL(`/requests/${id}`, window.location.origin).href

/** At 640px and below the copy and sequence tools fold into one menu. It renders only when it has items. */
function PhoneOverflow() {
  const { request, code } = useDetailRequest()
  const { position, go } = useDetailSequence(request.id)
  const copy = useCopy()
  const items: DropdownItem[] = [
    { label: "Copy link", onSelect: () => { void copy(requestLink(request.id), "Link copied.") } },
    ...(code ? [{ label: "Copy code", onSelect: () => { void copy(code, `${code} copied.`) } }] : []),
    ...(position?.previousId ? [{ label: "Previous Request", separatorBefore: true, onSelect: () => { go("previous") } }] : []),
    ...(position?.nextId ? [{ label: "Next Request", separatorBefore: !position.previousId, onSelect: () => { go("next") } }] : []),
  ]
  return <span className={styles.phoneOnly}>
    <DropdownMenu label="More actions" items={items}
      trigger={<Button variant="ghost" size="sm" morph="plain" className={styles.iconButton} aria-label="More actions"><Ellipsis size={16} strokeWidth={1.75} aria-hidden="true" /></Button>} />
  </span>
}

/**
 * Plan item 2.5: Request detail's one 44px strip. `Workspace / Project / LAN-12`,
 * Copy link, Copy code, the "2 / 5" sequence and one action slot. The slot
 * holds Pick up or Mark Done, or nothing: for a guest, a Done Request, or
 * while a section form the viewer opened is the page's one filled button.
 */
export function DetailStrip({ returnHref, action }: { returnHref: string; action?: ReactNode }) {
  const { request, code, formsOpen } = useDetailRequest()
  const listContext = useRequestListContext()
  // The Request's own Project keeps the list's status view; no Project, or one this person cannot see, leaves only the workspace.
  const parent = request.projectId && request.projectName ? { label: request.projectName, href: requestListHref(listContext?.status ?? "all", request.projectId) } : null
  return <PageStrip compactTrail parent={parent} title={code ?? "Request"}
    leading={<DetailBackLink href={returnHref} />}
    tools={<span className={styles.desktopTools}>
      <CopyButton label="Copy link" value={() => requestLink(request.id)} copied="Link copied." icon={<Link2 size={16} strokeWidth={1.75} aria-hidden="true" />} />
      {code && <CopyButton label={`Copy code ${code}`} value={code} copied={`${code} copied.`} icon={<Hash size={16} strokeWidth={1.75} aria-hidden="true" />} />}
      <DetailSequence requestId={request.id} />
    </span>}
    action={formsOpen > 0 ? undefined : action}
    overflow={<PhoneOverflow />} />
}
