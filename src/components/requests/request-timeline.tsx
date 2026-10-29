"use client"
import { useCallback, useEffect, useRef, useState, type ReactNode } from "react"
import Link from "next/link"
import { useRouter } from "next/navigation"
import { Button } from "@/components/arc/button/button"
import { readRequestRelease } from "@/app/(app)/requests/[id]/release-actions"
import { readRequestOutcome } from "@/app/(app)/requests/[id]/outcome-actions"
import { callAction } from "@/lib/action-call"
import { formatRequestCode } from "@/lib/request-code"
import { guardrailComparisonPhrase } from "@/lib/guardrail-comparison"
import { plannedDay } from "@/lib/dates"
import type { WorkspacePermission } from "@/lib/auth-guard"
import { canChange } from "@/lib/request-access-rules"
import { FORMER_MEMBER, type JourneyAction } from "@/lib/request-journey"
import { DAY_MS, dayNumber } from "@/lib/utc-day"
import { CORRECTION_FIELD_OPTIONS } from "@/lib/request-outcome"
import type { ReleaseEvent } from "@/lib/request-release"
import type { RequestDetail } from "./detail-view"
import { ReleaseForm } from "./release-form"
import { InPageForm } from "@/components/popup/in-page-form"
import { RequestReviews } from "./request-reviews"
import { ClosureCorrectionForm, CloseWithoutResultForm, FollowUpForm, HandoverForm, MeasuredCloseForm, resultValue, VoidReleaseForm } from "./request-timeline-forms"
import { DUE_DATE_LINE, evidenceLine, fixedWindowLine, learnedLine, observedLine, timelineSteps, type JourneyOutline, type OutlineLine, type TimelineStep } from "./request-timeline-model"
import { JourneyLine } from "./journey-line"
import { LocalTime } from "./local-time"
import styles from "./request-timeline.module.css"
import { Placeholder } from "@/components/loading/placeholder";

type ReleaseView = Exclude<Awaited<ReturnType<typeof readRequestRelease>>, { error: string }>
type OutcomeView = Exclude<Awaited<ReturnType<typeof readRequestOutcome>>, { error: string }>
type Views = { release: ReleaseView; outcome: OutcomeView }

const NO_OUTLINE: JourneyOutline = { steps: [], history: false }
const LOAD_FAILED = "Couldn't load the journey. Try again."
/** #263: a step's action button, where focus goes back when its form closes. */
const actionButton = (action: JourneyAction) => document.querySelector<HTMLElement>(`#journey [data-journey-action="${action}"]`)
const STATE_WORDS: Record<TimelineStep["state"], string> = { finished: "finished", current: "current step", upcoming: "not reached yet", skipped: "skipped" }

/** Both journey reads, or the error to show; never throws. */
async function readViews(requestId: string, orgId: string): Promise<Views | { error: string }> {
  try {
    const [release, outcome] = await Promise.all([callAction(() => readRequestRelease(requestId, { orgId })), callAction(() => readRequestOutcome(requestId, { orgId }))])
    if ("error" in release) return { error: release.error || LOAD_FAILED }
    if ("error" in outcome) return { error: outcome.error || LOAD_FAILED }
    return { release, outcome }
  } catch {
    return { error: LOAD_FAILED }
  }
}

function historyLine(event: Pick<ReleaseEvent, "input">) {
  switch (event.input.kind) {
    case "transfer": return "Handed over"
    case "void": return "Incorrect release voided"
    case "correct": return "Release corrected"
    default: return "Release recorded"
  }
}

/** A line the journey's reads fill in, held one line high (#295), through Lane's one placeholder (#262), whose
 * wrapper adds no box. */
const Held = () => <Placeholder><p className={styles.held} aria-hidden="true" data-pending=""><span /></p></Placeholder>
const outlineLine = (line: OutlineLine, index: number) => line === null ? <Held key={index} />
  : typeof line === "string" ? <p key={index} className={styles.muted}>{line}</p> : <JourneyLine key={index} line={line} />
/** A button the journey's reads will show, held at its size: Arc's own button, unseen, on the skeleton's fill. */
const HeldButton = ({ label }: { label: string }) => <span className={styles.heldButton}><Button variant="secondary" disabled tabIndex={-1}>{label}</Button></span>

/** One step of the journey. The outline and the read journey both draw steps through here, so each part keeps its
 * place in the tree and the reviewers, drawn in the outline, stay mounted when the reads arrive. */
