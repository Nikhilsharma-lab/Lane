"use client"

import { useLayoutEffect, useRef, useState, type FormEvent } from "react"
import { Bookmark, ChevronDown } from "lucide-react"
import { Button } from "@/components/arc/button/button"
import { Dialog, DialogClose, DialogContent } from "@/components/popup/adaptive-dialog"
import { PermanentActionConfirmation } from "@/components/popup/permanent-action-confirmation"
import { DropdownMenu, type DropdownItem } from "@/components/arc/dropdown-menu/dropdown-menu"
import { Input } from "@/components/arc/input/input"
import { useToastStack } from "@/components/arc/toast-stack/toast-stack"
import { charactersLeftNote } from "@/lib/character-count"
import { isOffline } from "@/lib/connection-status"
import {
  openSavedView, parseSavedViewName, SAVED_VIEW_NAME_MAX, savedViewChoices, savedViewNameTaken,
  type SavedView, type SavedViewChoice, type SavedViewFilters,
} from "@/lib/saved-view-rules"
import { deleteSavedView, renameSavedView, saveView, updateSavedView } from "@/app/(app)/saved-view-actions"
import { useListAnnouncer } from "./list-announcer"
import { useSetRequestListView, withSavedView } from "./list-view-state"
import { useRequestListFilters } from "./list-filters"
import { unsavedViewId, useSavedViewsStore, withView, type SavedViewsChange } from "./saved-views-store"
import { failureToast, useOptimisticAction } from "./use-optimistic-action"
import styles from "./saved-view-menu.module.css"

type NameKind = "save" | "save_as_new" | "rename"
type Answer = { ok: true; view?: SavedView } | { error: string }

const TITLES: Record<NameKind, string> = { save: "Save view", save_as_new: "Save as new view", rename: "Rename view" }
const LABELS: Record<SavedViewChoice, string> = { save: "Save view", update: "Save changes to view", save_as_new: "Save as new view…", rename: "Rename view…", delete: "Delete view…" }
// A223 (#240 decision 11).
const DELETE_NOTE = "The view is removed from your sidebar. Your Requests don’t change."

/**
 * #219: the Requests list's saved view control, in its page strip. With no view open it saves the list's filters
 * under a name; with one open it saves changed filters into it, saves them as a new view, renames or deletes it.
 * Views are the person's own; the server checks the owner on every change.
 * #276: a name is checked here before anything is sent (A222). Each change shows at once, here and in the sidebar's
 * "Your views" (saved-views-store.tsx), and goes back with the shared "Couldn’t save" message and its Try again when
 * the server refuses it. Focus stays on the control as Save view and Saved view swap (A26).
 */
