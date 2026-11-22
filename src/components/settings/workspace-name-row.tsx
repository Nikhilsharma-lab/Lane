"use client"

import { useRef, useState, useSyncExternalStore, type FormEvent } from "react"
import { Button } from "@/components/arc/button/button"
import { Input } from "@/components/arc/input/input"
import type { AuthAnswer } from "@/lib/auth-answer"
import type { WorkspacePermission } from "@/lib/auth-guard"
import { managesWorkspace } from "@/lib/role-rules"
import { SettingsRow } from "./settings-group"
import { canSaveName, createWorkspaceNameDraft } from "./workspace-rows-state"
import rows from "./workspace-rows.module.css"

export type WorkspaceNameRowProps = {
  /** The workspace's name as the server last read it. */
  name: string
  /** The person's role in this workspace; only an Admin renames it. */
  role: WorkspacePermission | null
  /** Renames the workspace to the trimmed name. */
  onRename: (name: string) => Promise<AuthAnswer>
}

/**
 * #381 (#376 stories 85, 86): the workspace name, replacing Clerk's. An Admin edits it in place, with Save offered
 * only once the name has changed and isn't empty. A refused rename says why on the field, keeps what was typed and
 * takes focus back to it. Everyone else reads the name and who can change it. Dormant until increment 5 mounts it.
 */
export function WorkspaceNameRow({ name, role, onRename }: WorkspaceNameRowProps) {
  const admin = role !== null && managesWorkspace(role)
  return <SettingsRow label="Workspace name" hint={admin ? "Everyone in the workspace sees it." : "Only Admins can change it."}
    control={admin ? <WorkspaceNameForm name={name} onRename={onRename} /> : <span>{name}</span>} />
}

function WorkspaceNameForm({ name, onRename }: { name: string; onRename: WorkspaceNameRowProps["onRename"] }) {
  const [draft] = useState(() => createWorkspaceNameDraft(name))
  const state = useSyncExternalStore(draft.subscribe, draft.get, draft.get)
  const field = useRef<HTMLInputElement>(null)

  async function save(event: FormEvent) {
    event.preventDefault()
    if (!await draft.save(onRename)) field.current?.focus()
  }

  return <form className={rows.nameForm} onSubmit={event => { void save(event) }} noValidate aria-label="Workspace name" aria-busy={state.busy || undefined}>
    <Input ref={field} label="Workspace name" hideLabel name="workspace-name" autoComplete="organization" value={state.value} readOnly={state.busy}
      error={state.error ?? undefined} onChange={event => draft.type(event.target.value)} />
    <Button type="submit" variant="secondary" size="sm" loading={state.busy} disabled={!canSaveName(state)}>Save</Button>
  </form>
}
