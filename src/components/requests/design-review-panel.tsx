"use client"

import { useEffect, useId, useRef, useState, type FormEvent, type KeyboardEvent } from "react"
import { ExternalLink } from "lucide-react"
import { Alert } from "@/components/arc/alert/alert"
import { Badge } from "@/components/arc/badge/badge"
import { Button } from "@/components/arc/button/button"
import { Input } from "@/components/arc/input/input"
import { RadioGroup } from "@/components/arc/radio-group/radio-group"
import { Textarea } from "@/components/arc/textarea/textarea"
import { currentReview, latestReviewerResponse, reviewHasAllResponses, startReviewInputSchema, respondToReviewInputSchema, withdrawReviewInputSchema, type DesignReview, type RequestReviewState, type ReviewActionResult, type ReviewPerson, type StartReviewInput, type RespondToReviewInput, type WithdrawReviewInput } from "@/lib/request-review"
import { ASK_FOR_REVIEW_HINT, CURRENT_REVIEW_HINT } from "./design-review-copy"
import { LocalTime } from "./local-time"
import { beginAsk, beginRespond, confirm, emptyAskDraft, reconcile, rollback, shownState, type AskDraft, type ResponseDraft, type ReviewPanelState } from "./review-optimistic"
import { ReviewerPicker, type FindReviewers } from "./reviewer-picker"
import styles from "./design-review-panel.module.css"

export { REVIEWER_DEBOUNCE_MS } from "./reviewer-search"

export type DesignReviewPanelProps = {
  initialState: RequestReviewState
  currentUserId: string
  /** Plan item 2.6: who is reading, stamped on a round or a response the moment it is sent, before the server answers. */
  viewer: ReviewPerson
  canRequest: boolean
  canManage: boolean
  /** Resolves one reviewer search. The signal aborts it when a newer query replaces it (plan item 1.16). */
  onFindReviewers: FindReviewers
  onRequest: (input: StartReviewInput) => Promise<ReviewActionResult>
  onRespond: (input: RespondToReviewInput) => Promise<ReviewActionResult>
  onWithdraw: (input: WithdrawReviewInput) => Promise<ReviewActionResult>
  /** Plan item 2.5: the section's id ("ask-for-review" on Request detail); its heading takes `${id}-heading`. */
  id?: string
  /** Plan item 2.5: true while a form the viewer opened is showing, so the page strip hides its filled action. */
  onFormOpenChange?: (open: boolean) => void
}

/** Plan item 2.5: Esc in an open form cancels it, unless an input method is composing. */
function cancelOnEscape(onCancel?: () => void) {
  return (event: KeyboardEvent<HTMLFormElement>) => {
    if (event.key !== "Escape" || event.nativeEvent.isComposing || !onCancel || event.defaultPrevented) return
    event.preventDefault()
    onCancel()
  }
}

const REVIEWER_LIMIT = 10
const decisions = [{ value: "looks_good", label: "Looks good" }, { value: "changes_requested", label: "Changes requested" }]
const decisionLabel = (decision: string) => decision === "looks_good" ? "Looks good" : "Changes requested"
const SAVE_FAILED = "The review could not be saved. Your draft is still here. Try again."
const newId = () => typeof crypto !== "undefined" && "randomUUID" in crypto ? crypto.randomUUID() : `local-${Date.now()}-${Math.random().toString(36).slice(2)}`

function SaveError({ error }: { error: string | null }) {
  return error ? <Alert tone="danger" title="Could not save review">{error}</Alert> : null
}

