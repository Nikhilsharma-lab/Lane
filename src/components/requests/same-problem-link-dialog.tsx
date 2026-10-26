"use client"
import { useEffect, useMemo, useState } from "react"
import type { WorkspaceSearchRequest } from "@/lib/workspace-search"
import { Button } from "@/components/arc/button/button"
import { Dialog, DialogContent } from "@/components/arc/dialog/dialog"
import { SearchField } from "@/components/arc/search-field/search-field"
import { fetchWorkspaceSearch } from "@/components/shell/workspace-search-fetch"
import { linkCandidates, type LinkCandidate } from "./same-problem-link-model"
import styles from "./same-problem-link-dialog.module.css"

type Found = { kind: "idle" } | { kind: "searching" } | { kind: "found"; results: WorkspaceSearchRequest[] } | { kind: "failed"; message: string }

/**
 * "Link a Request" (#218), loaded only when opened. Finds Requests by code or title through the workspace search
 * (GET /api/search, the same visibility rules), at any status, and links the one chosen as Same problem.
 */
export default function SameProblemLinkDialog({ open, onOpenChange, orgId, requestId, linkedIds, onLink, returnFocus }: {
  /** Where focus goes when the dialog closes: back to "Link a Request". */
  returnFocus: () => void
  open: boolean
  onOpenChange: (open: boolean) => void
  orgId: string
  requestId: string
  /** The Requests already in its group (itself included): never offered. */
  linkedIds: string[]
  /** Links the chosen Request; resolves with the refusal to show, or null when linked (the caller closes the dialog). */
  onLink: (candidate: LinkCandidate) => Promise<string | null>
}) {
  const [query, setQuery] = useState("")
  const [found, setFound] = useState<Found>({ kind: "idle" })
  const [linking, setLinking] = useState<string | null>(null)
  const [error, setError] = useState("")
  const search = useMemo(() => fetchWorkspaceSearch(orgId), [orgId])

  useEffect(() => {
    const text = query.trim()
    if (!text) return
    const controller = new AbortController()
    const timer = window.setTimeout(() => {
      setFound({ kind: "searching" })
      search({ query: text }, controller.signal).then(response => {
        if (controller.signal.aborted) return
        setFound(response.success ? { kind: "found", results: response.requests.items } : { kind: "failed", message: response.error.message })
      }).catch(() => { if (!controller.signal.aborted) setFound({ kind: "failed", message: "Search could not be completed. Try again." }) })
    }, 200)
    return () => { controller.abort(); window.clearTimeout(timer) }
  }, [query, search])

  function change(open: boolean) {
    if (!open) { setQuery(""); setFound({ kind: "idle" }); setError("") }
    onOpenChange(open)
  }

  async function choose(candidate: LinkCandidate) {
    setLinking(candidate.requestId)
    setError("")
    const refused = await onLink(candidate)
    setLinking(null)
    if (refused) setError(refused)
    else change(false)
  }

  const shown: Found = query.trim() ? found : { kind: "idle" }
  const candidates = shown.kind === "found" ? linkCandidates(shown.results, { requestId, linkedIds }) : []
  return <Dialog open={open} onOpenChange={change}>
    <DialogContent onCloseAutoFocus={event => { event.preventDefault(); returnFocus() }} title="Link a Request as Same problem" description="Find another attempt at this problem by its code or title. Linking joins its group, at any status; neither Request changes.">
      <div className={styles.body}>
        <SearchField label="Find a Request" value={query} onValueChange={setQuery} placeholder="LAN-12 or a title" autoFocus />
        {shown.kind === "idle" && <p className={styles.muted}>Type a code or part of a title.</p>}
        {shown.kind === "searching" && <p role="status" className={styles.muted}>Searching…</p>}
        {shown.kind === "failed" && <p role="alert" className={styles.error}>{shown.message}</p>}
        {shown.kind === "found" && (candidates.length === 0
          ? <p role="status" className={styles.muted}>No other Request matches.</p>
          : <ul className={styles.results} aria-label="Matching Requests">
            {candidates.map(candidate => <li key={candidate.requestId} className={styles.result}>
              <span className={styles.name}><span className={styles.code}>{candidate.code}</span> {candidate.title} <span className={styles.muted}>· {candidate.status}</span></span>
              <Button variant="secondary" size="sm" loading={linking === candidate.requestId} disabled={linking !== null} onClick={() => { void choose(candidate) }} aria-label={`Link ${candidate.code} ${candidate.title}`}>Link</Button>
            </li>)}
          </ul>)}
        {error && <p role="alert" className={styles.error}>{error}</p>}
      </div>
    </DialogContent>
  </Dialog>
}
