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
import { correctableFields, CORRECTION_FIELD_OPTIONS, EXCEPTION_REASON_OPTIONS, LEARNED_MAX_LENGTH } from "@/lib/request-outcome-options"
import type { agreedResult, OutcomeChange } from "@/lib/request-outcome"
import type { ReleaseFact } from "@/lib/request-release"
import { utcDay } from "@/lib/utc-day"
import { localDate, localDay } from "@/lib/local-day"
import { charactersLeftNote } from "@/lib/character-count"
import { DIDNT_PASS, PASSED, goalValueText } from "@/lib/result-phrasing"
import { DatePicker, preloadDatePicker } from "@/components/date-picker-lazy"
import { CLOSED_NEXT } from "./request-timeline-model"
import { useEscapeClosesPickerFirst } from "./picker-escape"
import { useJourneyChange } from "./use-journey-change"
import { resultValue } from "./result-value"
import styles from "./request-timeline.module.css"
import popupStyles from "@/components/popup/popup.module.css"

preloadDatePicker()

/** The Journey popups' forms (#277). Fields and validation are the ones the release and outcome panels had (#134). */
export type FormProps = { requestId: string; orgId: string; revision: number; onSaved: () => void; onCancel: () => void }
type AgreedResult = ReturnType<typeof agreedResult>

const RELEASE_FAILED = "Couldn’t save release. Your input is preserved; try again."
const OUTCOME_FAILED = "Couldn’t save the outcome. Your input is preserved; try again."

const PASS_FAIL_OPTIONS = [{ value: "passed", label: PASSED }, { value: "failed", label: DIDNT_PASS }]

/** Line breaks become spaces as they're typed: What we learned wraps on screen but is stored as one line (#209). */
const oneLine = (text: string) => text.replace(/[\r\n]+/g, " ")

/**
 * What we learned (#209): optional, stored with the closure; afterwards only a Correction changes it. #279: it wraps
 * over a few lines so a full sentence stays readable, and counts down as it nears its limit. The database keeps it one
 * line, so line breaks become spaces.
 */
function LearnedField({ label = "What we learned (optional)", hint = "For the Outcome report. After closing, only a Correction can change it.", required, value, onChange, disabled }: { label?: string; hint?: string; required?: boolean; value: string; onChange: (value: string) => void; disabled: boolean }) {
  return <Textarea label={label} required={required} maxLength={LEARNED_MAX_LENGTH} rows={3} value={value} onChange={e => onChange(oneLine(e.target.value))} disabled={disabled}
    description={charactersLeftNote(value, LEARNED_MAX_LENGTH) ?? hint} />
}

/**
 * #277: a Journey popup's buttons: Cancel, then the form's own named button, last. #279: a closing form's button is
 * red, with "Closed Requests can’t be reopened." under it, and there's no second confirm.
 */
function Controls({ busy, error, submit, disabled, permanent = false, onCancel }: { busy: boolean; error: string; submit: string; disabled?: boolean; permanent?: boolean; onCancel: () => void }) {
  return <>
    {error && <p role="alert">{error}</p>}
    <div className={popupStyles.actions}>
      <Button type="button" variant="ghost" disabled={busy} onClick={onCancel}>Cancel</Button>
      <Button type="submit" variant={permanent ? "danger" : "primary"} loading={busy} disabled={!busy && disabled}>{submit}</Button>
    </div>
    {permanent && <p className={styles.permanent}>{CLOSED_NEXT}</p>}
  </>
}