function stepItem(step: Pick<TimelineStep, "status" | "label" | "state">, parts: { happened: ReactNode; details: ReactNode; countdown: ReactNode; next: ReactNode; actions: ReactNode; form: ReactNode }) {
  return <li key={step.status} className={styles.step} data-state={step.state} aria-current={step.state === "current" ? "step" : undefined}>
    <span className={styles.marker} aria-hidden="true" />
    <div className={styles.stepBody}>
      <h3 id={`journey-${step.status}`} className={styles.stepHeading}>{step.label}<span className="sr-only"> ({STATE_WORDS[step.state]})</span></h3>
      {step.state === "skipped" && <p className={styles.muted}>Skipped</p>}
      {parts.happened}
      {parts.details}
      {parts.countdown}
      {parts.next}
      {parts.actions}
      {parts.form}
    </div>
  </li>
}

/**
 * The Request page's journey (#134): one timeline, Open → In progress → Done → Measuring → Closed, in place
 * of the Reviewers, "Release and measurement" and Outcome panels. Each finished step says what happened,
 * when and who; the current step says what's next and who does it, with its actions, or why one isn't
 * available. Reviews sit in Open; the countdown only in Measuring. Guests see it without actions.
 */
export function RequestTimeline({ request, orgId, isGuest, readOnly = false, reader }: {
  request: RequestDetail; orgId: string; isGuest: boolean; readOnly?: boolean
  /** Who is reading, from the page: the outline holds the buttons the journey's reads will offer them (#295). */
  reader?: { userId: string; role: WorkspacePermission }
}) {
  const router = useRouter()
  const requestId = request.id
  const revision = request.agreementRevision ?? 0
  const [views, setViews] = useState<Views | null>(null)
  const [error, setError] = useState("")
  const [mode, setMode] = useState<JourneyAction | null>(null)
  const heading = useRef<HTMLHeadingElement>(null)
  const generation = useRef(0)

  const show = useCallback((next: Views | { error: string }) => {
    if ("error" in next) setError(next.error)
    else { setViews(next); setError("") }
  }, [])
  // Only the latest read counts: a later load (or leaving the page) makes an earlier answer stale.
  const load = useCallback(async () => {
    const current = ++generation.current
    const next = await readViews(requestId, orgId)
    if (current === generation.current) show(next)
  }, [requestId, orgId, show])
  // Reload when the Request's revision moves (a lifecycle move, or a change saved elsewhere).
  useEffect(() => {
    let active = true
    readViews(requestId, orgId).then(next => { if (active) show(next) })
    return () => { active = false }
  }, [requestId, orgId, revision, show])
  // The countdown and Close Request follow the UTC date: refresh on return and at the next UTC midnight, without polling.
  useEffect(() => {
    if (!views) return
    const refresh = () => { if (!mode) void load() }
    const midnight = (dayNumber(views.release.today) + 1) * DAY_MS
    const timer = window.setTimeout(refresh, Math.max(1000, midnight - Date.now()))
    window.addEventListener("focus", refresh)
    return () => { clearTimeout(timer); window.removeEventListener("focus", refresh) }
  }, [views, mode, load])

  async function saved() {
    setMode(null)
    await load()
    heading.current?.focus()
  }

  if (!views && error) return <section id="journey" aria-labelledby="journey-heading" className={styles.timeline}>
    <h2 id="journey-heading" className={styles.heading}>Journey</h2>
    <p role="alert">{error}</p><div className={styles.controls}><Button variant="secondary" onClick={() => { void load() }}>Try again</Button></div>
  </section>
  const open = request.status === "open"
  // Drawn in the outline, read once the journey's reads are back: the reviewers' read would otherwise go ahead of them.
  const reviews = <RequestReviews requestId={requestId} orgId={orgId} isGuest={isGuest} revision={revision} deferred={!views}
    expected={{ reviewers: request.reviewerOutline ?? [], open, canAdd: open && !isGuest && !readOnly, canRemove: open && !!reader && canChange(reader, request) }} />

  // #295: until the reads arrive, the journey as the server drew it from the saved Request, in the same places as below.
  if (!views) {
    const outline = request.journeyOutline ?? NO_OUTLINE
    return <section id="journey" aria-labelledby="journey-heading" className={styles.timeline}>
      <div className={styles.header}>
        <h2 id="journey-heading" tabIndex={-1} ref={heading} className={styles.heading}>Journey</h2>
        <p className={`${styles.end} ${styles.muted}`}>Requester: <span className={styles.heldName} data-pending="" /></p>
      </div>
      {/* The "Follow-up of" line's place; its code and title arrive with the reads. */}
      {request.followUpOf ? <Held /> : null}
      <p role="status" className="sr-only">Loading journey…</p>
      <ol className={styles.steps}>
        {outline.steps.map(step => stepItem(step, {
          happened: step.happened.map(outlineLine), details: step.reviews ? reviews : null, countdown: null, next: step.after.map(outlineLine),
          actions: step.actions.length > 0 && <Placeholder><ul className={styles.actions} aria-hidden="true" data-pending="actions">
            {step.actions.map(action => <li key={action.action} className={styles.action}>
              <HeldButton label={action.label} />{!action.available && <span className={styles.heldReason}>{action.reason}</span>}
            </li>)}
          </ul></Placeholder>, form: null,
        }))}
      </ol>
      {outline.history && <Held />}
    </section>
  }

  const { release, outcome } = views
  const names = { ...release.names, ...outcome.names }
  const name = (id: string) => names[id] ?? FORMER_MEMBER
  const steps = timelineSteps({
    journey: release.journey, workStatus: release.workStatus, isGuest, readOnly, audience: release.audience,
    requesterName: release.requesterName, requestedBy: request.creatorName || FORMER_MEMBER, requestedAt: new Date(request.createdAt).toISOString(),
    assigneeName: request.assigneeName, pickedUpAt: release.pickedUpAt, doneAt: release.doneAt, release: release.release, releaseHistory: release.history,
    closure: outcome.closure, names, hasAgreedResult: Boolean(outcome.agreed),
    actions: release.actions, now: new Date(),
  })
  const form = { requestId, orgId, revision: release.revision, onSaved: () => { void saved() }, onCancel: () => setMode(null) }
  const closure = outcome.closure
  const agreed = outcome.agreed

  function stepForm(action: JourneyAction) {
    switch (action) {
      case "release": return <ReleaseForm {...form} audience={release.audience} earliestExposure={release.earliestExposure} today={release.today} valueBefore={release.valueBefore} />
      case "correctRelease": return release.release && <ReleaseForm {...form} audience={release.audience} earliestExposure={release.earliestExposure} today={release.today} valueBefore={release.valueBefore} correcting={{ ...release.release, valueBefore: release.recordedValueBefore }} />
      case "voidRelease": return <VoidReleaseForm {...form} />
      case "close": return agreed && <MeasuredCloseForm {...form} agreed={agreed} release={release.release} />
      case "closeWithoutResult": return <CloseWithoutResultForm {...form} />
      case "correctClosure": return closure && <ClosureCorrectionForm {...form} closureKind={closure.kind} result={closure.kind === "measured" ? closure.primary.kind === "numeric" ? { kind: "numeric", unit: closure.primary.unit } : { kind: "pass_fail" } : null} />
      case "followUp": return <FollowUpForm {...form} onCreated={id => router.push(`/requests/${id}`)} />
      case "handover": return <HandoverForm {...form} people={release.people} />
    }
  }

  function details(step: TimelineStep) {
    if (step.state !== "finished" && step.state !== "current") return null
    if (step.status === "open") return reviews
    if (step.status === "measuring") {
      const fact = release.release ?? closure?.release
      if (!fact) return null
      return <div className={styles.facts}>
        <p className={styles.muted}>{evidenceLine(fact.evidence)}</p>
        {release.recordedValueBefore && <p className={styles.muted}>Value before release: {resultValue(release.recordedValueBefore.value, release.recordedValueBefore.unit)}.</p>}
        {fact.windowKind === "fixed" && <p className={styles.muted}>{fixedWindowLine(fact)}</p>}
        {step.state === "current" && <p className={styles.muted}>{DUE_DATE_LINE}</p>}
      </div>
    }
    if (step.status !== "closed" || !closure) return null
    return <div className={styles.facts}>
      {agreed && closure.kind === "measured" && <dl className={styles.facts}>
        <div><dt>Expected {agreed.form === "numeric" ? "metric" : "check"}</dt><dd>{agreed.label}{agreed.form === "numeric" && `: ${resultValue(agreed.baseline, agreed.unit)} → ${resultValue(agreed.target, agreed.unit)}`}</dd></div>
        <div><dt>Actual</dt><dd>{closure.primary.kind === "numeric" ? resultValue(closure.primary.actual, closure.primary.unit) : closure.primary.passed ? "Passed" : "Did not pass"}</dd></div>
        {closure.guardrails.map((g, i) => <div key={i}><dt>Guardrail: {g.metric}</dt><dd>Stays {guardrailComparisonPhrase[g.operator]} {resultValue(g.limit, g.unit)} · Actual {resultValue(g.actual, g.unit)} · {g.held ? "Held" : "Breached"}</dd></div>)}
      </dl>}
      {closure.kind === "measured" && <>
        <p>{evidenceLine(closure.evidence)}</p>
        <p className={styles.muted}>{observedLine(closure)}</p>
      </>}
      {closure.kind === "exception" && closure.reason && <p>{closure.reason}</p>}
      {/* #209: the line as given at closing; a Correction below shows any new wording beside it. */}
      {closure.learned && <p>{learnedLine(closure.learned)}</p>}
      {!!outcome.corrections.length && <div className={styles.facts}><h4>Corrections</h4><ol className={styles.list}>{outcome.corrections.map(c => <li key={c.operationId}>
        <p>{CORRECTION_FIELD_OPTIONS.find(o => o.value === c.field)?.label}: {c.value && <>{c.value.kind === "numeric" ? resultValue(c.value.actual, closure.kind === "measured" && closure.primary.kind === "numeric" ? closure.primary.unit : "") : c.value.passed ? "Passed" : "Did not pass"}. </>}{c.correction}</p>
        <p className={styles.muted}>Reason: {c.reason}. Added by {name(c.actorId)} on <LocalTime iso={c.at} day />.</p>
      </li>)}</ol></div>}
    </div>
  }

  return <section id="journey" aria-labelledby="journey-heading" className={styles.timeline}>
    <div className={styles.header}>
      <h2 id="journey-heading" tabIndex={-1} ref={heading} className={styles.heading}>Journey</h2>
      <p className={`${styles.end} ${styles.muted}`}>Requester: {release.requesterName}</p>
    </div>
    {outcome.followUpOf && <p>Follow-up of <Link href={`/requests/${outcome.followUpOf.id}`}>{formatRequestCode(outcome.followUpOf.requestNumber)} {outcome.followUpOf.title}</Link></p>}
    {error && <p role="alert">{error}</p>}
    <ol className={styles.steps}>
      {steps.map(step => {
        const headingId = `journey-${step.status}`
        return stepItem(step, {
          happened: step.happened.map((line, index) => <JourneyLine key={index} line={line} />),
          details: details(step),
          countdown: step.countdown && <p role="status" className={styles.countdown}>{step.countdown}</p>,
          next: step.next && <p className={styles.muted}>{step.next}</p>,
          actions: !!step.actions.length && mode === null && <ul className={styles.actions} aria-label={`${step.label} actions`}>
            {step.actions.map((action, index) => <li key={action.action} className={styles.action}>
              {action.available
                ? <Button variant={index === 0 ? "primary" : "secondary"} data-journey-action={action.action} onClick={() => setMode(action.action)}>{action.label}</Button>
                : <><Button variant="secondary" disabled aria-describedby={`${headingId}-${action.action}`}>{action.label}</Button><span id={`${headingId}-${action.action}`} className={styles.muted}>{action.reason}</span></>}
            </li>)}
          </ul>,
          form: mode && step.actions.some(a => a.action === mode && a.available) && <InPageForm onDismiss={() => setMode(null)} returnFocus={() => actionButton(mode)}>{stepForm(mode)}</InPageForm>,
        })
      })}
    </ol>
    {!!release.history.length && <details className={styles.history}>
      <summary>Release and handover history ({release.history.length})</summary>
      <ol className={styles.list}>{release.history.map(event => <li key={event.revision}>
        <p>{historyLine(event)} by {name(event.actorId)} on <LocalTime iso={event.at} day />.</p>
        {"reason" in event.input && <p className={styles.muted}>{event.input.reason}</p>}
        {event.input.kind === "transfer" && <p className={styles.muted}>{name(event.previousOwnerId)} → {name(event.ownerId)}</p>}
        {event.release && <p className={styles.muted}>Released: {plannedDay(event.release.exposureDate)}. Audience: {event.release.audience}. Due: {plannedDay(event.release.dueDate)}. Evidence: {event.release.evidence}</p>}
      </li>)}</ol>
    </details>}
    {!!outcome.followUps.length && <div className={styles.facts}>
      <h3 className={styles.stepHeading}>Follow-ups</h3>
      <ul className={styles.list}>{outcome.followUps.map(f => <li key={f.id}>
        <Link href={`/requests/${f.id}`}>{formatRequestCode(f.requestNumber)} {f.title}</Link>
        <p className={styles.muted}>{f.reason}</p>
      </li>)}</ul>
    </div>}
  </section>
}
