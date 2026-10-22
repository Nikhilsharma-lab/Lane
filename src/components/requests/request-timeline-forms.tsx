"use client"
import { useState } from "react"
import { Input } from "@/components/arc/input/input"
import { Textarea } from "@/components/arc/textarea/textarea"
import { Select } from "@/components/arc/select/select"
import { Checkbox } from "@/components/arc/checkbox/checkbox"
import { Button } from "@/components/arc/button/button"
import { changeRequestRelease } from "@/app/(app)/requests/[id]/release-actions"
import { changeRequestOutcome, createFollowUpRequest } from "@/app/(app)/requests/[id]/outcome-actions"
import { guardrailComparisonPhrase } from "@/lib/guardrail-comparison"
import { correctableFields, CORRECTION_FIELD_OPTIONS, EXCEPTION_REASON_OPTIONS, type agreedResult, type OutcomeChange } from "@/lib/request-outcome"
import type { ReleaseFact } from "@/lib/request-release"
import { utcDay } from "@/lib/utc-day"
import { useJourneyChange } from "./use-journey-change"
import styles from "./request-timeline.module.css"

/** The timeline's step forms. Fields and validation are the ones the release and outcome panels had (#134). */
type FormProps = { requestId: string; orgId: string; revision: number; onSaved: () => void; onCancel: () => void }
type AgreedResult = ReturnType<typeof agreedResult>

/** "50%", "12 ms" or "No baseline". */
export const resultValue = (n: number | null, unit: string) => n === null ? "No baseline" : unit === "%" ? `${n}%` : `${n} ${unit}`.trim()
const RELEASE_FAILED = "Could not save release. Your input is preserved; try again."
const OUTCOME_FAILED = "Could not save the outcome. Your input is preserved; try again."

function Controls({ busy, error, submit, disabled, onCancel }: { busy: boolean; error: string; submit: string; disabled?: boolean; onCancel: () => void }) {
  return <>
    {error && <p role="alert">{error}</p>}
    <div className={styles.controls}>
      <Button type="submit" disabled={busy || disabled}>{submit}</Button>
      <Button type="button" variant="ghost" disabled={busy} onClick={onCancel}>Cancel</Button>
    </div>
  </>
}

export function VoidReleaseForm({ requestId, orgId, revision, onSaved, onCancel }: FormProps) {
  const { busy, error, save } = useJourneyChange({ requestId, orgId, failed: RELEASE_FAILED })
  const [reason, setReason] = useState("")
  const [confirmed, setConfirmed] = useState(false)
  return <form className={styles.stack} aria-busy={busy} onSubmit={e => {
    e.preventDefault()
    if (!confirmed) return
    const input = { kind: "void" as const, reason, neverExposed: true as const }
    void save(input, revision, context => changeRequestRelease(context, input)).then(saved => { if (saved) onSaved() })
  }}>
    <p>Void only a release that never happened. If work was exposed and later rolled back, the release remains part of its measurement history.</p>
    <Textarea label="Void reason" required maxLength={4000} value={reason} onChange={e => setReason(e.target.value)} disabled={busy} />
    <Checkbox label="The agreed audience was never exposed" checked={confirmed} onCheckedChange={v => setConfirmed(v === true)} disabled={busy} />
    <Controls busy={busy} error={error} submit="Confirm void" disabled={!confirmed} onCancel={onCancel} />
  </form>
}

export function HandoverForm({ requestId, orgId, revision, onSaved, onCancel, people }: FormProps & { people: { id: string; name: string }[] }) {
  const { busy, error, save } = useJourneyChange({ requestId, orgId, failed: RELEASE_FAILED })
  const [recipient, setRecipient] = useState("")
  const [reason, setReason] = useState("")
  return <form className={styles.stack} aria-busy={busy} onSubmit={e => {
    e.preventDefault()
    const input = { kind: "transfer" as const, recipientId: recipient, reason }
    void save(input, revision, context => changeRequestRelease(context, input)).then(saved => { if (saved) onSaved() })
  }}>
    <p>The Requester no longer has workspace access. Hand this Request over without changing who wrote it or its reviews.</p>
    <Select label="New Requester" options={people.map(p => ({ value: p.id, label: p.name }))} value={recipient} onValueChange={setRecipient} disabled={busy} />
    <Textarea label="Handover reason" required maxLength={4000} value={reason} onChange={e => setReason(e.target.value)} disabled={busy} />
    <Controls busy={busy} error={error} submit="Hand over" disabled={!recipient} onCancel={onCancel} />
  </form>
}

