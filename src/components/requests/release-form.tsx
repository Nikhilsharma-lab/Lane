"use client"
import { useState } from "react"
import { Input } from "@/components/arc/input/input"
import { Textarea } from "@/components/arc/textarea/textarea"
import { Checkbox } from "@/components/arc/checkbox/checkbox"
import { Button } from "@/components/arc/button/button"
import { DatePicker } from "@/components/arc/date-picker/date-picker"
import { changeRequestRelease } from "@/app/(app)/requests/[id]/release-actions"
import type { ReleaseFact } from "@/lib/request-release"
import { localDate, localDay } from "@/lib/local-day"
import { IS_IT_LIVE_COPY } from "./is-it-live"
import { useJourneyChange } from "./use-journey-change"
import styles from "./request-timeline.module.css"
import noteStyles from "./is-it-live.module.css"
import popupStyles from "@/components/popup/popup.module.css"

/** What the release form reads: the Request's release read, shared by the Journey and "Is it live?". */
export type ReleaseRead = {
  /** The Request's revision the release is recorded against. */
  revision: number
  /** The agreed audience. */
  audience: string
  /** The pickup (else the filing): its day in the viewer's zone is the earliest release day (#277). */
  earliestRelease: string
  /** Whether this release records the value before release, in which unit, and the goal's current value (#151 decision 3). */
  valueBefore: { required: true; unit: string; current: number } | { required: false; unit: null }
  /** The current release, which Correct release starts from. */
  release: ReleaseFact | null
  recordedValueBefore: { value: number; unit: string } | null
}

export type ReleaseFormProps = {
  requestId: string
  orgId: string
  read: ReleaseRead
  /** Correct the current release: its saved facts fill the form and a reason is required. */
  correcting?: boolean
  onSaved: () => void
  onCancel: () => void
  cancelLabel?: string
}

/**
 * #277: the one release form. The Journey's Done step and "Is it live?" open it with the same defaults: the release
 * date starts as today and "Value before release" as the goal's current value. Correct release starts from the saved
 * facts. The release date is the viewer's own day, from the day the work was picked up (the day the Request was filed,
 * for older work) to today; the server allows a day either side for the time zone.
 */
export function ReleaseForm({ requestId, orgId, read, correcting = false, onSaved, onCancel, cancelLabel = "Cancel" }: ReleaseFormProps) {
  const { busy, error, save } = useJourneyChange({ requestId, orgId, failed: "Couldn’t save release. Your input is preserved; try again." })
  const saved = correcting ? read.release : null
  const { valueBefore } = read
  const [today] = useState(() => localDay())
  const [date, setDate] = useState(saved?.exposureDate ?? today)
  const [evidence, setEvidence] = useState(saved?.evidence ?? "")
  const [value, setValue] = useState(() => {
    if (saved) return read.recordedValueBefore ? String(read.recordedValueBefore.value) : ""
    return valueBefore.required ? String(valueBefore.current) : ""
  })
  const [confirmed, setConfirmed] = useState(false)
  const [reason, setReason] = useState("")
  const pickedUp = localDay(new Date(read.earliestRelease))
  // A correction may keep a date saved before the pickup-day rule.
  const earliest = saved && saved.exposureDate < pickedUp ? saved.exposureDate : pickedUp
  const measured = valueBefore.required
  // A blank value or date is never sent: the button stays off until both are there (the server refuses them too).
  const missing = !date || (measured && value.trim() === "")
  return <form className={styles.stack} aria-busy={busy} onSubmit={e => {
    e.preventDefault()
    if (!confirmed || missing) return
    const recorded = measured ? { valueBeforeRelease: { value: Number(value), unit: valueBefore.unit } } : {}
    const input = correcting
      ? { kind: "correct" as const, exposureDate: date, evidence, audienceConfirmed: true as const, ...recorded, reason }
      : { kind: "release" as const, exposureDate: date, evidence, audienceConfirmed: true as const, ...recorded }
    void save(input, read.revision, context => changeRequestRelease(context, input)).then(done => { if (done) onSaved() })
  }}>
    <p>Agreed audience: {read.audience}</p>
    <DatePicker label="Release date" value={date ? localDate(date) : undefined} onChange={day => setDate(day ? localDay(day) : "")}
      minDate={localDate(earliest)} maxDate={localDate(today)} locale="en-GB" disabled={busy} />
    {measured && <Input label={`Value before release (${valueBefore.unit})`} type="number" step="any" required value={value} onChange={e => setValue(e.target.value)} disabled={busy} description="The measured value just before the audience received this work, in the metric’s unit. Change is measured from it." />}
    <Textarea label="Release evidence" required maxLength={4000} value={evidence} onChange={e => setEvidence(e.target.value)} disabled={busy} description="Record where anyone can check that the agreed audience has this work. Deployment alone is not release." />
    <Checkbox label="The agreed audience received this work" checked={confirmed} onCheckedChange={v => setConfirmed(v === true)} disabled={busy} />
    {correcting && <Textarea label="Correction reason" required maxLength={4000} value={reason} onChange={e => setReason(e.target.value)} disabled={busy} description="The original stays in history. Relative deadlines are recalculated; fixed dates stay unchanged." />}
    {error && <p role="alert">{error}</p>}
    {!correcting && <p className={noteStyles.note}>{IS_IT_LIVE_COPY.endsUndo}</p>}
    <div className={popupStyles.actions}>
      <Button type="button" variant="ghost" disabled={busy} onClick={onCancel}>{cancelLabel}</Button>
      <Button type="submit" loading={busy} disabled={!busy && (!confirmed || missing)}>{correcting ? "Save correction" : "Mark as released"}</Button>
    </div>
  </form>
}
