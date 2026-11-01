"use client"

import type { FormEvent } from "react"
import { Button } from "@/components/arc/button/button"
import { Dialog, DialogClose, DialogContent } from "@/components/popup/adaptive-dialog"
import { Input } from "@/components/arc/input/input"
import { SAVED_VIEW_NAME_MAX, type SavedView } from "@/lib/saved-view-rules"
import type { DialogKind } from "./saved-view-menu"
import styles from "./saved-view-menu.module.css"

const TITLES: Record<DialogKind, string> = { save: "Save view", save_as_new: "Save as new view", rename: "Rename view", delete: "Delete view" }

/** #219: the saved view control's dialog (saved-view-menu.tsx keeps its state): save, save as new, rename or delete. */
export function SavedViewDialog({ open, kind, view, name, error, pending, onOpenChange, onSubmit, onCloseAutoFocus, onNameChange }: {
  open: boolean
  kind: DialogKind
  /** The saved view open in the list, if any. */
  view: SavedView | null | undefined
  name: string
  error: string
  pending: boolean
  onOpenChange: (open: boolean) => void
  onSubmit: (event: FormEvent) => void
  onCloseAutoFocus: () => void
  onNameChange: (name: string) => void
}) {
  return <Dialog guardTypedText open={open} onOpenChange={onOpenChange}>
      <DialogContent title={kind === "delete" && view ? `Delete “${view.name}”?` : TITLES[kind]}
        description={kind === "delete" ? "The view leaves your navigation. The list keeps its filters, and no Request changes."
          : kind === "rename" ? undefined : "Saves this list’s status and Project filters under a name. Only you see your views."}
        onCloseAutoFocus={event => { event.preventDefault(); onCloseAutoFocus() }}>
        <form className={styles.form} onSubmit={onSubmit} noValidate>
          {kind !== "delete" && <Input label="Name" value={name} maxLength={SAVED_VIEW_NAME_MAX} autoComplete="off" autoFocus required
            error={error || undefined} onChange={event => onNameChange(event.target.value)} />}
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
}
