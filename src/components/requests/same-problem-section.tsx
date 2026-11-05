"use client"
import dynamic from "next/dynamic"
import { createContext, useCallback, useContext, useEffect, useRef, useState } from "react"
import { afterPageLoad } from "@/lib/after-page-load"
import { callAction } from "@/lib/action-call"
import { thrownMessage } from "@/lib/failure-messages"
import { couldNotOpen, popupCode, usePopupCode } from "@/components/popup/lazy-popup"
import { linkSameProblem, readSameProblem, removeSameProblemLink } from "@/app/(app)/requests/[id]/same-problem-actions"
import { formatRequestCode } from "@/lib/request-code"
import { IterationsPlaceholder } from "./same-problem-placeholder"
import type { LinkCandidate } from "./same-problem-link-model"
import type { SameProblemState } from "./same-problem-view"

/** Whether this reader may link Requests (Admins and Members), known before the read: the loading state holds room for it. */
const CanLink = createContext(true)
/** What shows while the list's code is on the way. */
function Loading() {
  return <IterationsPlaceholder canLink={useContext(CanLink)} />
}

// The list loads after the page and the search dialog only when someone opens it, so the Request page's first load
// carries just this adapter. #259: the list and its load ahead share one import, so they share one chunk (an import
// written inside dynamic() gets a chunk of its own, which loading ahead would not warm).
let viewHere = false
const loadView = () => import("./same-problem-view").then(module => { viewHere = true; return module })
const SameProblemView = dynamic(() => loadView().then(module => module.SameProblemView), { ssr: false, loading: Loading })
/** Build 3: the list's code is fetched once the page has loaded and is idle (src/lib/after-page-load.ts), as Build 2's
 * lazy parts are. Fetched during hydration it held `load` back on a phone, and the loads ahead after it. Its read
 * waits behind the journey's (Next sends server reads one at a time), so the code is here before the list has
 * anything to show. Already here (the preview loads it ahead), it renders at once. It renders only once its code is
 * here, so a fetch that fails (offline, an old tab after a deploy) never throws the page out to the error screen:
 * the placeholder stays, and the fetch is tried again when the browser is back online or the tab is used again. */
function useViewCode() {
  const [ready, setReady] = useState(viewHere)
  useEffect(() => {
    if (ready) return
    let live = true
    const retry = () => { removeEventListener("online", retry); removeEventListener("focus", retry); fetchCode() }
    const fetchCode = () => {
      loadView().then(() => { if (live) setReady(true) }, () => {
        if (live) { addEventListener("online", retry); addEventListener("focus", retry) }
      })
    }
    const cancel = afterPageLoad(fetchCode)
    return () => { live = false; cancel(); removeEventListener("online", retry); removeEventListener("focus", retry) }
  }, [ready])
  return ready
}
// The link dialog loads when it first opens; if it can't, Lane says so instead of a blank popup.
const linkDialogCode = popupCode(() => import("./same-problem-link-dialog"))
/** #259: the list's code, loaded ahead with the Request preview's (preloadRequestPeek), so a preview opened after a rest
 * on its row fetches no code. */
export const preloadSameProblemView = () => { void loadView().catch(() => undefined) }

const LOAD_FAILED = "Couldn’t load the Iterations. Try again."
const CHANGE_FAILED = "Couldn’t change the link. Try again."

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
export function SameProblemSection({ requestId, requestNumber, orgId, canLink }: { requestId: string; requestNumber: number; orgId: string; canLink: boolean }) {
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

  const linkDialog = usePopupCode(linkDialogCode, linkOpen, () => couldNotOpen("same-problem-link", setLinkOpen))
  const viewCode = useViewCode()
  if (hidden) return null
  const linkedIds = state.kind === "ready" ? state.iterations?.iterations.map(entry => entry.requestId) ?? [] : []
  return <CanLink value={canLink}>
    {!viewCode ? <Loading /> : <SameProblemView requestNumber={requestNumber} canLink={canLink} state={state} onOpenLink={() => { setLinkMounted(true); setLinkOpen(true) }} onRemove={entry => { void remove(entry) }}
      onRetry={() => { setState({ kind: "loading" }); void load() }} removing={removing} actionError={actionError} announcement={announcement} headingRef={heading} linkButtonRef={linkButton} />}
    {linkMounted && linkDialog && <linkDialog.default open={linkOpen} onOpenChange={setLinkOpen} orgId={orgId} requestId={requestId} linkedIds={linkedIds} onLink={link} returnFocus={() => linkButton.current?.focus()} />}
  </CanLink>
}
