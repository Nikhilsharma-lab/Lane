"use client"

import { useRef, useState, type FormEvent } from "react"
import { Bookmark, ChevronDown } from "lucide-react"
import { Button } from "@/components/arc/button/button"
import { DropdownMenu, type DropdownItem } from "@/components/arc/dropdown-menu/dropdown-menu"
import { popupCode, usePopupCode } from "@/components/popup/lazy-popup"
import { callAction } from "@/lib/action-call"
import { thrownMessage } from "@/lib/failure-messages"
import { openSavedView, savedViewChoices, type SavedView, type SavedViewChoice } from "@/lib/saved-view-rules"
import { deleteSavedView, renameSavedView, saveView, updateSavedView } from "@/app/(app)/saved-view-actions"
import { useListAnnouncer } from "./list-announcer"
import { useRequestListContext, useSetRequestListView, withSavedView } from "./list-view-state"
import styles from "./saved-view-menu.module.css"

export type DialogKind = Exclude<SavedViewChoice, "update">
const OFFLINE = "We couldn't reach Lane. Check your connection and try again."

// #267: the save, rename and delete dialog's code loads on a press of the control, or when the dialog opens.
const dialogCode = popupCode(() => import("./saved-view-dialog"))

const LABELS: Record<SavedViewChoice, string> = { save: "Save view", update: "Save changes to view", save_as_new: "Save as new view…", rename: "Rename view…", delete: "Delete view…" }

/**
 * #219: the Requests list's saved view control, in its page strip. With no view open it saves the list's filters
 * under a name; with one open it saves changed filters into it, saves them as a new view, renames or deletes it.
 * Views are the person's own; the server checks the owner on every change. Focus returns to the control.
 */
export function SavedViewMenu({ views, orgId }: { views: SavedView[]; orgId: string }) {
  const context = useRequestListContext()
  const setView = useSetRequestListView()
  const announce = useListAnnouncer()
  const open = openSavedView(views, context.savedView)
  const choices = savedViewChoices(open, context)
  // The kind outlives the open state, so the dialog keeps its words while it leaves.
  const [kind, setKind] = useState<DialogKind>("save")
  const [dialogOpen, setDialogOpen] = useState(false)
  const [name, setName] = useState("")
  const [error, setError] = useState("")
  const [pending, setPending] = useState(false)
  const control = useRef<HTMLSpanElement>(null)
  const afterMenu = useRef<DialogKind | null>(null)
  const filters = { status: context.status, project: context.project }

  function show(next: DialogKind) {
    setName(next === "rename" ? open?.name ?? "" : "")
    setError("")
    setKind(next)
    setDialogOpen(true)
  }
  const dialog = usePopupCode(dialogCode, dialogOpen, { id: "popup-unavailable:saved-view", close: () => setDialogOpen(false), retry: () => show(kind) })
  const focusControl = () => requestAnimationFrame(() => control.current?.querySelector<HTMLButtonElement>("button")?.focus({ preventScroll: true }))

  async function run(change: () => Promise<{ error: string } | { ok: true; view?: SavedView }>, done: (view?: SavedView) => void) {
    setPending(true); setError("")
    try {
      const result = await change()
      if ("error" in result) { setError(result.error); return false }
      done(result.view)
      return true
    } catch (thrown) {
      setError(thrownMessage(thrown, OFFLINE))
      return false
    } finally {
      setPending(false)
    }
  }

  async function submit(event: FormEvent) {
    event.preventDefault()
    if (pending || !dialogOpen) return
    if (kind === "delete") {
      if (!open) return
      const gone = open
      if (await run(() => callAction(() => deleteSavedView({ id: gone.id }, { orgId })), () => { setView(view => withSavedView(view, null)); announce(`Deleted the view “${gone.name}”.`) })) setDialogOpen(false)
      return
    }
    const ok = kind === "rename" && open
      ? await run(() => callAction(() => renameSavedView({ id: open.id, name }, { orgId })), view => announce(`Renamed the view to “${view?.name ?? name.trim()}”.`))
      : await run(() => callAction(() => saveView({ name, filters }, { orgId })), view => { if (view) setView(current => withSavedView(current, view)); announce(`Saved the view “${view?.name ?? name.trim()}”.`) })
    if (ok) setDialogOpen(false)
  }

  async function update() {
    if (!open || pending) return
    const saved = open
    await run(() => callAction(() => updateSavedView({ id: saved.id, filters }, { orgId })), () => announce(`Saved changes to the view “${saved.name}”.`))
  }

  const items: DropdownItem[] = choices.filter(choice => choice !== "save").map(choice => ({
    label: LABELS[choice], destructive: choice === "delete", separatorBefore: choice === "delete",
    onSelect: choice === "update" ? () => { void update() } : () => { afterMenu.current = choice },
  }))

  return <span ref={control} className={styles.control}>
    {open
      ? <DropdownMenu label="Saved view" items={items}
          trigger={<Button variant="secondary" size="sm" aria-label="Saved view" onPointerDown={dialogCode.preload} onFocus={dialogCode.preload}><Bookmark data-icon-size="sm" strokeWidth={1.75} aria-hidden="true" /><span className={styles.label}>Saved view</span><ChevronDown data-icon-size="sm" strokeWidth={1.75} aria-hidden="true" /></Button>}
          onCloseAutoFocus={event => {
            const next = afterMenu.current
            if (!next) return
            event.preventDefault()
            afterMenu.current = null
            show(next)
          }} />
      : <Button variant="secondary" size="sm" aria-label="Save view" onClick={() => show("save")} onPointerDown={dialogCode.preload} onFocus={dialogCode.preload}><Bookmark data-icon-size="sm" strokeWidth={1.75} aria-hidden="true" /><span className={styles.label}>Save view</span></Button>}
    {/* An update's failure has no dialog to speak in; it is read here. */}
    {error && !dialogOpen && <span className={styles.error} role="alert">{error}</span>}
    {dialog && <dialog.SavedViewDialog open={dialogOpen} kind={kind} view={open} name={name} error={error} pending={pending}
      onOpenChange={next => { if (!pending && !next) setDialogOpen(false) }} onSubmit={submit} onCloseAutoFocus={focusControl}
      onNameChange={value => { setName(value); setError("") }} />}
  </span>
}