function AskForm({ expectedVersion, currentUserId, error, blocked, onFindReviewers, onSave, onCancel, initialDraft, onDraftChange, focusSubmit = false }: Pick<DesignReviewPanelProps, "currentUserId" | "onFindReviewers"> & {
  expectedVersion: number; error: string | null; blocked?: string
  onSave: (input: StartReviewInput, draft: AskDraft) => void; onCancel: () => void
  /** Plan item 2.6: the draft lives in the panel while the form is closed and its save is in flight. */
  initialDraft: AskDraft; onDraftChange: (draft: AskDraft) => void
  /** After a rollback the submit takes focus, so Enter retries. */
  focusSubmit?: boolean
}) {
  const [draft, setDraft] = useState(initialDraft)
  const [errors, setErrors] = useState<Record<string, string>>({})
  const urlInput = useRef<HTMLInputElement>(null)
  const submitButton = useRef<HTMLButtonElement>(null)
  const uid = useId()
  useEffect(() => { (focusSubmit ? submitButton : urlInput).current?.focus() }, [focusSubmit])

  function update(patch: Partial<AskDraft>) {
    const next = { ...draft, ...patch }
    setDraft(next); onDraftChange(next)
  }
  function submit(event: FormEvent) {
    event.preventDefault()
    if (blocked) return
    const parsed = startReviewInputSchema.safeParse({ expectedVersion, designUrl: draft.designUrl, question: draft.question, reviewerIds: draft.reviewers.map(person => person.id) })
    if (!parsed.success) {
      setErrors(Object.fromEntries(parsed.error.issues.map(issue => [String(issue.path[0]), issue.message])))
      return
    }
    setErrors({}); onSave(parsed.data, draft)
  }
  return <form aria-label="Ask for design review" className={styles.form} onSubmit={submit} onKeyDown={cancelOnEscape(onCancel)} noValidate data-detail-form="">
    <Input ref={urlInput} label="Design version link" type="url" value={draft.designUrl} onChange={event => update({ designUrl: event.target.value })} maxLength={2000} error={errors.designUrl} description="Link to the exact version you want reviewed. This link stays with this round." />
    <Textarea label="What needs feedback?" value={draft.question} onChange={event => update({ question: event.target.value })} rows={3} maxLength={2000} error={errors.question} />
    <fieldset className={styles.reviewers} aria-describedby={`${uid}-selection`}>
      <legend>Reviewers</legend>
      <ReviewerPicker selected={draft.reviewers} onChange={reviewers => update({ reviewers })} limit={REVIEWER_LIMIT} excludeId={currentUserId} onFindReviewers={onFindReviewers} disabled={Boolean(blocked)} />
      <p id={`${uid}-selection`} className={styles.hint}>{draft.reviewers.length} of {REVIEWER_LIMIT} selected. Choose teammates other than yourself.</p>
      {errors.reviewerIds && <p role="alert" className={styles.error}>{errors.reviewerIds}</p>}
    </fieldset>
    <SaveError error={blocked ?? error} />
    <div className={styles.actions}><Button ref={submitButton} type="submit" disabled={Boolean(blocked)} data-review-primary="" className={styles.action}>Ask for review</Button><Button type="button" variant="ghost" className={styles.action} onClick={onCancel} data-detail-form-cancel="">Cancel</Button></div>
  </form>
}

