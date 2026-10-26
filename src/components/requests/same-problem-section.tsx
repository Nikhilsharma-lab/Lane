"use client"
import dynamic from "next/dynamic"
import { useCallback, useEffect, useRef, useState } from "react"
import { callAction } from "@/lib/action-call"
import { linkSameProblem, readSameProblem, removeSameProblemLink } from "@/app/(app)/requests/[id]/same-problem-actions"
import { formatRequestCode } from "@/lib/request-code"
import type { LinkCandidate } from "./same-problem-link-model"
import { SameProblemView, type SameProblemState } from "./same-problem-view"

// The search dialog loads only when someone opens it, so the Request page carries just the list.
const SameProblemLinkDialog = dynamic(() => import("./same-problem-link-dialog"), { ssr: false })

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
    } catch {
      return CHANGE_FAILED
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
    } catch {
      setActionError(CHANGE_FAILED)
    } finally {
      setRemoving(null)
    }
  }

  if (hidden) return null
  const linkedIds = state.kind === "ready" ? state.iterations?.iterations.map(entry => entry.requestId) ?? [] : []
  return <>
    <SameProblemView requestNumber={requestNumber} state={state} onOpenLink={() => { setLinkMounted(true); setLinkOpen(true) }} onRemove={entry => { void remove(entry) }}
      onRetry={() => { setState({ kind: "loading" }); void load() }} removing={removing} actionError={actionError} announcement={announcement} headingRef={heading} />
    {linkMounted && <SameProblemLinkDialog open={linkOpen} onOpenChange={setLinkOpen} orgId={orgId} requestId={requestId} linkedIds={linkedIds} onLink={link} />}
  </>
}