export function SavedViewMenu({ views, orgId }: { views: SavedView[]; orgId: string }) {
  const context = useRequestListFilters()
  const setView = useSetRequestListView()
  const announce = useListAnnouncer()
  const store = useSavedViewsStore()
  const optimistic = useOptimisticAction()
  const { toast } = useToastStack()
  const open = openSavedView(views, context.savedView)
  const choices = savedViewChoices(open, context)
  // The kind and the view being deleted outlive their dialogs' open state, so each keeps its words while it leaves.
  const [kind, setKind] = useState<NameKind>("save")
  const [dialogOpen, setDialogOpen] = useState(false)
  const [deleting, setDeleting] = useState<SavedView | null>(null)
  const [confirmOpen, setConfirmOpen] = useState(false)
  const [name, setName] = useState("")
  const [error, setError] = useState("")
  const control = useRef<HTMLSpanElement>(null)
  const afterMenu = useRef<SavedViewChoice | null>(null)
  const refocus = useRef(false)
  const filters: SavedViewFilters = { status: context.status, project: context.project, title: context.title }

  const controlButton = () => control.current?.querySelector<HTMLButtonElement>("button") ?? null
  const focusControl = () => requestAnimationFrame(() => controlButton()?.focus({ preventScroll: true }))
  // A change that goes back swaps Saved view and Save view; when one of them had focus, the other takes it.
  useLayoutEffect(() => {
    if (!refocus.current) return
    refocus.current = false
    if (!document.activeElement || document.activeElement === document.body) controlButton()?.focus({ preventScroll: true })
  })

  /**
   * Shows `change` at once and sends `request`. Offline nothing is shown or sent and the shared offline answer says
   * so. A refusal takes the change back with the shared toast, whose Try again runs `retry`. False when nothing showed.
   */
  function send(change: SavedViewsChange, request: () => Promise<Answer>, then: { accepted?: (saved?: SavedView) => void; refused?: () => void; retry: () => void }) {
    const token = isOffline() ? null : store?.begin(change) ?? 0
    void optimistic({
      id: "saved-view",
      run: request,
      onError: (message, { offline }) => toast(failureToast(message, { offline, retry: async () => then.retry() })),
    }).then(outcome => {
      if (outcome.status === "success") {
        const saved = "view" in outcome.value ? outcome.value.view : undefined
        if (token) store?.accept(token, saved && withView(saved))
        then.accepted?.(saved)
        return
      }
      if (token === null) return
      refocus.current = Boolean(control.current?.contains(document.activeElement))
      if (token) store?.rollback(token)
      then.refused?.()
    })
    return token !== null
  }

  function saveAs(viewName: string, saved: SavedViewFilters, previous: string | undefined): boolean {
    const standIn: SavedView = { id: unsavedViewId(), name: viewName, filters: saved }
    const shows = send(withView(standIn), () => saveView({ name: viewName, filters: saved }, { orgId }), {
      accepted: view => { if (view) setView(current => current.savedView === standIn.id ? { ...current, savedView: view.id } : current) },
      refused: () => setView(current => current.savedView === standIn.id ? { ...current, savedView: previous } : current),
      retry: () => { saveAs(viewName, saved, previous) },
    })
    if (!shows) return false
    // The list already shows these filters: the view opens as it is, each group as far as it was shown.
    setView(current => ({ ...current, savedView: standIn.id }))
    announce(`Saved the view “${viewName}”.`)
    return true
  }

  function rename(view: SavedView, next: string): boolean {
    const shows = send(views => views.map(item => item.id === view.id ? { ...item, name: next } : item), () => renameSavedView({ id: view.id, name: next }, { orgId }), { retry: () => { rename(view, next) } })
    if (shows) announce(`Renamed the view to “${next}”.`)
    return shows
  }

  function update(view: SavedView, saved: SavedViewFilters) {
    if (send(views => views.map(item => item.id === view.id ? { ...item, filters: saved } : item), () => updateSavedView({ id: view.id, filters: saved }, { orgId }), { retry: () => update(view, saved) }))
      announce(`Saved changes to the view “${view.name}”.`)
  }

  function remove(view: SavedView): boolean {
    const shows = send(views => views.filter(item => item.id !== view.id), () => deleteSavedView({ id: view.id }, { orgId }), {
      refused: () => setView(current => current.savedView === undefined ? { ...current, savedView: view.id } : current),
      retry: () => { remove(view) },
    })
    if (!shows) return false
    setView(current => current.savedView === view.id ? withSavedView(current, null) : current)
    announce(`Deleted the view “${view.name}”.`)
    return true
  }

  function show(next: SavedViewChoice) {
    if (next === "delete") { setDeleting(open); setConfirmOpen(true); return }
    if (next === "update") return
    setName(next === "rename" ? open?.name ?? "" : "")
    setError("")
    setKind(next)
    setDialogOpen(true)
  }

  function submit(event: FormEvent) {
    event.preventDefault()
    if (!dialogOpen) return
    // A222: the name is checked here, so the dialog says what's wrong before anything is sent.
    const parsed = parseSavedViewName(name)
    if ("error" in parsed) { setError(parsed.error); return }
    const renaming = kind === "rename" ? open : null
    if (kind === "rename" && !renaming) return
    if (views.some(view => view.id !== renaming?.id && view.name.toLowerCase() === parsed.name.toLowerCase())) { setError(savedViewNameTaken(parsed.name)); return }
    const shows = renaming
      ? parsed.name === renaming.name || rename(renaming, parsed.name)
      : saveAs(parsed.name, filters, context.savedView)
    if (shows) setDialogOpen(false)
  }

  const items: DropdownItem[] = choices.filter(choice => choice !== "save").map(choice => ({
    label: LABELS[choice], destructive: choice === "delete", separatorBefore: choice === "delete",
    onSelect: choice === "update" ? () => { if (open) update(open, filters) } : () => { afterMenu.current = choice },
  }))

  return <span ref={control} className={styles.control}>
    {open
      ? <DropdownMenu label="Saved view" items={items}
          trigger={<Button variant="secondary" size="sm" aria-label="Saved view"><Bookmark data-icon-size="sm" strokeWidth={1.75} aria-hidden="true" /><span className={styles.label}>Saved view</span><ChevronDown data-icon-size="sm" strokeWidth={1.75} aria-hidden="true" /></Button>}
          onCloseAutoFocus={event => {
            const next = afterMenu.current
            if (!next) return
            event.preventDefault()
            afterMenu.current = null
            show(next)
          }} />
      : <Button variant="secondary" size="sm" aria-label="Save view" onClick={() => show("save")}><Bookmark data-icon-size="sm" strokeWidth={1.75} aria-hidden="true" /><span className={styles.label}>Save view</span></Button>}
    <Dialog guardTypedText open={dialogOpen} onOpenChange={next => { if (!next) setDialogOpen(false) }}>
      <DialogContent title={TITLES[kind]}
        description={kind === "rename" ? undefined : "Saves this list’s status, Project and title filters under a name. Only you see your views."}
        // A26: by now the control is the one the change left, Saved view after a first save.
        onCloseAutoFocus={event => { event.preventDefault(); focusControl() }}>
        <form className={styles.form} onSubmit={submit} noValidate>
          <Input label="Name" value={name} maxLength={SAVED_VIEW_NAME_MAX} autoComplete="off" autoFocus required
            error={error || undefined} description={charactersLeftNote(name, SAVED_VIEW_NAME_MAX)}
            onChange={event => { setName(event.target.value); setError("") }} />
          <div className={styles.actions}>
            <DialogClose asChild><Button type="button" variant="ghost">Cancel</Button></DialogClose>
            <Button type="submit" variant="primary">{kind === "rename" ? "Rename view" : "Save view"}</Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
    {/* A223: the red confirm, opening on Cancel. */}
    <PermanentActionConfirmation open={confirmOpen} onOpenChange={setConfirmOpen} title={`Delete “${deleting?.name ?? ""}”?`}
      description={DELETE_NOTE} confirmLabel="Delete view" returnFocus={controlButton}
      onConfirm={() => { if (deleting && remove(deleting)) setConfirmOpen(false) }} />
  </span>
}
