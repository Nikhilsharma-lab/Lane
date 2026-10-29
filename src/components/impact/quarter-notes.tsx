"use client"

import { lazy, Suspense, useRef, useState } from "react"
import { Button } from "@/components/arc/button/button"
import { quarterStarted } from "@/lib/impact-period"
import type { QuarterNoteSlot } from "@/lib/impact-read-model"
import { noteSegments } from "@/lib/quarter-note-rules"
import { LocalTime } from "@/components/requests/local-time"
import { Placeholder } from "@/components/loading/placeholder"
import styles from "./outcome-report.module.css"

// The Quarter notes at the end of the Outcome report (#209): the team's own words, one per quarter, with who last edited
// each and when. Everyone who sees the report reads them; only an Admin gets the write and edit controls, and the
// server refuses anyone else (saveQuarterNote). The editor loads only when an Admin opens it.

const QuarterNoteEditor = lazy(() => import("./quarter-note-editor"))

/** Where an Admin's edits go: the workspace from the page. Null for everyone else. */
export type QuarterNoteEditorTarget = { orgId: string } | null

function NoteText({ text }: { text: string }) {
  return <p className={styles.noteBody}>{noteSegments(text).map((segment, index) => segment.kind === "link"
    ? <a key={index} href={segment.href} className={styles.noteLink} rel="noopener noreferrer" target="_blank">{segment.href}</a>
    : <span key={index}>{segment.text}</span>)}</p>
}

function QuarterNote({ slot, editor, asOf, heading }: { slot: QuarterNoteSlot; editor: QuarterNoteEditorTarget; asOf: string; heading: "h2" | "h3" }) {
  const [note, setNote] = useState(slot.note)
  const [editing, setEditing] = useState(false)
  const opener = useRef<HTMLButtonElement>(null)
  const headingId = `quarter-note-${slot.year}-q${slot.quarter}`
  const Heading = heading
  // A note is written during or after its quarter, never before; the server refuses the same.
  const writable = editor !== null && quarterStarted(slot.year, slot.quarter, new Date(`${asOf}T23:59:59.999Z`))

  const close = () => {
    setEditing(false)
    // Focus goes back to the control that opened the editor, so keyboard users keep their place.
    requestAnimationFrame(() => opener.current?.focus())
  }

  return <section className={styles.quarterNote} aria-labelledby={headingId}>
    <Heading id={headingId} className={heading === "h2" ? styles.heading : styles.projectHeading}>{heading === "h2" ? `Quarter note, ${slot.label}` : slot.label}</Heading>
    {note
      ? <>
        <NoteText text={note.text} />
        <p className={styles.note}>Last edited by {note.editorName} on <LocalTime iso={note.editedAt} day />.</p>
      </>
      : !editing && <p className={styles.note}>No Quarter note for {slot.label}.</p>}
    {writable && !editing && <div className={styles.noteControls}>
      <Button ref={opener} variant="secondary" size="sm" onClick={() => setEditing(true)}>{note ? `Edit the ${slot.label} note` : `Write the ${slot.label} note`}</Button>
    </div>}
    {writable && editing && <Suspense fallback={<Placeholder label="Opening the editor" lines={3} />}>
      <QuarterNoteEditor orgId={editor.orgId} slot={slot} note={note} onCancel={close} onSaved={saved => { setNote(saved); close() }} />
    </Suspense>}
  </section>
}

/** The report's last section: one quarter's note, or a year's four. Nothing for a month. */
export function QuarterNotes({ slots, editor, asOf }: { slots: QuarterNoteSlot[]; editor: QuarterNoteEditorTarget; asOf: string }) {
  if (slots.length === 0) return null
  if (slots.length === 1) return <QuarterNote key={`${slots[0].year}-${slots[0].quarter}`} slot={slots[0]} editor={editor} asOf={asOf} heading="h2" />
  return <section className={styles.block} aria-labelledby="report-quarter-notes-heading">
    <h2 id="report-quarter-notes-heading" className={styles.heading}>Quarter notes</h2>
    {slots.map(slot => <QuarterNote key={`${slot.year}-${slot.quarter}`} slot={slot} editor={editor} asOf={asOf} heading="h3" />)}
  </section>
}
