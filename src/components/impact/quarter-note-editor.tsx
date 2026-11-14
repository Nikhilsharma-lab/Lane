"use client"

import { useState } from "react"
import { Button } from "@/components/arc/button/button"
import { Textarea } from "@/components/arc/textarea/textarea"
import { DialogClose } from "@/components/popup/adaptive-dialog"
import popupStyles from "@/components/popup/popup.module.css"
import { saveQuarterNote } from "@/app/(app)/impact/quarter-note-actions"
import { callAction } from "@/lib/action-call"
import { TEXT_KEPT, thrownMessage } from "@/lib/failure-messages"
import type { QuarterNoteSlot } from "@/lib/impact-read-model"
import { QUARTER_NOTE_MAX_LENGTH } from "@/lib/quarter-note-rules"
import styles from "./outcome-report.module.css"

// An Admin's editor for one Quarter note (#209), inside the Quarter note popup (quarter-notes.tsx, #283). Loaded only
// when an Admin opens it, so readers never download it.

type SavedNote = QuarterNoteSlot["note"]

const FAILED = `Couldn’t save the Quarter note. ${TEXT_KEPT} Try again.`

export default function QuarterNoteEditor({ orgId, slot, note, onSaved, onSavingChange }: {
  orgId: string
  slot: Pick<QuarterNoteSlot, "year" | "quarter" | "label">
  note: SavedNote
  onSaved: (note: SavedNote) => void
  /** The popup holds still while a save is on its way. */
  onSavingChange: (saving: boolean) => void
}) {
  const [draft, setDraft] = useState(note?.text ?? "")
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState("")

  async function save() {
    if (busy) return
    setBusy(true)
    onSavingChange(true)
    setError("")
    try {
      const result = await callAction(() => saveQuarterNote({ year: slot.year, quarter: slot.quarter, text: draft, expectedEditedAt: note?.editedAt ?? null }, { orgId }))
      if ("error" in result) setError(result.error)
      else onSaved(result.note)
    } catch (thrown) {
      setError(thrownMessage(thrown, FAILED))
    } finally {
      setBusy(false)
      onSavingChange(false)
    }
  }

  // Cancel is a deliberate discard (DialogClose); Escape, the × and a press outside ask first (the popup's guard).
  return <form className={styles.noteForm} aria-busy={busy} onSubmit={event => { event.preventDefault(); void save() }}>
    <Textarea label={`Quarter note for ${slot.label}`} description="Plain text. Web addresses become links. Save it empty to remove the note." maxLength={QUARTER_NOTE_MAX_LENGTH} rows={5}
      value={draft} onChange={event => setDraft(event.target.value)} disabled={busy} autoFocus />
    {error && <p role="alert" className={styles.note}>{error}</p>}
    <div className={popupStyles.actions}>
      <DialogClose asChild><Button type="button" variant="ghost" disabled={busy}>Cancel</Button></DialogClose>
      <Button type="submit" loading={busy}>Save note</Button>
    </div>
  </form>
}
