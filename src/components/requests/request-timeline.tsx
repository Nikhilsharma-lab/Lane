"use client"
import { callAction } from "@/lib/action-call"
import { useEffect, useRef, useState, type ReactNode } from "react"
import Link from "@/components/link"
import { Button } from "@/components/arc/button/button"
import { Timeline, type TimelineEvent } from "@/components/arc/timeline/timeline"
import { Check, CirclePlus, Play, History } from "lucide-react"
import { useOptionalDetailRequest } from "./detail-context"
import { useInBrowser } from "./local-time"
import { readRequestJourney } from "@/app/(app)/requests/[id]/journey-actions"
import { formatRequestCode } from "@/lib/request-code"
import { plannedDay } from "@/lib/dates"
import type { WorkspacePermission } from "@/lib/auth-guard"
import { canChange } from "@/lib/request-access-rules"
import { FORMER_MEMBER, type JourneyAction } from "@/lib/request-journey"
import { reopenEndsAt } from "@/lib/reopen-window"
import { useToastStack } from "@/components/arc/toast-stack/toast-stack"
import { useListAnnouncer } from "./list-announcer"
import { usePendingMutationWriter } from "./pending-mutations-provider"
import { useRequestMoves } from "./request-moves"
import type { ReleaseEvent } from "@/lib/request-release"
import type { RequestDetail } from "./detail-view"
import { RequestReviews } from "./request-reviews"
import { JourneyStepActions } from "./journey-step-actions"
import { JourneyStepForm } from "./journey-step-form"
import { journeyStepDetails } from "./journey-step-details"
import { liveJourney, timelineSteps, type JourneyOutline, type OutlineLine, type TimelineStep } from "./request-timeline-model"
import { JourneyLine } from "./journey-line"
import { LocalTime } from "./local-time"
import { createJourneyRefresh, viewerToday, watchJourneyDate } from "./journey-refresh"
import styles from "./request-timeline.module.css"
import { RequestPanePanel } from "./request-pane-tabs"
import { Placeholder } from "@/components/loading/placeholder";
import { SectionHeading } from "./section-heading";

export type Views = Exclude<Awaited<ReturnType<typeof readRequestJourney>>, { error: string }>

const NO_OUTLINE: JourneyOutline = { steps: [], history: false }
const LOAD_FAILED = "Couldn’t load the journey. Try again."
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
      <SectionHeading level={3} id={`journey-${step.status}`} className={styles.stepHeading}>{step.label}<span className="sr-only"> ({STATE_WORDS[step.state]})</span></SectionHeading>
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
type Props = { request: RequestDetail; orgId: string; isAdmin?: boolean; isGuest: boolean; readOnly?: boolean; reader?: { userId: string; role: WorkspacePermission } }
export function RequestTimeline(props: Props) {
  return <JourneyTimeline key={`${props.orgId}:${props.request.id}`} {...props} />
}

