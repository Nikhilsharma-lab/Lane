"use client"

import { createContext, useContext } from "react"
import type { ContextMenuItem } from "@/components/arc/context-menu/context-menu"
import type { OverviewRequest } from "@/lib/request-overview"

export type RequestPriority = "none" | "urgent" | "high" | "medium" | "low"
export type RequestIdentity = { code: string; priority: RequestPriority }

/** Optional presentation boundary. The Linear review supplies fixture identities
 * and in-memory actions; production has no synthetic codes or saved priorities. */
export const RequestRowPresentation = createContext<{
  identities: Record<string, RequestIdentity>
  menuItems: (request: OverviewRequest) => ContextMenuItem[]
} | null>(null)
export const useRequestRowPresentation = () => useContext(RequestRowPresentation)

export function PriorityGlyph({ priority }: { priority: RequestPriority }) {
  if (priority === "urgent") return <svg width="16" height="16" viewBox="0 0 16 16" aria-hidden="true"><rect x="1" y="1" width="14" height="14" rx="3" fill="currentColor" /><path d="M8 4v5m0 2v1" stroke="var(--surface)" strokeWidth="1.6" /></svg>
  if (priority === "none") return <svg width="16" height="16" viewBox="0 0 16 16" aria-hidden="true"><path d="M2 8h2m3 0h2m3 0h2" stroke="currentColor" strokeWidth="1.5" /></svg>
  const level = { low: 1, medium: 2, high: 3 }[priority]
  return <svg width="16" height="16" viewBox="0 0 16 16" aria-hidden="true">{[0, 1, 2].map(index => <rect key={index} x={1.5 + index * 5} y={8 - index * 3} width="3" height={6 + index * 3} rx="1" fill="currentColor" opacity={index < level ? 1 : .4} />)}</svg>
}

export function StatusGlyph({ status }: { status: OverviewRequest["status"] }) {
  return <svg width="16" height="16" viewBox="0 0 16 16" aria-hidden="true">
    <circle cx="8" cy="8" r="6" stroke="currentColor" strokeWidth="1.5" fill={status === "done" ? "currentColor" : "none"} />
    {status === "in_progress" && <path d="M8 4a4 4 0 0 1 0 8Z" fill="currentColor" />}
    {status === "done" && <path d="m5 8 2 2 4-4" fill="none" stroke="var(--surface)" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />}
  </svg>
}