export function MeasuredCloseForm({ requestId, orgId, revision, onSaved, onCancel, agreed, release }: FormProps & { agreed: AgreedResult; release: ReleaseFact | null }) {
  const { busy, error, save } = useJourneyChange({ requestId, orgId, failed: OUTCOME_FAILED })
  const today = utcDay()
  const [actual, setActual] = useState("")
  const [passed, setPassed] = useState("")
  const [guardrails, setGuardrails] = useState<string[]>(() => agreed.guardrails.map(() => ""))
  const [evidence, setEvidence] = useState("")
  const [from, setFrom] = useState(release?.startDate ?? "")
  const [to, setTo] = useState(release && release.dueDate < today ? release.dueDate : today)
  return <form className={styles.stack} aria-busy={busy} onSubmit={e => {
    e.preventDefault()
    const input: OutcomeChange = { kind: "measured", primary: agreed.form === "numeric" ? { kind: "numeric", actual: Number(actual) } : { kind: "pass_fail", passed: passed === "passed" }, guardrails: guardrails.map(Number), evidence, observedFrom: from, observedTo: to }
    void save(input, revision, context => changeRequestOutcome(context, input)).then(saved => { if (saved) onSaved() })
  }}>
    <p>Record what happened. Below-target and neutral results close too; success is not required.</p>
    {agreed.form === "numeric"
      ? <Input label={`Actual ${agreed.label} (${agreed.unit})`} type="number" step="any" required value={actual} onChange={e => setActual(e.target.value)} disabled={busy} description={`Agreed: ${resultValue(agreed.baseline, agreed.unit)} → ${resultValue(agreed.target, agreed.unit)}`} />
      : <Select label={`Result: ${agreed.label}`} options={[{ value: "passed", label: "Passed" }, { value: "failed", label: "Did not pass" }]} value={passed} onValueChange={setPassed} disabled={busy} />}
    {agreed.guardrails.map((g, i) => <Input key={i} label={`Actual ${g.metric} (${g.unit})`} type="number" step="any" required value={guardrails[i] ?? ""} onChange={e => setGuardrails(all => all.map((v, j) => j === i ? e.target.value : v))} disabled={busy} description={`Guardrail: stays ${guardrailComparisonPhrase[g.operator]} ${resultValue(g.limit, g.unit)}`} />)}
    <Textarea label="Evidence and source" required maxLength={4000} value={evidence} onChange={e => setEvidence(e.target.value)} disabled={busy} description="Where the actual result can be checked." />
    <div className={styles.fields}>
      <Input label="Observed from (UTC)" type="date" required value={from} onChange={e => setFrom(e.target.value)} disabled={busy} />
      <Input label="Observed to (UTC)" type="date" required max={today} value={to} onChange={e => setTo(e.target.value)} disabled={busy} />
    </div>
    <Controls busy={busy} error={error} submit={busy ? "Closing…" : "Close with measured result"} disabled={agreed.form === "pass_fail" && !passed} onCancel={onCancel} />
  </form>
}

export function CloseWithoutResultForm({ requestId, orgId, revision, onSaved, onCancel }: FormProps) {
  const { busy, error, save } = useJourneyChange({ requestId, orgId, failed: OUTCOME_FAILED })
  const [reasonCode, setReasonCode] = useState("")
  const [reason, setReason] = useState("")
  return <form className={styles.stack} aria-busy={busy} onSubmit={e => {
    e.preventDefault()
    const input = { kind: "exception" as const, reasonCode: reasonCode as typeof EXCEPTION_REASON_OPTIONS[number]["value"], reason }
    void save(input, revision, context => changeRequestOutcome(context, input)).then(saved => { if (saved) onSaved() })
  }}>
    <p className={styles.muted}>Ends this Request without a measured result. It stays on record and never counts as measured impact.</p>
    <Select label="Why" options={EXCEPTION_REASON_OPTIONS} value={reasonCode} onValueChange={setReasonCode} disabled={busy} />
    <Textarea label={reasonCode === "other" ? "Reason" : "Details (optional)"} required={reasonCode === "other"} maxLength={4000} value={reason} onChange={e => setReason(e.target.value)} disabled={busy} />
    <Controls busy={busy} error={error} submit={busy ? "Closing…" : "Close without a result"} disabled={!reasonCode || (reasonCode === "other" && !reason.trim())} onCancel={onCancel} />
  </form>
}

export function ClosureCorrectionForm({ requestId, orgId, revision, onSaved, onCancel, closureKind }: FormProps & { closureKind: "measured" | "exception" }) {
  const { busy, error, save } = useJourneyChange({ requestId, orgId, failed: OUTCOME_FAILED })
  const [field, setField] = useState("")
  const [text, setText] = useState("")
  const [reason, setReason] = useState("")
  return <form className={styles.stack} aria-busy={busy} onSubmit={e => {
    e.preventDefault()
    const input = { kind: "correction" as const, field: field as typeof CORRECTION_FIELD_OPTIONS[number]["value"], correction: text, reason }
    void save(input, revision, context => changeRequestOutcome(context, input)).then(saved => { if (saved) onSaved() })
  }}>
    <p>Corrections appear beside the original closure. They never change its result, evidence or target.</p>
    <Select label="What needs correcting" options={CORRECTION_FIELD_OPTIONS.filter(o => correctableFields(closureKind).includes(o.value))} value={field} onValueChange={setField} disabled={busy} />
    <Textarea label="Correction" required maxLength={4000} value={text} onChange={e => setText(e.target.value)} disabled={busy} />
    <Textarea label="Correction reason" required maxLength={4000} value={reason} onChange={e => setReason(e.target.value)} disabled={busy} />
    <Controls busy={busy} error={error} submit={busy ? "Saving…" : "Save correction"} disabled={!field} onCancel={onCancel} />
  </form>
}

export function FollowUpForm({ requestId, orgId, revision, onCancel, onCreated }: Omit<FormProps, "onSaved"> & { onCreated: (followUpId: string) => void }) {
  const { busy, error, save } = useJourneyChange({ requestId, orgId, failed: "Could not create the follow-up. Your input is preserved; try again." })
  const [reason, setReason] = useState("")
  return <form className={styles.stack} aria-busy={busy} onSubmit={e => {
    e.preventDefault()
    const input = { reason }
    void save({ followUp: input }, revision, context => createFollowUpRequest(context, input)).then(saved => { if (saved && "followUpId" in saved) onCreated(saved.followUpId) })
  }}>
    <p>The follow-up copies this context, is reviewed afresh and has its own outcome. This Request keeps its measurement obligation.</p>
    <Textarea label="What changed and why" required maxLength={4000} value={reason} onChange={e => setReason(e.target.value)} disabled={busy} />
    <Controls busy={busy} error={error} submit={busy ? "Creating…" : "Create follow-up Request"} onCancel={onCancel} />
  </form>
}