function JourneyTimeline({ request, orgId, isGuest, readOnly = false, reader }: Props) {
  const detail = useOptionalDetailRequest()
  const peek = detail?.peek
  const requestId = request.id
  // B1: the live Request, as the strip and the properties show it (the server row with any move still on its way).
  const live = detail?.request.id === requestId ? detail.request : request
  const revision = request.agreementRevision ?? 0
  const [views, setViews] = useState<Views | null>(null)
  const [error, setError] = useState("")
  const [mode, setMode] = useState<JourneyAction | null>(null)
  // C2-4: a close this page saved, shown as Closed until the reads bring the closure back.
  const [closedHere, setClosedHere] = useState<{ withoutResult: boolean } | null>(null)
  // The viewer's clock as of the latest read, and when Reopen's minutes end: the day and Reopen are read against it.
  const [clock, setClock] = useState(() => new Date(request.createdAt).getTime())
  const heading = useRef<HTMLHeadingElement>(null)
  const { toast } = useToastStack()
  const moves = useRequestMoves({ orgId, announce: useListAnnouncer() })
  const overlay = usePendingMutationWriter()
  const [refresh] = useState(() => createJourneyRefresh({
    read: () => readViews(requestId, orgId),
    show: (next) => {
      if ("error" in next) setError(next.error)
      else { setViews(next); setError(""); setClock(Date.now()) }
    },
  }))
  useEffect(() => {
    refresh.activate()
    return () => refresh.dispose()
  }, [refresh])
  // Pickup, Done and Reopen change status without changing the journey revision. Read again whenever the shown status
  // moves, once the move has answered (so the read sees it), in the same lifetime, deferred while a form is open.
  const liveStatus = live.status
  const serverStatus = request.status
  useEffect(() => {
    // Nothing on its way: read now, as the page loads.
    if (liveStatus === serverStatus || !overlay) { void refresh.reload(); return }
    let current = true
    void overlay.settled(requestId).then(() => { if (current) void refresh.reload() })
    return () => { current = false }
  }, [refresh, overlay, requestId, revision, serverStatus, liveStatus])
  const today = views?.release.today
  useEffect(() => {
    if (today) return watchJourneyDate(today, () => { void refresh.reload() })
  }, [today, refresh])
  // Reopen hides itself when its minutes end, without a reload.
  const doneAt = views?.release.doneAt ?? null
  useEffect(() => {
    if (!doneAt || reopenEndsAt(doneAt) <= clock) return
    const timer = window.setTimeout(() => setClock(Date.now()), reopenEndsAt(doneAt) - Date.now())
    return () => window.clearTimeout(timer)
  }, [doneAt, clock])

  function saved() {
    // A close shows as Closed at once, and says so (C2-4).
    if (mode === "close" || mode === "closeWithoutResult") {
      setClosedHere({ withoutResult: mode === "closeWithoutResult" })
      toast({ type: "success", title: "Request closed", description: `${detail?.name ?? "This Request"} is ${mode === "close" ? "Closed" : "Closed without a result"}.` })
    }
    setMode(null)
    void refresh.saved(() => heading.current?.focus())
  }
  function reopen() {
    // The Done step and its button go; the Journey keeps focus.
    heading.current?.focus()
    void moves.reopen({ id: requestId, name: detail?.name ?? request.title })
  }
  function cancel() {
    setMode(null)
    void refresh.closeForm()
  }
  function openForm(action: JourneyAction) {
    refresh.openForm()
    setMode(action)
  }

  if (!views && error) return <><RequestPanePanel value="journey"><section id="journey" aria-labelledby="journey-heading" className={styles.timeline}>
    <SectionHeading level={2} id="journey-heading" className={styles.heading}>Journey</SectionHeading>
    <p role="alert">{error}</p><div className={styles.controls}><Button variant="secondary" onClick={() => { void refresh.reload() }}>Try again</Button></div>
  </section></RequestPanePanel>{peek && <RequestPanePanel value="activity"><p role="alert">{error}</p><Button variant="secondary" onClick={() => { void refresh.reload() }}>Try again</Button></RequestPanePanel>}</>
  const open = live.status === "open"
  // Drawn in the outline, read once the journey's reads are back: the reviewers' read would otherwise go ahead of them.
  const reviews = <RequestReviews requestId={requestId} orgId={orgId} isGuest={isGuest} revision={revision} deferred={!views}
    expected={{ reviewers: request.reviewerOutline ?? [], open, canAdd: open && !isGuest && !readOnly, canRemove: open && !!reader && canChange(reader, request) }} />

  // #295: until the reads arrive, the journey as the server drew it from the saved Request, in the same places as below.
  if (!views) {
    const outline = request.journeyOutline ?? NO_OUTLINE
    return <><RequestPanePanel value="journey"><section id="journey" aria-labelledby="journey-heading" className={styles.timeline}>
      <div className={styles.header}>
        <SectionHeading level={2} id="journey-heading" tabIndex={-1} ref={heading} className={styles.heading}>Journey</SectionHeading>
        <p className={`${styles.end} ${styles.muted}`}>Requester: <span className={styles.heldName} data-pending="" /></p>
      </div>
      {/* The "Follow-up of" line's place; its code and title arrive with the reads. */}
      {request.followUpOf ? <Held /> : null}
      <p role="status" className="sr-only">Loading journey…</p>
      <ol className={styles.steps}>
        {outline.steps.map(step => stepItem(step, {
          happened: step.happened.map(outlineLine), details: step.reviews ? reviews : null, countdown: null, next: step.after.map(outlineLine),
          actions: step.actions.length + step.more.length > 0 && <Placeholder><ul className={styles.actions} aria-hidden="true" data-pending="actions">
            {step.actions.map(action => <li key={action.action} className={styles.action}>
              <HeldButton label={action.label} />{!action.available && <span className={styles.heldReason}>{action.reason}</span>}
            </li>)}
            {step.more.length > 0 && <li className={styles.action}><HeldButton label="More" /></li>}
          </ul></Placeholder>, form: null,
        }))}
      </ol>
      {outline.history && <Held />}
    </section></RequestPanePanel>{peek && <RequestPanePanel value="activity"><p role="status">Loading activity…</p></RequestPanePanel>}</>
  }

  const { release, outcome } = views
  const names = { ...release.names, ...outcome.names }
  const name = (id: string) => names[id] ?? FORMER_MEMBER
  const steps = timelineSteps({
    ...liveJourney({ journey: release.journey, workStatus: release.workStatus, release: release.release }, { status: live.status, closed: closedHere }),
    isGuest, readOnly, audience: release.audience,
    requesterName: release.requesterName, requestedBy: request.creatorName || FORMER_MEMBER, requestedAt: new Date(request.createdAt).toISOString(),
    assigneeName: live.assigneeName, pickedUpAt: release.pickedUpAt, doneAt: release.doneAt, release: release.release, releaseHistory: release.history,
    closure: outcome.closure, names, hasAgreedResult: Boolean(outcome.agreed),
    // The countdown counts the viewer's own day; the server decides when Close Request opens (its actions).
    actions: release.actions, now: new Date(`${viewerToday(new Date(clock))}T00:00:00Z`), clock: new Date(clock),
  })
  const form = { requestId, orgId, revision: release.revision, onSaved: () => { void saved() }, onCancel: cancel }

  return <><RequestPanePanel value="journey"><section id="journey" aria-labelledby="journey-heading" className={styles.timeline}>
    <div className={styles.header}>
      <SectionHeading level={2} id="journey-heading" tabIndex={-1} ref={heading} className={styles.heading}>Journey</SectionHeading>
      <p className={`${styles.end} ${styles.muted}`}>Requester: {release.requesterName}</p>
    </div>
    {outcome.followUpOf && <p>Follow-up of <Link href={`/requests/${outcome.followUpOf.id}`}>{formatRequestCode(outcome.followUpOf.requestNumber)} {outcome.followUpOf.title}</Link></p>}
    {error && <p role="alert">{error}</p>}
    {(error || views.rosterUnavailable) && <div className={styles.controls}><Button variant="secondary" onClick={() => { void refresh.reload() }}>Try again</Button></div>}
    <ol className={styles.steps}>
      {steps.map(step => {
        const headingId = `journey-${step.status}`
        return stepItem(step, {
          happened: step.happened.map((line, index) => <JourneyLine key={index} line={line} />),
          details: journeyStepDetails(step, { views, reviews, name }),
          countdown: step.countdown && <p role="status" className={styles.countdown} data-tone={step.countdownTone ?? undefined}>{step.countdown}</p>,
          next: step.next && <p className={styles.muted}>{step.next}</p>,
          actions: <JourneyStepActions step={step} headingId={headingId} onOpen={openForm} onReopen={reopen} />,
          form: null,
        })
      })}
    </ol>
    <JourneyStepForm mode={mode} steps={steps} views={views} form={form} />
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
      <SectionHeading level={3} className={styles.stepHeading}>Follow-ups</SectionHeading>
      <ul className={styles.list}>{outcome.followUps.map(f => <li key={f.id}>
        <Link href={`/requests/${f.id}`}>{formatRequestCode(f.requestNumber)} {f.title}</Link>
        <p className={styles.muted}>{f.reason}</p>
      </li>)}</ul>
    </div>}
  </section></RequestPanePanel>{peek && <RequestPanePanel value="activity"><RequestActivity request={request} views={views} /></RequestPanePanel>}</>
}

