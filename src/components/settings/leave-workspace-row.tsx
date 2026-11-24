"use client"

import { useId, useState, useSyncExternalStore } from "react"
import { Alert } from "@/components/arc/alert/alert"
import { Button } from "@/components/arc/button/button"
import Link from "@/components/link"
import { PermanentActionConfirmation } from "@/components/popup/permanent-action-confirmation"
import type { AuthAnswer } from "@/lib/auth-answer"
import { ONLY_ADMIN } from "@/lib/auth-error-copy"
import { SettingsRow } from "./settings-group"
import { createConfirmation } from "./workspace-rows-state"
import rows from "./workspace-rows.module.css"

export type LeaveWorkspaceRowProps = {
  workspaceName: string
  /** The person is this workspace's only Admin, who can't leave until someone else is one (#333 Q4). */
  onlyAdmin: boolean
  /** The People list's address, for a new tab; here, the link shows it in place (`onPeopleList`). */
  peopleList: string
  onPeopleList: () => void
  /** Takes the person out of the workspace. Where they go next is the caller's. */
  onLeave: () => Promise<AuthAnswer>
}

/**
 * #381 (#376 stories 89–91, #346 point 4): leaving the workspace, replacing Clerk's. A red Leave workspace asks first.
 * The only Admin finds it greyed with the reason and a link that takes focus to the People list, and a server that
 * refuses for the same reason gets the same words.
 */
export function LeaveWorkspaceRow({ workspaceName, onlyAdmin, peopleList, onPeopleList, onLeave }: LeaveWorkspaceRowProps) {
  const [leave] = useState(() => createConfirmation())
  const state = useSyncExternalStore(leave.subscribe, leave.get, leave.get)
  const reason = useId()

  return <>
    <SettingsRow id="leave-workspace" label={`Leave ${workspaceName}`}
      hint={onlyAdmin
        ? <span id={reason}>{ONLY_ADMIN} <Link href={peopleList} className={rows.peopleLink} onClick={event => {
            if (event.button || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return
            event.preventDefault()
            onPeopleList()
          }}>Make someone an Admin</Link></span>
        : "You lose access straight away. Your Requests and comments stay."}
      control={<Button type="button" variant="danger" size="sm" disabled={onlyAdmin} aria-describedby={onlyAdmin ? reason : undefined} onClick={() => leave.ask()}>Leave workspace</Button>} />
    <PermanentActionConfirmation open={state.open} onOpenChange={open => { if (!open) leave.dismiss() }} busy={state.busy}
      title={`Leave ${workspaceName}?`} description="You lose access straight away. Your Requests and comments stay. An Admin can invite you again."
      confirmLabel="Leave workspace" onConfirm={() => { void leave.confirm(onLeave) }}>
      {state.error && <Alert role="alert" tone="danger" title={state.error} />}
    </PermanentActionConfirmation>
  </>
}
