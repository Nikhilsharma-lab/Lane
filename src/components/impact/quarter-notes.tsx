"use client"

import { useRef, useState } from "react"
import { Button } from "@/components/arc/button/button"
import { Textarea } from "@/components/arc/textarea/textarea"
import { saveQuarterNote } from "@/app/(app)/impact/quarter-note-actions"
import { callAction } from "@/lib/action-call"
import { quarterStarted } from "@/lib/impact-period"
import type { QuarterNoteSlot } from "@/lib/impact-read-model"
import { noteSegments, QUARTER_NOTE_MAX_LENGTH } from "@/lib/quarter-note-rules"
import { journeyDay } from "@/lib/request-journey"
import styles from "./outcome-report.module.css"

// The Quarter notes at the end of the Outcome report (#209): the team's own words, one per quarter, with who last edited
// each and when. Everyone who sees the report reads them; only an Admin gets the write and edit controls, and the
// server refuses anyone else (saveQuarterNote).

/** Where an Admin's edits go: the workspace from the page. Null for everyone else. */
export type QuarterNoteEditor = { orgId: string } | null

const FAILED = "Could not save the Quarter note. Your text is kept; try again."

function NoteText({ text }: { text: string }) {
  return <p className={styles.noteBody}>{noteSegments(text).map((segment, index) => segment.kind === "link"
    ? <a key={index} href={segment.href} className={styles.noteLink} rel="noopener noreferrer" target="_blank">{segment.href}</a>
    : <span key={index}>{segment.text}</span>)}</p>
}

function QuarterNote({ slot, editor, asOf, heading }: { slot: QuarterNoteSlot; editor: QuarterNoteEditor; asOf: string; heading: "h2" | "h3" }) {
  const [note, setNote] = useState(slot.note)
  const [draft, setDraft] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState("")
  const opener = useRef<HTMLButtonElement>(null)
  const headingId = `quarter-note-${slot.year}-q${slot.quarter}`
  const Heading = heading
  // A note is written during or after its quarter, never before; the server refuses the same.
  const writable = editor !== null && quarterStarted(slot.year, slot.quarter, new Date(`${asOf}T23:59:59.999Z`))

  const close = () => {
    setDraft(null)
    setError("")
    // Focus goes back to the control that opened the editor, so keyboard users keep their place.
    requestAnimationFrame(() => opener.current?.focus())
  }

  async function save() {
    if (!editor || draft === null || busy) return
    setBusy(true)
    setError("")
    try {
      const result = await callAction(() => saveQuarterNote({ year: slot.year, quarter: slot.quarter, text: draft, expectedEditedAt: note?.editedAt ?? null }, editor))
      if ("error" in result) setError(result.error)
      else {
        setNote(result.note)
        close()
      }
    } catch {
      setError(FAILED)
    } finally {
      setBusy(false)
    }
  }

  return <section className={styles.quarterNote} aria-labelledby={headingId}>
    <Heading id={headingId} className={heading === "h2" ? styles.heading : styles.projectHeading}>{heading === "h2" ? `Quarter note, ${slot.label}` : slot.label}</Heading>
    {note
      ? <>
        <NoteText text={note.text} />
        <p className={styles.note}>Last edited by {note.editorName} on <time dateTime={note.editedAt}>{journeyDay(note.editedAt)}</time>.</p>
      </>
      : draft === null && <p className={styles.note}>No Quarter note for {slot.label}.</p>}
    {writable && draft === null && <div className={styles.noteControls}>
      <Button ref={opener} variant="secondary" size="sm" onClick={() => setDraft(note?.text ?? "")}>{note ? `Edit the ${slot.label} note` : `Write the ${slot.label} note`}</Button>
    </div>}
    {writable && draft !== null && <form className={styles.noteForm} aria-busy={busy} onSubmit={event => { event.preventDefault(); void save() }}>
      <Textarea label={`Quarter note for ${slot.label}`} description="Plain text. Web addresses become links. Save it empty to remove the note." maxLength={QUARTER_NOTE_MAX_LENGTH} rows={5}
        value={draft} onChange={event => setDraft(event.target.value)} disabled={busy} autoFocus
        onKeyDown={event => { if (event.key === "Escape" && !busy) { event.preventDefault(); close() } }} />
      {error && <p role="alert" className={styles.note}>{error}</p>}
      <div className={styles.noteControls}>
        <Button type="submit" size="sm" disabled={busy}>{busy ? "Saving…" : "Save note"}</Button>
        <Button type="button" variant="ghost" size="sm" disabled={busy} onClick={close}>Cancel</Button>
      </div>
    </form>}
  </section>
}

/** The report's last section: one quarter's note, or a year's four. Nothing for a month. */
export function QuarterNotes({ slots, editor, asOf }: { slots: QuarterNoteSlot[]; editor: QuarterNoteEditor; asOf: string }) {
  if (slots.length === 0) return null
  if (slots.length === 1) return <QuarterNote key={`${slots[0].year}-${slots[0].quarter}`} slot={slots[0]} editor={editor} asOf={asOf} heading="h2" />
  return <section className={styles.block} aria-labelledby="report-quarter-notes-heading">
    <h2 id="report-quarter-notes-heading" className={styles.heading}>Quarter notes</h2>
    {slots.map(slot => <QuarterNote key={`${slot.year}-${slot.quarter}`} slot={slot} editor={editor} asOf={asOf} heading="h3" />)}
  </section>
}