function RequestActivity({ request, views: { release, outcome } }: { request: RequestDetail; views: Views }) {
  const [now, setNow] = useState(() => new Date(request.createdAt).getTime())
  useEffect(() => {
    const tick = () => setNow(Date.now())
    const first = window.setTimeout(tick, 0)
    const timer = window.setInterval(tick, 60_000)
    return () => { window.clearTimeout(first); window.clearInterval(timer) }
  }, [])
  const inBrowser = useInBrowser()
  const names = { ...release.names, ...outcome.names }
  const events: TimelineEvent[] = [
    { id: "created", at: new Date(request.createdAt).toISOString(), actor: request.creatorName ?? FORMER_MEMBER, title: "created the Request", icon: <CirclePlus data-icon-size="sm" /> },
    ...(release.pickedUpAt ? [{ id: "picked-up", at: release.pickedUpAt, title: "Work started", icon: <Play data-icon-size="sm" /> }] : []),
    ...(release.doneAt ? [{ id: "done", at: release.doneAt, title: "Marked Done", icon: <Check data-icon-size="sm" />, tone: "success" as const }] : []),
    ...release.history.map(event => ({ id: `release-${event.revision}`, at: event.at, actor: names[event.actorId] ?? FORMER_MEMBER,
      title: historyLine(event).toLowerCase(), icon: <History data-icon-size="sm" />,
      detail: <div className={styles.facts}>
        {"reason" in event.input && <p>{event.input.reason}</p>}
        {event.release && <p>Audience: {event.release.audience}. Evidence: {event.release.evidence}</p>}
      </div>,
    })),
    ...(outcome.closure ? [{ id: "closed", at: outcome.closure.closedAt, title: "Request closed", icon: <Check data-icon-size="sm" /> }] : []),
  ]
  return <section id="request-activity" aria-labelledby="request-activity-heading" className={styles.timeline}>
    <SectionHeading level={2} id="request-activity-heading" tabIndex={-1} className={styles.heading}>Activity</SectionHeading>
    <Timeline events={events} now={now} label="Recorded Request activity" timeZone={inBrowser ? Intl.DateTimeFormat().resolvedOptions().timeZone : "UTC"} scrollToNew={false} />
  </section>
}
