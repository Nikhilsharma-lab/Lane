"use client"
import { useState, type ReactNode } from "react"
import { Input } from "@/components/arc/input/input"
import { Textarea } from "@/components/arc/textarea/textarea"
import { Checkbox } from "@/components/arc/checkbox/checkbox"
import { Button } from "@/components/arc/button/button"
import { changeRequestRelease } from "@/app/(app)/requests/[id]/release-actions"
import { useJourneyChange } from "./use-journey-change"
import styles from "./request-timeline.module.css"

export type ReleaseFormProps = {
  requestId: string
  orgId: string
  /** The Request's revision the release is recorded against (from the release read). */
  revision: number
  /** The agreed audience, the earliest allowed exposure and today, all from the release read (UTC dates). */
  audience: string
  earliestExposure: string
  today: string
  /** Whether this release records the value before release, and in which unit (#151 decision 3). */
  valueBefore?: { required: true; unit: string } | { required: false; unit: null }
  /** Correct an existing release: its facts prefill the form and a reason is required. */
  correcting?: { exposureDate: string; evidence: string; valueBefore?: { value: number; unit: string } | null }
  /** Prefill for a new release's exposure date, e.g. today when the work is already live. */
  defaultExposureDate?: string
  /** Shown above the fields. */
  intro?: ReactNode
  onSaved: () => void
  onCancel?: () => void
  cancelLabel?: string
}

/**
 * Record or correct a release: when the agreed audience received the work, and where that can be checked.
 * Any active member working on the Request can use it while the work is Done or Measuring. Reused by the
 * timeline's Done and Measuring steps and by "Is it live?" after Mark Done.
 */
export function ReleaseForm({ requestId, orgId, revision, audience, earliestExposure, today, valueBefore, correcting, defaultExposureDate, intro, onSaved, onCancel, cancelLabel }: ReleaseFormProps) {
  const { busy, error, save } = useJourneyChange({ requestId, orgId, failed: "Couldn't save release. Your input is preserved; try again." })
  const [date, setDate] = useState(correcting?.exposureDate ?? defaultExposureDate ?? "")
  const [evidence, setEvidence] = useState(correcting?.evidence ?? "")
  const [value, setValue] = useState(correcting?.valueBefore ? String(correcting.valueBefore.value) : "")
  const [confirmed, setConfirmed] = useState(false)
  const [reason, setReason] = useState("")
  const measured = valueBefore?.required === true
  // A blank value is never sent: the button stays off until there is a number (the server refuses it too).
  const valueMissing = measured && value.trim() === ""
  return <form className={styles.stack} aria-busy={busy} onSubmit={e => {
    e.preventDefault()
    if (!confirmed || valueMissing) return
    const recorded = measured ? { valueBeforeRelease: { value: Number(value), unit: valueBefore.unit } } : {}
    const input = correcting
      ? { kind: "correct" as const, exposureDate: date, evidence, audienceConfirmed: true as const, ...recorded, reason }
      : { kind: "release" as const, exposureDate: date, evidence, audienceConfirmed: true as const, ...recorded }
    void save(input, revision, context => changeRequestRelease(context, input)).then(saved => { if (saved) onSaved() })
  }}>
    {intro}
    <p>Agreed audience: {audience}</p>
    <Input label="Release date" type="date" required min={earliestExposure} max={today} value={date} onChange={e => setDate(e.target.value)} disabled={busy} />
    {measured && <Input label={`Value before release (${valueBefore.unit})`} type="number" step="any" required value={value} onChange={e => setValue(e.target.value)} disabled={busy} description="The measured value just before the audience received this work, in the metric's unit. Change is measured from it." />}
    <Textarea label="Release evidence" required maxLength={4000} value={evidence} onChange={e => setEvidence(e.target.value)} disabled={busy} description="Record where anyone can check that the agreed audience has this work. Deployment alone is not release." />
    <Checkbox label="The agreed audience received this work" checked={confirmed} onCheckedChange={v => setConfirmed(v === true)} disabled={busy} />
    {correcting && <Textarea label="Correction reason" required maxLength={4000} value={reason} onChange={e => setReason(e.target.value)} disabled={busy} description="The original stays in history. Relative deadlines are recalculated; fixed dates stay unchanged." />}
    {error && <p role="alert">{error}</p>}
    <div className={styles.controls}>
      <Button type="submit" loading={busy} disabled={!busy && (!confirmed || valueMissing)}>{correcting ? "Save correction" : "Mark as released"}</Button>
      {onCancel && <Button type="button" variant="ghost" disabled={busy} onClick={onCancel}>{cancelLabel ?? "Cancel"}</Button>}
    </div>
  </form>
}
