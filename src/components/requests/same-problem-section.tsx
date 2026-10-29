"use client"
import dynamic from "next/dynamic"
import { useCallback, useEffect, useRef, useState } from "react"
import { callAction } from "@/lib/action-call"
import { thrownMessage } from "@/lib/failure-messages"
import { linkSameProblem, readSameProblem, removeSameProblemLink } from "@/app/(app)/requests/[id]/same-problem-actions"
import { formatRequestCode } from "@/lib/request-code"
import { ITERATIONS_SECTION_ID } from "@/lib/same-problem-rules"
import type { LinkCandidate } from "./same-problem-link-model"
import type { SameProblemState } from "./same-problem-view"
import styles from "./same-problem.module.css"
import { Placeholder } from "@/components/loading/placeholder";

/** What shows while the list's code or its read is on the way. */
function Loading() {
  return <section id={ITERATIONS_SECTION_ID} aria-labelledby="iterations-heading" className={styles.section}>
    <div className={styles.header}><h2 id="iterations-heading" className={styles.heading}>Iterations of this problem</h2></div>
    <Placeholder label="Loading Iterations" lines={2} />
  </section>
}

// The list loads after the page and the search dialog only when someone opens it, so the Request page's first load
// carries just this adapter. #259: the list and its load ahead share one import, so they share one chunk (an import
// written inside dynamic() gets a chunk of its own, which loading ahead would not warm).
const loadView = () => import("./same-problem-view")
const SameProblemView = dynamic(() => loadView().then(module => module.SameProblemView), { ssr: false, loading: Loading })
const SameProblemLinkDialog = dynamic(() => import("./same-problem-link-dialog"), { ssr: false })
/** #259: the list's code, loaded ahead with the Request preview's (preloadRequestPeek), so a preview opened after a rest
 * on its row fetches no code. */
export const preloadSameProblemView = () => { void loadView().catch(() => undefined) }

const LOAD_FAILED = "Could not load the Iterations. Try again."
const CHANGE_FAILED = "Could not change the link. Try again."

/** The section's state from the read, or null when there is nothing to show this reader (a guest). Never throws. */
async function readView(requestId: string, orgId: string): Promise<SameProblemState | null> {
  try {
    const view = await callAction(() => readSameProblem(requestId, { orgId }))
    if ("error" in view) return { kind: "error", message: LOAD_FAILED }
    return view.shown ? { kind: "ready", iterations: view.iterations, history: view.history, canChange: view.canChange } : null
  } catch {
    return { kind: "error", message: LOAD_FAILED }
  }
}

/**
 * "Iterations of this problem" on Request detail (#218): reads the group and its history, and lets Admins and Members
 * link and remove. Not rendered for a guest, who sees no links (the server refuses them too).
 */
export function SameProblemSection({ requestId, requestNumber, orgId }: { requestId: string; requestNumber: number; orgId: string }) {
  const [state, setState] = useState<SameProblemState>({ kind: "loading" })
  const [hidden, setHidden] = useState(false)
  const [linkOpen, setLinkOpen] = useState(false)
  // Mounted on first open and kept, so closing animates and returns focus to "Link a Request".
  const [linkMounted, setLinkMounted] = useState(false)
  const [removing, setRemoving] = useState<string | null>(null)
  const [actionError, setActionError] = useState("")
  const [announcement, setAnnouncement] = useState("")
  const heading = useRef<HTMLHeadingElement>(null)
  const linkButton = useRef<HTMLButtonElement>(null)
  const generation = useRef(0)

  const show = useCallback((next: SameProblemState | null) => {
    if (next) setState(next)
    else setHidden(true)
  }, [])
  // Only the latest read counts: a later load (or leaving the page) makes an earlier answer stale.
  const load = useCallback(async () => {
    const current = ++generation.current
    const next = await readView(requestId, orgId)
    if (current === generation.current) show(next)
  }, [requestId, orgId, show])

  useEffect(() => {
    let active = true
    const current = ++generation.current
    readView(requestId, orgId).then(next => { if (active && current === generation.current) show(next) })
    return () => { active = false }
  }, [requestId, orgId, show])

  async function link(candidate: LinkCandidate): Promise<string | null> {
    try {
      const result = await callAction(() => linkSameProblem({ requestId, otherRequestId: candidate.requestId }, { orgId }))
      if ("error" in result) return result.error
    } catch (thrown) {
      return thrownMessage(thrown, CHANGE_FAILED)
    }
    setActionError("")
    setAnnouncement(`${candidate.code} linked as Same problem.`)
    await load()
    return null
  }

  async function remove(entry: { requestId: string; requestNumber: number }) {
    setRemoving(entry.requestId)
    setActionError("")
    try {
      const result = await callAction(() => removeSameProblemLink({ requestId: entry.requestId }, { orgId }))
      if ("error" in result) { setActionError(result.error); return }
      setAnnouncement(`${formatRequestCode(entry.requestNumber)} taken out of this group.`)
      await load()
      // The removed row is gone, so focus returns to the section's heading.
      heading.current?.focus()
    } catch (thrown) {
      setActionError(thrownMessage(thrown, CHANGE_FAILED))
    } finally {
      setRemoving(null)
    }
  }

  if (hidden) return null
  const linkedIds = state.kind === "ready" ? state.iterations?.iterations.map(entry => entry.requestId) ?? [] : []
  return <>
    <SameProblemView requestNumber={requestNumber} state={state} onOpenLink={() => { setLinkMounted(true); setLinkOpen(true) }} onRemove={entry => { void remove(entry) }}
      onRetry={() => { setState({ kind: "loading" }); void load() }} removing={removing} actionError={actionError} announcement={announcement} headingRef={heading} linkButtonRef={linkButton} />
    {linkMounted && <SameProblemLinkDialog open={linkOpen} onOpenChange={setLinkOpen} orgId={orgId} requestId={requestId} linkedIds={linkedIds} onLink={link} returnFocus={() => linkButton.current?.focus()} />}
  </>
}