/** The goal as the Requester agreed it: a check's own words, or a metric with its end value and start. */
const goalWords = (agreed: AgreedResult) => agreed.form === "pass_fail"
  ? agreed.label
  : `${agreed.label}, ${goalValueText(agreed)}`

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
  useEscapeClosesPickerFirst()
  // #279 (story 38): the observation starts no earlier than the release and ends today at the latest: the viewer's
  // today, or the server's (UTC) when that is earlier, so a valid choice is never refused.
  const [latest] = useState(() => [localDay(), utcDay()].sort()[0])
  const earliest = release?.exposureDate
  const [actual, setActual] = useState("")
  const [passed, setPassed] = useState("")
  const [guardrails, setGuardrails] = useState<string[]>(() => agreed.guardrails.map(() => ""))
  const [evidence, setEvidence] = useState("")
  const [from, setFrom] = useState(() => !release ? "" : release.startDate > release.exposureDate ? release.startDate : release.exposureDate)
  const [to, setTo] = useState(release && release.dueDate < latest ? release.dueDate : latest)
  const [learned, setLearned] = useState("")
  return <form className={styles.stack} aria-busy={busy} onSubmit={e => {
    e.preventDefault()
    if (!from || !to) return
    const input: OutcomeChange = { kind: "measured", primary: agreed.form === "numeric" ? { kind: "numeric", actual: Number(actual) } : { kind: "pass_fail", passed: passed === "passed" }, guardrails: guardrails.map(Number), evidence, observedFrom: from, observedTo: to, learned }
    void save(input, revision, context => changeRequestOutcome(context, input)).then(saved => { if (saved) onSaved() })
  }}>
    {/* #279 (story 34): the goal in its own words, so it's clear what is being judged. */}
    <p>Goal: {goalWords(agreed)}</p>
    <p className={styles.muted}>Record what happened. A result short of the goal closes too.</p>
    {agreed.form === "numeric"
      ? <Input label={`Actual ${agreed.label} (${agreed.unit})`} type="number" step="any" required value={actual} onChange={e => setActual(e.target.value)} disabled={busy} />
      : <Select label="Result" options={PASS_FAIL_OPTIONS} value={passed} onValueChange={setPassed} disabled={busy} />}
    {agreed.guardrails.map((g, i) => <Input key={i} label={`Actual ${g.metric} (${g.unit})`} type="number" step="any" required value={guardrails[i] ?? ""} onChange={e => setGuardrails(all => all.map((v, j) => j === i ? e.target.value : v))} disabled={busy} description={`Guardrail: stays ${guardrailComparisonPhrase[g.operator]} ${resultValue(g.limit, g.unit)}`} />)}
    <Textarea label="Evidence and source" required maxLength={4000} value={evidence} onChange={e => setEvidence(e.target.value)} disabled={busy} description="Where the actual result can be checked." />
    <div className={styles.fields}>
      <DatePicker label="Observed from" value={from ? localDate(from) : undefined} onChange={day => setFrom(day ? localDay(day) : "")}
        minDate={earliest ? localDate(earliest) : undefined} maxDate={localDate(to || latest)} locale="en-GB" disabled={busy} />
      <DatePicker label="Observed to" value={to ? localDate(to) : undefined} onChange={day => setTo(day ? localDay(day) : "")}
        minDate={from || earliest ? localDate(from || earliest!) : undefined} maxDate={localDate(latest)} locale="en-GB" disabled={busy} />
    </div>
    <LearnedField value={learned} onChange={setLearned} disabled={busy} />
    <Controls busy={busy} error={error} submit="Close Request" permanent disabled={!from || !to || (agreed.form === "pass_fail" && !passed)} onCancel={onCancel} />
  </form>
}

/** #309: a Request whose Goal is No measurable impact closes this way, so the form starts at "Can’t be measured" and shows why. */
export function CloseWithoutResultForm({ requestId, orgId, revision, onSaved, onCancel, noMeasurableImpactReason = null }: FormProps & { noMeasurableImpactReason?: string | null }) {
  const { busy, error, save } = useJourneyChange({ requestId, orgId, failed: OUTCOME_FAILED })
  const [reasonCode, setReasonCode] = useState<string>(noMeasurableImpactReason ? "cannot_measure" : "")
  const [reason, setReason] = useState("")
  const [learned, setLearned] = useState("")
  return <form className={styles.stack} aria-busy={busy} onSubmit={e => {
    e.preventDefault()
    const input = { kind: "exception" as const, reasonCode: reasonCode as typeof EXCEPTION_REASON_OPTIONS[number]["value"], reason, learned }
    void save(input, revision, context => changeRequestOutcome(context, input)).then(saved => { if (saved) onSaved() })
  }}>
    {noMeasurableImpactReason && <div><p>Goal: No measurable impact</p><p className="whitespace-pre-wrap break-words">{noMeasurableImpactReason}</p></div>}
    <p className={styles.muted}>Ends this Request without a measured result. It stays on record and never counts as measured impact.</p>
    <Select label="Why" options={EXCEPTION_REASON_OPTIONS} value={reasonCode} onValueChange={setReasonCode} disabled={busy} />
    <Textarea label={reasonCode === "other" ? "Reason" : "Details (optional)"} required={reasonCode === "other"} maxLength={4000} value={reason} onChange={e => setReason(e.target.value)} disabled={busy} />
    <LearnedField value={learned} onChange={setLearned} disabled={busy} />
    <Controls busy={busy} error={error} submit="Close without a result" permanent disabled={!reasonCode || (reasonCode === "other" && !reason.trim())} onCancel={onCancel} />
  </form>
}

