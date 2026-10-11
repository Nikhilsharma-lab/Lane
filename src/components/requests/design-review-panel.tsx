"use client"

import { useEffect, useId, useRef, useState, type FormEvent } from "react"
import { ExternalLink } from "lucide-react"
import { Alert } from "@/components/arc/alert/alert"
import { Badge } from "@/components/arc/badge/badge"
import { Button } from "@/components/arc/button/button"
import { Checkbox } from "@/components/arc/checkbox/checkbox"
import { Input } from "@/components/arc/input/input"
import { RadioGroup } from "@/components/arc/radio-group/radio-group"
import { Textarea } from "@/components/arc/textarea/textarea"
import { currentReview, latestReviewerResponse, reviewHasAllResponses, startReviewInputSchema, respondToReviewInputSchema, withdrawReviewInputSchema, type DesignReview, type RequestReviewState, type ReviewActionResult, type ReviewPerson, type StartReviewInput, type RespondToReviewInput, type WithdrawReviewInput } from "@/lib/request-review"
import styles from "./design-review-panel.module.css"

export type DesignReviewPanelProps = {
  initialState: RequestReviewState
  currentUserId: string
  canRequest: boolean
  canManage: boolean
  /** Resolves one reviewer search. The signal aborts it when a newer query replaces it (plan item 1.16). */
  onFindReviewers: (query: string, signal?: AbortSignal) => Promise<{ members: ReviewPerson[] } | { error: string }>
  onRequest: (input: StartReviewInput) => Promise<ReviewActionResult>
  onRespond: (input: RespondToReviewInput) => Promise<ReviewActionResult>
  onWithdraw: (input: WithdrawReviewInput) => Promise<ReviewActionResult>
}

