"use client"
import { callAction } from "@/lib/action-call"
import { useEffect, useRef, useState } from "react"
import Link from "next/link"
import { useRouter } from "next/navigation"
import { Button } from "@/components/arc/button/button"
import { readRequestJourney } from "@/app/(app)/requests/[id]/journey-actions"
import { formatRequestCode } from "@/lib/request-code"
import { guardrailComparisonPhrase } from "@/lib/guardrail-comparison"
import { FORMER_MEMBER, journeyDate, journeyDay as day, type JourneyAction } from "@/lib/request-journey"
import { CORRECTION_FIELD_OPTIONS } from "@/lib/request-outcome"
import type { ReleaseEvent } from "@/lib/request-release"
import type { RequestDetail } from "./detail-view"
import { ReleaseForm } from "./release-form"
import { RequestReviews } from "./request-reviews"
import { ClosureCorrectionForm, CloseWithoutResultForm, FollowUpForm, HandoverForm, MeasuredCloseForm, resultValue, VoidReleaseForm } from "./request-timeline-forms"
import { timelineSteps, type TimelineStep } from "./request-timeline-model"
import { createJourneyRefresh, watchJourneyDate } from "./journey-refresh"
import styles from "./request-timeline.module.css"

type Views = Exclude<Awaited<ReturnType<typeof readRequestJourney>>, { error: string }>

const LOAD_FAILED = "Could not load the journey. Try again."
const STATE_WORDS: Record<TimelineStep["state"], string> = { finished: "finished", current: "current step", upcoming: "not reached yet", skipped: "skipped" }

/** One shared projection through the explicit session-recovery path. */
async function readViews(requestId: string, orgId: string): Promise<Views | { error: string }> {
  try { return await callAction(() => readRequestJourney(requestId, { orgId })) }
  catch { return { error: LOAD_FAILED } }
}

function historyLine(event: Pick<ReleaseEvent, "input">) {
  switch (event.input.kind) {
    case "transfer": return "Handed over"
    case "void": return "Incorrect release voided"
    case "correct": return "Release corrected"
    default: return "Release recorded"
  }
}

/**
 * The Request page's journey (#134): one timeline, Open → In progress → Done → Measuring → Closed, in place
 * of the Reviewers, "Release and measurement" and Outcome panels. Each finished step says what happened,
 * when and who; the current step says what's next and who does it, with its actions, or why one isn't
 * available. Reviews sit in Open; the countdown only in Measuring. Guests see it without actions.
 */
type Props = { request: RequestDetail; orgId: string; isAdmin: boolean; isGuest: boolean }
export function RequestTimeline(props: Props) {
  return <JourneyTimeline key={`${props.orgId}:${props.request.id}`} {...props} />
}