function ResponseForm({ review, currentUserId, expectedVersion, error, blocked, onSave, onCancel, opened = false, initialDraft, onDraftChange, focusSubmit = false }: {
  review: DesignReview; currentUserId: string; expectedVersion: number; error: string | null; blocked?: string
  onSave: (input: RespondToReviewInput, draft: ResponseDraft) => void; onCancel?: () => void
  /** The viewer opened it (Respond or Edit), as opposed to the form offered to a named reviewer on arrival. */
  opened?: boolean
  initialDraft?: ResponseDraft; onDraftChange: (draft: ResponseDraft) => void
  focusSubmit?: boolean
}) {
  const previous = latestReviewerResponse(review, currentUserId)
  const [draft, setDraft] = useState<ResponseDraft>(initialDraft ?? { decision: previous?.decision ?? "looks_good", note: previous?.note ?? "" })
  const [noteError, setNoteError] = useState<string>()
  const submitButton = useRef<HTMLButtonElement>(null)
  useEffect(() => { if (focusSubmit) submitButton.current?.focus() }, [focusSubmit])
  function update(patch: Partial<ResponseDraft>) {
    const next = { ...draft, ...patch }
    setDraft(next); onDraftChange(next)
  }
  function submit(event: FormEvent) {
    event.preventDefault()
    if (blocked) return
    const parsed = respondToReviewInputSchema.safeParse({ expectedVersion, reviewId: review.id, decision: draft.decision, note: draft.note })
    if (!parsed.success) { setNoteError(parsed.error.issues[0].message); return }
    setNoteError(undefined); onSave(parsed.data, draft)
  }
  // Plan item 2.6 (decision D4): a form the viewer did not open never becomes the page's primary and never hides the strip.
  return <form aria-label="Respond to design review" className={styles.form} onSubmit={submit} onKeyDown={cancelOnEscape(onCancel)} noValidate data-detail-form={opened ? "" : undefined}>
    {blocked && <p className={styles.hint}>Unsent feedback for {review.designUrl}</p>}
    <fieldset className={styles.fields}><RadioGroup label="Your feedback" options={decisions} value={draft.decision} onValueChange={value => update({ decision: value as RespondToReviewInput["decision"] })} /></fieldset>
    <Textarea label="Feedback note" description={draft.decision === "changes_requested" ? "Explain the changes you need." : "Optional context for your response."} value={draft.note} onChange={event => update({ note: event.target.value })} rows={3} maxLength={5000} error={noteError} />
    <SaveError error={blocked ?? error} />
    <div className={styles.actions}><Button ref={submitButton} type="submit" variant={opened ? "primary" : "secondary"} disabled={Boolean(blocked)} data-review-primary={opened ? "" : undefined} className={styles.action}>{previous ? "Save feedback" : "Send feedback"}</Button>{onCancel && <Button type="button" variant="ghost" className={styles.action} onClick={onCancel} data-detail-form-cancel={opened ? "" : undefined}>Cancel edit</Button>}</div>
  </form>
}

function WithdrawForm({ expectedVersion, reviewId, pending, error, blocked, onSave, onCancel }: {
  expectedVersion: number; reviewId: string; pending: boolean; error: string | null; blocked?: string
  onSave: (input: WithdrawReviewInput) => void; onCancel: () => void
}) {
  const [reason, setReason] = useState("")
  const [reasonError, setReasonError] = useState<string>()
  const input = useRef<HTMLTextAreaElement>(null)
  useEffect(() => { input.current?.focus() }, [])
  function submit(event: FormEvent) {
    event.preventDefault()
    if (pending || blocked) return
    const parsed = withdrawReviewInputSchema.safeParse({ expectedVersion, reviewId, reason })
    if (!parsed.success) { setReasonError(parsed.error.issues[0].message); return }
    setReasonError(undefined); onSave(parsed.data)
  }
  return <form aria-label="Withdraw design review" className={styles.form} onSubmit={submit} onKeyDown={cancelOnEscape(pending ? undefined : onCancel)} noValidate data-detail-form="">
    <Textarea ref={input} label="Reason for withdrawal" description="The reason and all feedback stay in the review history." value={reason} onChange={event => setReason(event.target.value)} rows={3} maxLength={2000} readOnly={pending} error={reasonError} />
    <SaveError error={blocked ?? error} />
    <div className={styles.actions}><Button type="submit" variant="danger" loading={pending} disabled={Boolean(blocked)} className={styles.action}>Confirm withdrawal</Button><Button type="button" variant="ghost" disabled={pending} className={styles.action} onClick={onCancel} data-detail-form-cancel="">Cancel withdrawal</Button></div>
  </form>
}