export function ClosureCorrectionForm({ requestId, orgId, revision, onSaved, onCancel, closureKind, hasGuardrails, result = null }: FormProps & { closureKind: "measured" | "exception"; /** #279: Guardrails is offered only when some were agreed. */ hasGuardrails: boolean; result?: { kind: "numeric"; unit: string } | { kind: "pass_fail" } | null }) {
  const { busy, error, save } = useJourneyChange({ requestId, orgId, failed: OUTCOME_FAILED })
  const [field, setField] = useState("")
  const [text, setText] = useState("")
  const [reason, setReason] = useState("")
  // Decision 2026-10-26: a corrected actual result states its value, which quarter and year totals then count.
  const [value, setValue] = useState("")
  const correctsResult = field === "actual" && result !== null
  return <form className={styles.stack} aria-busy={busy} onSubmit={e => {
    e.preventDefault()
    const corrected = !correctsResult ? undefined : result.kind === "numeric" ? { kind: "numeric" as const, actual: Number(value) } : { kind: "pass_fail" as const, passed: value === "passed" }
    const input = { kind: "correction" as const, field: field as typeof CORRECTION_FIELD_OPTIONS[number]["value"], correction: text, reason, ...(corrected ? { value: corrected } : {}) }
    void save(input, revision, context => changeRequestOutcome(context, input)).then(saved => { if (saved) onSaved() })
  }}>
    <p>Corrections appear beside the original closure, which stays as recorded. A corrected actual result is what quarter and year totals count.</p>
    <Select label="What needs correcting" options={CORRECTION_FIELD_OPTIONS.filter(o => correctableFields(closureKind, { guardrails: hasGuardrails }).includes(o.value))} value={field} onValueChange={setField} disabled={busy} />
    {correctsResult && (result.kind === "numeric"
      ? <Input label={`Corrected actual (${result.unit})`} type="number" step="any" required value={value} onChange={e => setValue(e.target.value)} disabled={busy} />
      : <Select label="Corrected result" options={PASS_FAIL_OPTIONS} value={value} onValueChange={setValue} disabled={busy} />)}
    {field === "learned"
      ? <LearnedField label="Correction" required hint="The new What we learned. The original stays on the Request." value={text} onChange={setText} disabled={busy} />
      : <Textarea label={correctsResult ? "What was wrong" : "Correction"} required maxLength={4000} value={text} onChange={e => setText(e.target.value)} disabled={busy} />}
    <Textarea label="Correction reason" required maxLength={4000} value={reason} onChange={e => setReason(e.target.value)} disabled={busy} />
    <Controls busy={busy} error={error} submit="Save correction" disabled={!field || (correctsResult && !value)} onCancel={onCancel} />
  </form>
}

export function FollowUpForm({ requestId, orgId, revision, onCancel, onCreated }: Omit<FormProps, "onSaved"> & { onCreated: (followUpId: string) => void }) {
  const { busy, error, save } = useJourneyChange({ requestId, orgId, failed: "Couldn’t create the follow-up. Your input is preserved; try again." })
  const [reason, setReason] = useState("")
  return <form className={styles.stack} aria-busy={busy} onSubmit={e => {
    e.preventDefault()
    const input = { reason }
    void save({ followUp: input }, revision, context => createFollowUpRequest(context, input)).then(saved => { if (saved && "followUpId" in saved) onCreated(saved.followUpId) })
  }}>
    <p>The follow-up copies this context, is reviewed afresh and has its own outcome. This Request keeps its measurement obligation.</p>
    <Textarea label="What changed and why" required maxLength={4000} value={reason} onChange={e => setReason(e.target.value)} disabled={busy} />
    <Controls busy={busy} error={error} submit="Create follow-up Request" onCancel={onCancel} />
  </form>
}
