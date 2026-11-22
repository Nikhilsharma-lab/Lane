"use client"

import { useId, useState, useSyncExternalStore } from "react"
import { Alert } from "@/components/arc/alert/alert"
import { Button } from "@/components/arc/button/button"
import Link from "@/components/link"
import { PermanentActionConfirmation } from "@/components/popup/permanent-action-confirmation"
import { ONLY_ADMIN } from "@/lib/auth-error-copy"
import { SettingsRow } from "./settings-group"
import { createConfirmation, type WorkspaceAnswer } from "./workspace-rows-state"
import rows from "./workspace-rows.module.css"

export type LeaveWorkspaceRowProps = {
  workspaceName: string
  /** The person is this workspace's only Admin, who can't leave until someone else is one (#333 Q4). */
  onlyAdmin: boolean
  /** Where the People list is: `#id` on this page, or a page and its fragment (increment 5 decides, #376). */
  peopleList: string
  /** Takes the person out of the workspace. Where they go next is the caller's. */
  onLeave: () => Promise<WorkspaceAnswer>
}

type Page = { location: Pick<Location, "href" | "pathname">; getElementById: (id: string) => { focus: () => void } | null }

/**
 * Moves focus to the element `href` points at when it's on the page already showing, and says whether it did; a
 * link to another page navigates as usual.
 */
export function focusOnThisPage(href: string, page: Page = document): boolean {
  const url = new URL(href, page.location.href)
  if (url.pathname !== page.location.pathname || !url.hash) return false
  const target = page.getElementById(decodeURIComponent(url.hash.slice(1)))
  target?.focus()
  return !!target
}

/**
 * #381 (#376 stories 89–91, #346 point 4): leaving the workspace, replacing Clerk's. A red Leave workspace asks first.
 * The only Admin finds it greyed with the reason and a link that takes focus to the People list, and a server that
 * refuses for the same reason gets the same words. Dormant until increment 5 mounts it.
 */
export function LeaveWorkspaceRow({ workspaceName, onlyAdmin, peopleList, onLeave }: LeaveWorkspaceRowProps) {
  const [leave] = useState(() => createConfirmation())
  const state = useSyncExternalStore(leave.subscribe, leave.get, leave.get)
  const reason = useId()

  return <>
    <SettingsRow label={`Leave ${workspaceName}`}
      hint={onlyAdmin
        ? <span id={reason}>{ONLY_ADMIN} <Link href={peopleList} className={rows.peopleLink} onClick={event => { if (focusOnThisPage(peopleList)) event.preventDefault() }}>Make someone an Admin</Link></span>
        : "You lose access straight away. Your Requests and comments stay."}
      control={<Button type="button" variant="danger" size="sm" disabled={onlyAdmin} aria-describedby={onlyAdmin ? reason : undefined} onClick={() => leave.ask()}>Leave workspace</Button>} />
    <PermanentActionConfirmation open={state.open} onOpenChange={open => { if (!open) leave.dismiss() }} busy={state.busy}
      title={`Leave ${workspaceName}?`} description="You lose access straight away. Your Requests and comments stay. An Admin can invite you again."
      confirmLabel="Leave workspace" onConfirm={() => { void leave.confirm(onLeave) }}>
      {state.error && <Alert role="alert" tone="danger" title={state.error} />}
    </PermanentActionConfirmation>
  </>
}