type FormState = { pending: boolean; error: string | null; blocked?: string }
/** Typing pauses this long before reviewers are searched; Enter and the button search at once. */
export const REVIEWER_DEBOUNCE_MS = 150
const decisions = [{ value: "looks_good", label: "Looks good" }, { value: "changes_requested", label: "Changes requested" }]
const decisionLabel = (decision: string) => decision === "looks_good" ? "Looks good" : "Changes requested"
const formatDate = (value: string) => new Date(value).toLocaleString("en-US", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit", timeZone: "UTC" }) + " UTC"

function SaveError({ error }: { error: string | null }) {
  return error ? <Alert tone="danger" title="Could not save review">{error}</Alert> : null
}

function AskForm({ expectedVersion, currentUserId, pending, error, blocked, onFindReviewers, onSave, onCancel }: FormState & Pick<DesignReviewPanelProps, "currentUserId" | "onFindReviewers"> & {
  expectedVersion: number; onSave: (input: StartReviewInput) => void; onCancel: () => void
}) {
  const [designUrl, setDesignUrl] = useState("")
  const [question, setQuestion] = useState("")
  const [query, setQuery] = useState("")
  const [members, setMembers] = useState<ReviewPerson[]>([])
  const [selected, setSelected] = useState<ReviewPerson[]>([])
  const [searching, setSearching] = useState(true)
  const [searchError, setSearchError] = useState<string | null>(null)
  const [errors, setErrors] = useState<Record<string, string>>({})
  const sequence = useRef(0)
  const inflight = useRef<AbortController | null>(null)
  const debounce = useRef(0)
  const lifetime = useRef({ active: true })
  const urlInput = useRef<HTMLInputElement>(null)
  const uid = useId()

  useEffect(() => {
    const alive = lifetime.current
    alive.active = true
    urlInput.current?.focus()
    const id = ++sequence.current
    const controller = new AbortController()
    inflight.current?.abort(); inflight.current = controller
    void onFindReviewers("", controller.signal).then(result => {
      if (!alive.active || sequence.current !== id) return
      if ("error" in result) setSearchError(result.error)
      else setMembers(result.members.filter(member => member.id !== currentUserId))
    }).catch(() => { if (alive.active && sequence.current === id) setSearchError("Members could not be loaded. Try again.") })
      .finally(() => { if (alive.active && sequence.current === id) setSearching(false) })
    return () => { alive.active = false; window.clearTimeout(debounce.current); controller.abort() }
  }, [onFindReviewers, currentUserId])

  async function findMembers(value = query) {
    window.clearTimeout(debounce.current)
    const id = ++sequence.current
    // A newer query replaces an older one in flight instead of waiting for it.
    const controller = new AbortController()
    inflight.current?.abort(); inflight.current = controller
    setSearching(true); setSearchError(null)
    try {
      const result = await onFindReviewers(value.trim(), controller.signal)
      if (!lifetime.current.active || sequence.current !== id) return
      if ("error" in result) setSearchError(result.error)
      else setMembers(result.members.filter(member => member.id !== currentUserId))
    } catch { if (lifetime.current.active && sequence.current === id) setSearchError("Members could not be loaded. Try again.") }
    finally { if (lifetime.current.active && sequence.current === id) setSearching(false) }
  }
  function submit(event: FormEvent) {
    event.preventDefault()
    if (pending || blocked) return
    const parsed = startReviewInputSchema.safeParse({ expectedVersion, designUrl, question, reviewerIds: selected.map(person => person.id) })
    if (!parsed.success) {
      setErrors(Object.fromEntries(parsed.error.issues.map(issue => [String(issue.path[0]), issue.message])))
      return
    }
    setErrors({}); onSave(parsed.data)
  }
  const options = [...new Map([...selected, ...members].map(member => [member.id, member])).values()]
  return <form aria-label="Ask for design review" className={styles.form} onSubmit={submit} noValidate>
    <Input ref={urlInput} label="Design version link" type="url" value={designUrl} onChange={event => setDesignUrl(event.target.value)} readOnly={pending} maxLength={2000} error={errors.designUrl} description="Link to the exact version you want reviewed. This link stays with this round." />
    <Textarea label="What needs feedback?" value={question} onChange={event => setQuestion(event.target.value)} readOnly={pending} rows={3} maxLength={2000} error={errors.question} />
    <fieldset className={styles.reviewers} aria-describedby={`${uid}-selection`}>
      <legend>Reviewers</legend>
      <div className={styles.search}>
        <Input label="Search members" value={query} onChange={event => {
          const value = event.target.value
          setQuery(value)
          window.clearTimeout(debounce.current)
          debounce.current = window.setTimeout(() => { if (lifetime.current.active && !pending) void findMembers(value) }, REVIEWER_DEBOUNCE_MS)
        }} readOnly={pending} onKeyDown={event => { if (event.key === "Enter") { event.preventDefault(); if (!pending) void findMembers() } }} />
        <Button type="button" variant="secondary" loading={searching} disabled={pending} className={styles.action} onClick={() => { void findMembers() }}>Find reviewers</Button>
      </div>
      <p id={`${uid}-selection`} className={styles.hint}>{selected.length} of 10 selected. Choose teammates other than yourself.</p>
      {searchError && <Alert tone="danger" title="Could not find reviewers">{searchError}</Alert>}
      {errors.reviewerIds && <p role="alert" className={styles.error}>{errors.reviewerIds}</p>}
      <div aria-busy={searching} className={styles.memberResults}>
        {options.length ? <ul aria-label="Selected and matching members" className={styles.memberList}>{options.map(person => {
          const checked = selected.some(member => member.id === person.id)
          return <li key={person.id}><Checkbox label={person.name} checked={checked} disabled={pending || (!checked && selected.length >= 10)} onCheckedChange={value => setSelected(previous => value === true ? [...previous, person] : previous.filter(member => member.id !== person.id))} /></li>
        })}</ul> : !searching && !searchError ? <p className={styles.hint}>No matching members. Try another name.</p> : null}
        {searching && <p role="status" className={styles.hint}>Finding reviewers…</p>}
      </div>
    </fieldset>
    <SaveError error={blocked ?? error} />
    <div className={styles.actions}><Button type="submit" loading={pending} disabled={Boolean(blocked)} data-review-primary className={styles.action}>Ask for review</Button><Button type="button" variant="ghost" disabled={pending} className={styles.action} onClick={onCancel}>Cancel</Button></div>
  </form>
}

function ResponseForm({ review, currentUserId, expectedVersion, pending, error, blocked, onSave, onCancel }: FormState & {
  review: DesignReview; currentUserId: string; expectedVersion: number; onSave: (input: RespondToReviewInput) => void; onCancel?: () => void
}) {
  const previous = latestReviewerResponse(review, currentUserId)
  const [decision, setDecision] = useState<RespondToReviewInput["decision"]>(previous?.decision ?? "looks_good")
  const [note, setNote] = useState(previous?.note ?? "")
  const [noteError, setNoteError] = useState<string>()
  function submit(event: FormEvent) {
    event.preventDefault()
    if (pending || blocked) return
    const parsed = respondToReviewInputSchema.safeParse({ expectedVersion, reviewId: review.id, decision, note })
    if (!parsed.success) { setNoteError(parsed.error.issues[0].message); return }
    setNoteError(undefined); onSave(parsed.data)
  }
  return <form aria-label="Respond to design review" className={styles.form} onSubmit={submit} noValidate>
    {blocked && <p className={styles.hint}>Unsent feedback for {review.designUrl}</p>}
    <fieldset disabled={pending} className={styles.fields}><RadioGroup label="Your feedback" options={decisions} value={decision} onValueChange={value => setDecision(value as RespondToReviewInput["decision"])} /></fieldset>
    <Textarea label="Feedback note" description={decision === "changes_requested" ? "Explain the changes you need." : "Optional context for your response."} value={note} onChange={event => setNote(event.target.value)} rows={3} maxLength={5000} readOnly={pending} error={noteError} />
    <SaveError error={blocked ?? error} />
    <div className={styles.actions}><Button type="submit" loading={pending} disabled={Boolean(blocked)} data-review-primary className={styles.action}>{previous ? "Save feedback" : "Send feedback"}</Button>{onCancel && <Button type="button" variant="ghost" disabled={pending} className={styles.action} onClick={onCancel}>Cancel edit</Button>}</div>
  </form>
}

function WithdrawForm({ expectedVersion, reviewId, pending, error, blocked, onSave, onCancel }: FormState & {
  expectedVersion: number; reviewId: string; onSave: (input: WithdrawReviewInput) => void; onCancel: () => void
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
  return <form aria-label="Withdraw design review" className={styles.form} onSubmit={submit} noValidate>
    <Textarea ref={input} label="Reason for withdrawal" description="The reason and all feedback stay in the review history." value={reason} onChange={event => setReason(event.target.value)} rows={3} maxLength={2000} readOnly={pending} error={reasonError} />
    <SaveError error={blocked ?? error} />
    <div className={styles.actions}><Button type="submit" variant="danger" loading={pending} disabled={Boolean(blocked)} className={styles.action}>Confirm withdrawal</Button><Button type="button" variant="ghost" disabled={pending} className={styles.action} onClick={onCancel}>Cancel withdrawal</Button></div>
  </form>
}

function RoundSummary({ review }: { review: DesignReview }) {
  return <div className={styles.round}>
    <div className={styles.roundHeader}><Badge tone={review.withdrawal ? "neutral" : reviewHasAllResponses(review) ? "info" : "neutral"}>{review.withdrawal ? "Withdrawn" : reviewHasAllResponses(review) ? "Feedback received" : "Waiting for feedback"}</Badge><span className={styles.hint}>Asked by {review.requestedBy.name} · <time dateTime={review.requestedAt}>{formatDate(review.requestedAt)}</time></span></div>
    <a className={styles.designLink} href={review.designUrl} target="_blank" rel="noopener noreferrer">Open design version<ExternalLink size={14} aria-hidden="true" /></a>
    <p className={styles.url}>{review.designUrl}</p>
    <p className={styles.question}>{review.question}</p>
    <ul aria-label="Reviewers" className={styles.responses}>{review.reviewers.map(person => {
      const response = latestReviewerResponse(review, person.id)
      return <li key={person.id} className={styles.response}><div className={styles.responseHeader}><span>{person.name}</span><Badge size="sm" tone={response?.decision === "changes_requested" ? "warning" : "neutral"}>{response ? decisionLabel(response.decision) : "Waiting"}</Badge></div>{response?.note && <p>{response.note}</p>}{response && <time className={styles.hint} dateTime={response.createdAt}>{formatDate(response.createdAt)}</time>}</li>
    })}</ul>
    {review.withdrawal && <div className={styles.withdrawal}><p>Withdrawn by {review.withdrawal.by.name} · <time dateTime={review.withdrawal.at}>{formatDate(review.withdrawal.at)}</time></p><p>{review.withdrawal.reason}</p></div>}
    {review.responses.length > 0 && <details className={styles.history}><summary>Response history</summary><ol className={styles.events}>{review.responses.map(response => <li key={response.id}><div className={styles.responseHeader}><span>{review.reviewers.find(person => person.id === response.reviewerId)?.name ?? "Former reviewer"} · {decisionLabel(response.decision)}</span><time className={styles.hint} dateTime={response.createdAt}>{formatDate(response.createdAt)}</time></div>{response.note && <p>{response.note}</p>}</li>)}</ol></details>}
  </div>
}

export function DesignReviewPanel({ initialState, currentUserId, canRequest, canManage, onFindReviewers, onRequest, onRespond, onWithdraw }: DesignReviewPanelProps) {
  const [state, setState] = useState(initialState)
  const [mode, setMode] = useState<"view" | "ask" | "withdraw">("view")
  const [askAfterReviewId, setAskAfterReviewId] = useState<string | null>(null)
  const [withdrawTarget, setWithdrawTarget] = useState<DesignReview | null>(null)
  const [responseTarget, setResponseTarget] = useState<DesignReview | null>(null)
  const [offeredReviewId, setOfferedReviewId] = useState<string | null>(null)
  const [pending, setPending] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [announcement, setAnnouncement] = useState("")
  const inFlight = useRef(false)
  const mounted = useRef(false)
  const heading = useRef<HTMLHeadingElement>(null)
  const uid = useId()
  // A refreshed server snapshot may be newer than a locally returned save.
  // It updates the record while form-local drafts remain mounted and intact.
  if (initialState.version > state.version) setState(initialState)
  useEffect(() => { mounted.current = true; return () => { mounted.current = false } }, [])

  async function save(action: () => Promise<ReviewActionResult>, message: string) {
    if (inFlight.current) return
    inFlight.current = true; setPending(true); setError(null)
    try {
      const result = await action()
      if (!mounted.current) return
      if ("error" in result) { setError(result.error); return }
      setState(previous => result.state.version >= previous.version ? result.state : previous)
      setMode("view"); setResponseTarget(null); setWithdrawTarget(null); setAnnouncement(message)
      requestAnimationFrame(() => heading.current?.focus({ preventScroll: true }))
    } catch { if (mounted.current) setError("The review could not be saved. Your draft is still here. Try again.") }
    finally { inFlight.current = false; if (mounted.current) setPending(false) }
  }
  function cancel() { setMode("view"); setError(null); requestAnimationFrame(() => heading.current?.focus({ preventScroll: true })) }
  const review = currentReview(state)
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

  return <section aria-labelledby={`${uid}-heading`} className={styles.panel}>
    <div className={styles.header}><h2 ref={heading} tabIndex={-1} id={`${uid}-heading`}>Design review</h2>{mayStart && mode !== "ask" && <Button type="button" variant={review ? "secondary" : "primary"} data-review-primary={!review || undefined} disabled={pending} className={styles.action} onClick={() => { setAskAfterReviewId(review?.id ?? null); setMode("ask"); setError(null) }}>Ask for review</Button>}</div>
    <p className={styles.hint}>{review ? "Feedback belongs to this design version. It does not change the Request status." : "Ask named teammates for feedback on a specific design version."}</p>
    {mode === "ask" && <AskForm expectedVersion={state.version} currentUserId={currentUserId} pending={pending} error={error} blocked={staleAsk ? retainMessage : undefined} onFindReviewers={onFindReviewers} onSave={input => { void save(() => onRequest(input), "Review requested.") }} onCancel={cancel} />}
    {review && <section aria-label="Current review" className={styles.current}>
      <RoundSummary review={review} />
      {mode === "view" && responseTarget && <ResponseForm key={`${responseTarget.id}:${currentUserId}`} review={responseTarget} currentUserId={currentUserId} expectedVersion={state.version} pending={pending} error={error} blocked={staleResponse ? retainMessage : undefined} onSave={input => { void save(() => onRespond(input), "Feedback saved.") }} onCancel={() => { setResponseTarget(null); setOfferedReviewId(review.id); setError(null) }} />}
      {mode === "view" && mayRespond && !responseTarget && <Button type="button" variant="secondary" className={styles.action} onClick={() => { setResponseTarget(review); setError(null) }}>{hasResponded ? "Edit your feedback" : "Respond to review"}</Button>}
      {mode === "withdraw" && withdrawTarget && <WithdrawForm expectedVersion={state.version} reviewId={withdrawTarget.id} pending={pending} error={error} blocked={staleWithdrawal ? retainMessage : undefined} onSave={input => { void save(() => onWithdraw(input), "Review withdrawn.") }} onCancel={cancel} />}
      {mode === "view" && mayWithdraw && !responseTarget && <Button type="button" variant="ghost" disabled={pending} className={styles.action} onClick={() => { setWithdrawTarget(review); setMode("withdraw"); setError(null) }}>Withdraw review</Button>}
    </section>}
    {state.reviews.length > 1 && <details className={styles.history}><summary>Review history</summary><div className={styles.pastRounds}>{state.reviews.slice(0, -1).map((past, index) => <section key={past.id} aria-label={`Review round ${index + 1}`}><h3>Round {index + 1}</h3><RoundSummary review={past} /></section>)}</div></details>}
    <p role="status" className={styles.announcement}>{announcement}</p>
  </section>
}
