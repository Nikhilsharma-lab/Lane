"use client"

import { useState } from "react"
import { Button } from "@/components/arc/button/button"
import { Textarea } from "@/components/arc/textarea/textarea"
import { saveQuarterNote } from "@/app/(app)/impact/quarter-note-actions"
import { callAction } from "@/lib/action-call"
import { thrownMessage } from "@/lib/failure-messages"
import type { QuarterNoteSlot } from "@/lib/impact-read-model"
import { QUARTER_NOTE_MAX_LENGTH } from "@/lib/quarter-note-rules"
import styles from "./outcome-report.module.css"

// An Admin's editor for one Quarter note (#209). Loaded only when an Admin opens it, so readers never download it.

type SavedNote = QuarterNoteSlot["note"]

const FAILED = "Could not save the Quarter note. Your text is kept; try again."

export default function QuarterNoteEditor({ orgId, slot, note, onSaved, onCancel }: {
  orgId: string
  slot: Pick<QuarterNoteSlot, "year" | "quarter" | "label">
  note: SavedNote
  onSaved: (note: SavedNote) => void
  onCancel: () => void
}) {
  const [draft, setDraft] = useState(note?.text ?? "")
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState("")

  async function save() {
    if (busy) return
    setBusy(true)
    setError("")
    try {
      const result = await callAction(() => saveQuarterNote({ year: slot.year, quarter: slot.quarter, text: draft, expectedEditedAt: note?.editedAt ?? null }, { orgId }))
      if ("error" in result) setError(result.error)
      else onSaved(result.note)
    } catch (thrown) {
      setError(thrownMessage(thrown, FAILED))
    } finally {
      setBusy(false)
    }
  }

  return <form className={styles.noteForm} aria-busy={busy} onSubmit={event => { event.preventDefault(); void save() }}>
    <Textarea label={`Quarter note for ${slot.label}`} description="Plain text. Web addresses become links. Save it empty to remove the note." maxLength={QUARTER_NOTE_MAX_LENGTH} rows={5}
      value={draft} onChange={event => setDraft(event.target.value)} disabled={busy} autoFocus
      onKeyDown={event => { if (event.key === "Escape" && !busy) { event.preventDefault(); onCancel() } }} />
    {error && <p role="alert" className={styles.note}>{error}</p>}
    <div className={styles.noteControls}>
      <Button type="submit" size="sm" loading={busy}>Save note</Button>
      <Button type="button" variant="ghost" size="sm" disabled={busy} onClick={onCancel}>Cancel</Button>
    </div>
  </form>
}