/** Plan item 2.6: 13px rows on the property panel's 32px grid; times in the viewer's zone; "Sending…" where a pending save's time will be. */
function RoundSummary({ review, sending }: { review: DesignReview; sending?: { roundId?: string; responseId?: string } }) {
  const roundPending = sending?.roundId === review.id
  return <div className={styles.round}>
    <div className={styles.roundHeader}><Badge tone={review.withdrawal ? "neutral" : reviewHasAllResponses(review) ? "info" : "neutral"}>{review.withdrawal ? "Withdrawn" : reviewHasAllResponses(review) ? "Feedback received" : "Waiting for feedback"}</Badge><span className={styles.hint}>Asked by {review.requestedBy.name} · {roundPending ? <span>Sending…</span> : <LocalTime iso={review.requestedAt} />}</span></div>
    <a className={styles.designLink} href={review.designUrl} target="_blank" rel="noopener noreferrer">Open design version<ExternalLink size={14} aria-hidden="true" /></a>
    <p className={styles.url}>{review.designUrl}</p>
    <p className={styles.question}>{review.question}</p>
    <ul aria-label="Reviewers" className={styles.responses}>{review.reviewers.map(person => {
      const response = latestReviewerResponse(review, person.id)
      const responsePending = response !== undefined && response.id === sending?.responseId
      return <li key={person.id} className={styles.response}>
        <span className={styles.responseName}>{person.name}</span>
        {/* Feedback, not a blocker (decision D2): the words carry the meaning, so both decisions share the neutral tone. */}
        <Badge size="sm" tone="neutral">{response ? decisionLabel(response.decision) : "Waiting"}</Badge>
        {response && (responsePending ? <span className={styles.responseTime}>Sending…</span> : <LocalTime className={styles.responseTime} iso={response.createdAt} />)}
        {response?.note && <p className={styles.responseNote}>{response.note}</p>}
      </li>
    })}</ul>
    {review.withdrawal && <div className={styles.withdrawal}><p className={styles.withdrawalLine}>Withdrawn by {review.withdrawal.by.name} · <LocalTime iso={review.withdrawal.at} /></p><p className={styles.withdrawalReason}>{review.withdrawal.reason}</p></div>}
    {review.responses.length > 0 && <details className={styles.history}><summary>Response history</summary><ol className={styles.events}>{review.responses.map(response => <li key={response.id} className={styles.response}>
      <span className={styles.responseName}>{review.reviewers.find(person => person.id === response.reviewerId)?.name ?? "Former reviewer"}</span>
      <span className={styles.responseDecision}>{decisionLabel(response.decision)}</span>
      {response.id === sending?.responseId ? <span className={styles.responseTime}>Sending…</span> : <LocalTime className={styles.responseTime} iso={response.createdAt} />}
      {response.note && <p className={styles.responseNote}>{response.note}</p>}
    </li>)}</ol></details>}
  </div>
}