function JourneyTimeline({ request, orgId, isAdmin, isGuest }: Props) {
  const router = useRouter()
  const requestId = request.id
  const revision = request.agreementRevision ?? 0
  const [views, setViews] = useState<Views | null>(null)
  const [error, setError] = useState("")
  const [mode, setMode] = useState<JourneyAction | null>(null)
  const heading = useRef<HTMLHeadingElement>(null)
  const [refresh] = useState(() => createJourneyRefresh({
    read: () => readViews(requestId, orgId),
    show: (next) => {
      if ("error" in next) setError(next.error)
      else { setViews(next); setError("") }
    },
  }))
  useEffect(() => {
    refresh.activate()
    return () => refresh.dispose()
  }, [refresh])
  // Initial, revision, retry, save and background reads all use this lifetime.
  useEffect(() => { void refresh.refresh() }, [refresh, revision])
  const today = views?.release.today
  useEffect(() => {
    if (today) return watchJourneyDate(today, () => { void refresh.refresh() })
  }, [today, refresh])

  function saved() {
    setMode(null)
    void refresh.saved(() => heading.current?.focus())
  }
  function cancel() {
    setMode(null)
    void refresh.closeForm()
  }

  if (!views) return <section id="journey" aria-labelledby="journey-heading" className={styles.timeline}>
    <h2 id="journey-heading" className={styles.heading}>Journey</h2>
    {error ? <><p role="alert">{error}</p><div className={styles.controls}><Button variant="secondary" onClick={() => { void refresh.refresh() }}>Retry</Button></div></> : <p role="status">Loading journey…</p>}
  </section>

  const { release, outcome } = views
  const names = { ...release.names, ...outcome.names }
  const name = (id: string) => names[id] ?? FORMER_MEMBER
  const steps = timelineSteps({
    journey: release.journey, workStatus: release.workStatus, isGuest, audience: release.audience,
    requesterName: release.requesterName, requestedBy: request.creatorName || FORMER_MEMBER, requestedAt: new Date(request.createdAt).toISOString(),
    assigneeName: request.assigneeName, pickedUpAt: release.pickedUpAt, doneAt: release.doneAt, release: release.release, releaseHistory: release.history,
    closure: outcome.closure, names, hasAgreedResult: Boolean(outcome.agreed),
    actions: release.actions, now: new Date(`${release.today}T00:00:00Z`),
  })
  const form = { requestId, orgId, revision: release.revision, onSaved: () => { void saved() }, onCancel: cancel }
  const closure = outcome.closure
  const agreed = outcome.agreed

  function stepForm(action: JourneyAction) {
    switch (action) {
      case "release": return <ReleaseForm {...form} audience={release.audience} earliestExposure={release.earliestExposure} today={release.today} valueBefore={release.valueBefore} />
      case "correctRelease": return release.release && <ReleaseForm {...form} audience={release.audience} earliestExposure={release.earliestExposure} today={release.today} valueBefore={release.valueBefore} correcting={{ ...release.release, valueBefore: release.recordedValueBefore }} />
      case "voidRelease": return <VoidReleaseForm {...form} />
      case "close": return agreed && <MeasuredCloseForm {...form} agreed={agreed} release={release.release} />
      case "closeWithoutResult": return <CloseWithoutResultForm {...form} />
      case "correctClosure": return closure && <ClosureCorrectionForm {...form} closureKind={closure.kind} />
      case "followUp": return <FollowUpForm {...form} onCreated={id => router.push(`/requests/${id}`)} />
      case "handover": return <HandoverForm {...form} people={release.people} />
    }
  }

  function details(step: TimelineStep) {
    if (step.state !== "finished" && step.state !== "current") return null
    if (step.status === "open") return <RequestReviews requestId={requestId} orgId={orgId} isAdmin={isAdmin} isGuest={isGuest} revision={revision} />
    if (step.status === "measuring") {
      const fact = release.release ?? closure?.release
      if (!fact) return null
      return <div className={styles.facts}>
        <p className={styles.muted}>Evidence: {fact.evidence}</p>
        {release.recordedValueBefore && <p className={styles.muted}>Value before release: {resultValue(release.recordedValueBefore.value, release.recordedValueBefore.unit)}.</p>}
        {fact.windowKind === "fixed" && <p className={styles.muted}>Agreed fixed window: {journeyDate(fact.startDate)} to {journeyDate(fact.dueDate)}. Release timing does not move these dates.</p>}
        {step.state === "current" && <p className={styles.muted}>The due date does not close this Request automatically.</p>}
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
        <p>Evidence: {closure.evidence}</p>
        <p className={styles.muted}>Observed {journeyDate(closure.observedFrom)} to {journeyDate(closure.observedTo)} (UTC).</p>
      </>}
      {closure.kind === "exception" && closure.reason && <p>{closure.reason}</p>}
      {!!outcome.corrections.length && <div className={styles.facts}><h4>Corrections</h4><ol className={styles.list}>{outcome.corrections.map(c => <li key={c.operationId}>
        <p>{CORRECTION_FIELD_OPTIONS.find(o => o.value === c.field)?.label}: {c.correction}</p>
        <p className={styles.muted}>Reason: {c.reason}. Added by {name(c.actorId)} on {day(c.at)}.</p>
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
    {(error || views.rosterUnavailable) && <div className={styles.controls}><Button variant="secondary" onClick={() => { void refresh.refresh() }}>Retry</Button></div>}
    <ol className={styles.steps}>
      {steps.map(step => {
        const headingId = `journey-${step.status}`
        return <li key={step.status} className={styles.step} data-state={step.state} aria-current={step.state === "current" ? "step" : undefined}>
          <span className={styles.marker} aria-hidden="true" />
          <div className={styles.stepBody}>
            <h3 id={headingId} className={styles.stepHeading}>{step.label}<span className="sr-only"> ({STATE_WORDS[step.state]})</span></h3>
            {step.state === "skipped" && <p className={styles.muted}>Skipped</p>}
            {step.happened.map(line => <p key={line}>{line}</p>)}
            {details(step)}
            {step.countdown && <p role="status" className={styles.countdown}>{step.countdown}</p>}
            {step.next && <p className={styles.muted}>{step.next}</p>}
            {!!step.actions.length && mode === null && <ul className={styles.actions} aria-label={`${step.label} actions`}>
              {step.actions.map((action, index) => <li key={action.action} className={styles.action}>
                {action.available
                  ? <Button variant={index === 0 ? "primary" : "secondary"} onClick={() => { refresh.openForm(); setMode(action.action) }}>{action.label}</Button>
                  : <><Button variant="secondary" disabled aria-describedby={`${headingId}-${action.action}`}>{action.label}</Button><span id={`${headingId}-${action.action}`} className={styles.muted}>{action.reason}</span></>}
              </li>)}
            </ul>}
            {mode && step.actions.some(a => a.action === mode && a.available) && stepForm(mode)}
          </div>
        </li>
      })}
    </ol>
    {!!release.history.length && <details className={styles.history}>
      <summary>Release and handover history ({release.history.length})</summary>
      <ol className={styles.list}>{release.history.map(event => <li key={event.revision}>
        <p>{historyLine(event)} by {name(event.actorId)} on {day(event.at)}.</p>
        {"reason" in event.input && <p className={styles.muted}>{event.input.reason}</p>}
        {event.input.kind === "transfer" && <p className={styles.muted}>{name(event.previousOwnerId)} → {name(event.ownerId)}</p>}
        {event.release && <p className={styles.muted}>Exposure: {journeyDate(event.release.exposureDate)}. Audience: {event.release.audience}. Due: {journeyDate(event.release.dueDate)} (UTC). Evidence: {event.release.evidence}</p>}
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
