"use client"

import { useRef, useState, type FormEvent } from "react"
import { Bookmark } from "lucide-react"
import { Button } from "@/components/arc/button/button"
import { Dialog, DialogClose, DialogContent } from "@/components/arc/dialog/dialog"
import { DropdownMenu, type DropdownItem } from "@/components/arc/dropdown-menu/dropdown-menu"
import { Input } from "@/components/arc/input/input"
import { callAction } from "@/lib/action-call"
import { openSavedView, SAVED_VIEW_NAME_MAX, savedViewChoices, type SavedView, type SavedViewChoice } from "@/lib/saved-view-rules"
import { deleteSavedView, renameSavedView, saveView, updateSavedView } from "@/app/(app)/saved-view-actions"
import { useListAnnouncer } from "./list-announcer"
import { useRequestListContext, useSetRequestListView, withSavedView } from "./list-view-state"
import styles from "./saved-view-menu.module.css"

type DialogKind = Exclude<SavedViewChoice, "update">
const OFFLINE = "We couldn't reach Lane. Check your connection and try again."

const TITLES: Record<DialogKind, string> = { save: "Save view", save_as_new: "Save as new view", rename: "Rename view", delete: "Delete view" }
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
  const focusControl = () => requestAnimationFrame(() => control.current?.querySelector<HTMLButtonElement>("button")?.focus({ preventScroll: true }))

  async function run(change: () => Promise<{ error: string } | { ok: true; view?: SavedView }>, done: (view?: SavedView) => void) {
    setPending(true); setError("")
    try {
      const result = await change()
      if ("error" in result) { setError(result.error); return false }
      done(result.view)
      return true
    } catch {
      setError(OFFLINE)
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
      ? <DropdownMenu label="Saved view" icon={<Bookmark data-icon-size="sm" strokeWidth={1.75} />} items={items}
          onCloseAutoFocus={event => {
            const next = afterMenu.current
            if (!next) return
            event.preventDefault()
            afterMenu.current = null
            show(next)
          }} />
      : <Button variant="secondary" size="sm" onClick={() => show("save")}><Bookmark data-icon-size="sm" strokeWidth={1.75} aria-hidden="true" />Save view</Button>}
    {/* An update's failure has no dialog to speak in; it is read here. */}
    {error && !dialogOpen && <span className={styles.error} role="alert">{error}</span>}
    <Dialog open={dialogOpen} onOpenChange={next => { if (!pending && !next) setDialogOpen(false) }}>
      <DialogContent title={kind === "delete" && open ? `Delete “${open.name}”?` : TITLES[kind]}
        description={kind === "delete" ? "The view leaves your navigation. The list keeps its filters, and no Request changes."
          : kind === "rename" ? undefined : "Saves this list’s status and Project filters under a name. Only you see your views."}
        onCloseAutoFocus={event => { event.preventDefault(); focusControl() }}>
        <form className={styles.form} onSubmit={submit} noValidate>
          {kind !== "delete" && <Input label="Name" value={name} maxLength={SAVED_VIEW_NAME_MAX} autoComplete="off" autoFocus required
            error={error || undefined} onChange={event => { setName(event.target.value); setError("") }} />}
          {kind === "delete" && error && <p className={styles.error} role="alert">{error}</p>}
          <div className={styles.actions}>
            <DialogClose asChild><Button type="button" variant="ghost" disabled={pending}>Cancel</Button></DialogClose>
            <Button type="submit" variant={kind === "delete" ? "danger" : "primary"} loading={pending}>
              {kind === "delete" ? "Delete view" : kind === "rename" ? "Rename view" : "Save view"}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  </span>
}