export function DesignReviewPanel({ initialState, currentUserId, viewer, canRequest, canManage, onFindReviewers, onRequest, onRespond, onWithdraw, id, onFormOpenChange }: DesignReviewPanelProps) {
  const [state, setState] = useState<ReviewPanelState>({ saved: initialState, pending: null })
  const [mode, setMode] = useState<"view" | "ask" | "withdraw">("view")
  const [askAfterReviewId, setAskAfterReviewId] = useState<string | null>(null)
  const [withdrawTarget, setWithdrawTarget] = useState<DesignReview | null>(null)
  const [responseTarget, setResponseTarget] = useState<DesignReview | null>(null)
  // The response form the viewer opened with Respond or Edit; the one offered to a named reviewer on arrival does not count (decision D4).
  const [responseOpened, setResponseOpened] = useState(false)
  const [offeredReviewId, setOfferedReviewId] = useState<string | null>(null)
  // Plan item 2.6: drafts outlive their forms, which close the moment a save is sent and reopen filled if it fails.
  const [askDraft, setAskDraft] = useState<AskDraft | null>(null)
  const [responseDraft, setResponseDraft] = useState<ResponseDraft | null>(null)
  const [retrying, setRetrying] = useState<"ask" | "respond" | null>(null)
  const [withdrawing, setWithdrawing] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [announcement, setAnnouncement] = useState("")
  const inFlight = useRef(false)
  const tokens = useRef(0)
  const mounted = useRef(false)
  const latest = useRef(state)
  const heading = useRef<HTMLHeadingElement>(null)
  const uid = useId()
  // A refreshed server snapshot may be newer than a locally returned save.
  // It updates the record while form-local drafts remain mounted and intact; a pending save is kept.
  if (initialState.version > state.saved.version) setState(reconcile(state, initialState))
  useEffect(() => { mounted.current = true; return () => { mounted.current = false } }, [])
  // The state a server response settles against, read after the await (never during render).
  useEffect(() => { latest.current = state }, [state])

  const shown = shownState(state)
  const pending = state.pending !== null || withdrawing
  // Synchronous on purpose: the heading is always mounted, and a deferred focus could land after a fast failure
  // had already reopened the draft with focus on its submit (so Enter retries), stealing it back to the heading.
  function focusHeading() { heading.current?.focus({ preventScroll: true }) }

  /** Waits for the server behind an optimistic Ask or Respond: confirm swaps in its state; a failure rolls back and reopens the draft. */
  async function settle(token: number, kind: "ask" | "respond", action: () => Promise<ReviewActionResult>) {
    let result: ReviewActionResult
    try { result = await action() } catch { result = { error: SAVE_FAILED } }
    inFlight.current = false
    if (!mounted.current) return
    if ("error" in result) {
      const review = currentReview(latest.current.saved)
      setState(previous => rollback(previous, token).state)
      if (kind === "ask") { setMode("ask") }
      else if (review) { setResponseTarget(review); setResponseOpened(true) }
      setRetrying(kind)
      setError(result.error)
      setAnnouncement(kind === "ask" ? "Could not save the review. Your draft is back." : "Could not save your feedback. Your draft is back.")
      return
    }
    setState(previous => confirm(previous, token, result.state))
    if (kind === "ask") setAskDraft(null); else setResponseDraft(null)
  }
  function ask(input: StartReviewInput, draft: AskDraft) {
    if (inFlight.current || state.pending) return
    const token = ++tokens.current
    let next: ReviewPanelState
    try { next = beginAsk(state, input, draft, viewer, new Date().toISOString(), newId(), token) }
    catch (thrown) { setError(thrown instanceof Error ? thrown.message : SAVE_FAILED); return }
    inFlight.current = true
    setState(next); setMode("view"); setError(null); setRetrying(null); setAskDraft(draft)
    setAnnouncement("Review requested."); focusHeading()
    void settle(token, "ask", () => onRequest(input))
  }
  function respond(input: RespondToReviewInput, draft: ResponseDraft, review: DesignReview) {
    if (inFlight.current || state.pending) return
    const token = ++tokens.current
    let next: ReviewPanelState
    try { next = beginRespond(state, input, draft, viewer, new Date().toISOString(), newId(), token) }
    catch (thrown) { setError(thrown instanceof Error ? thrown.message : SAVE_FAILED); return }
    inFlight.current = true
    setState(next); setResponseTarget(null); setResponseOpened(false); setOfferedReviewId(review.id); setError(null); setRetrying(null); setResponseDraft(draft)
    setAnnouncement("Feedback saved."); focusHeading()
    void settle(token, "respond", () => onRespond(input))
  }
  /** Withdraw stays confirmed by the server (decision D3): a reasoned, rare step with its own form. */
  async function withdraw(input: WithdrawReviewInput) {
    if (inFlight.current) return
    inFlight.current = true; setWithdrawing(true); setError(null)
    try {
      const result = await onWithdraw(input)
      if (!mounted.current) return
      if ("error" in result) { setError(result.error); return }
      setState(previous => ({ saved: result.state.version >= previous.saved.version ? result.state : previous.saved, pending: previous.pending }))
      setMode("view"); setWithdrawTarget(null); setAnnouncement("Review withdrawn.")
      focusHeading()
    } catch { if (mounted.current) setError(SAVE_FAILED) }
    finally { inFlight.current = false; if (mounted.current) setWithdrawing(false) }
  }
  function cancel() { setMode("view"); setError(null); setRetrying(null); setAskDraft(null); focusHeading() }
  const review = currentReview(shown)
  const mayStart = canRequest && (!review || Boolean(review.withdrawal) || reviewHasAllResponses(review))
  const mayRespond = canRequest && review && !review.withdrawal && review.reviewers.some(person => person.id === currentUserId)
  const hasResponded = review && Boolean(latestReviewerResponse(review, currentUserId))
  const mayWithdraw = canRequest && review && !review.withdrawal && (canManage || review.requestedBy.id === currentUserId)
  if (review && review.id !== offeredReviewId && mode === "view" && !responseTarget) {
    setOfferedReviewId(review.id)
    if (mayRespond && !hasResponded) setResponseTarget(review)
  }
  const staleResponse = responseTarget && (review?.id !== responseTarget.id || Boolean(review.withdrawal) || !canRequest)
  const staleWithdrawal = withdrawTarget && (review?.id !== withdrawTarget.id || Boolean(review.withdrawal) || !mayWithdraw)
  const staleAsk = mode === "ask" && (!mayStart || (review?.id ?? null) !== askAfterReviewId)
  const retainMessage = "This review changed. Your draft is still here. Copy anything you need before cancelling and opening the current review."
  // Plan item 2.5 (decision D8): while a form the viewer opened shows, its submit is the page's one filled button.
  const formOpen = mode === "ask" || mode === "withdraw" || (mode === "view" && Boolean(responseTarget) && responseOpened)
  useEffect(() => {
    if (!formOpen || !onFormOpenChange) return
    onFormOpenChange(true)
    return () => onFormOpenChange(false)
  }, [formOpen, onFormOpenChange])
  const headingId = id ? `${id}-heading` : `${uid}-heading`
  const sending = state.pending ? state.pending.kind === "ask" ? { roundId: state.pending.roundId } : { responseId: state.pending.responseId } : undefined

  return <section id={id} aria-labelledby={headingId} className={styles.panel}>
    {/* Plan item 2.5: "Ask for review" names the section; its button is secondary, so the page keeps one filled button (D8). */}
    <div className={styles.header}><h2 ref={heading} tabIndex={-1} id={headingId}>Ask for review</h2>{mayStart && mode !== "ask" && <Button type="button" variant="secondary" disabled={pending} className={styles.action} onClick={() => { setAskAfterReviewId(review?.id ?? null); setAskDraft(null); setRetrying(null); setMode("ask"); setError(null) }}>Ask for review</Button>}</div>
    <p className={styles.hint}>{review ? CURRENT_REVIEW_HINT : ASK_FOR_REVIEW_HINT}</p>
    {mode === "ask" && <AskForm expectedVersion={state.saved.version} currentUserId={currentUserId} error={error} blocked={staleAsk ? retainMessage : undefined} onFindReviewers={onFindReviewers}
      initialDraft={askDraft ?? emptyAskDraft} onDraftChange={setAskDraft} focusSubmit={retrying === "ask"} onSave={ask} onCancel={cancel} />}
    {review && <section aria-label="Current review" className={styles.current}>
      <RoundSummary review={review} sending={sending} />
      {mode === "view" && responseTarget && <ResponseForm key={`${responseTarget.id}:${currentUserId}`} review={responseTarget} currentUserId={currentUserId} expectedVersion={state.saved.version} error={error} blocked={staleResponse ? retainMessage : undefined} opened={responseOpened}
        initialDraft={responseDraft ?? undefined} onDraftChange={setResponseDraft} focusSubmit={retrying === "respond"}
        onSave={(input, draft) => respond(input, draft, responseTarget)}
        onCancel={() => { setResponseTarget(null); setResponseOpened(false); setOfferedReviewId(review.id); setResponseDraft(null); setRetrying(null); setError(null); focusHeading() }} />}
      {mode === "view" && mayRespond && !responseTarget && <Button type="button" variant="secondary" disabled={pending} className={styles.action} onClick={() => { setResponseTarget(review); setResponseOpened(true); setResponseDraft(null); setError(null) }}>{hasResponded ? "Edit your feedback" : "Respond to review"}</Button>}
      {mode === "withdraw" && withdrawTarget && <WithdrawForm expectedVersion={state.saved.version} reviewId={withdrawTarget.id} pending={withdrawing} error={error} blocked={staleWithdrawal ? retainMessage : undefined} onSave={input => { void withdraw(input) }} onCancel={cancel} />}
      {mode === "view" && mayWithdraw && !responseTarget && <Button type="button" variant="ghost" disabled={pending} className={styles.action} onClick={() => { setWithdrawTarget(review); setMode("withdraw"); setError(null) }}>Withdraw review</Button>}
    </section>}
    {shown.reviews.length > 1 && <details className={styles.history}><summary>Review history</summary><div className={styles.pastRounds}>{shown.reviews.slice(0, -1).map((past, index) => <section key={past.id} aria-label={`Review round ${index + 1}`}><h3>Round {index + 1}</h3><RoundSummary review={past} /></section>)}</div></details>}
    <p role="status" className={styles.announcement}>{announcement}</p>
  </section>
}
