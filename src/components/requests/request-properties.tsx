"use client"

import { CalendarDays, UserRound } from "lucide-react"
import Link from "next/link"
import { Badge } from "@/components/arc/badge/badge"
import { Avatar } from "@/components/arc/avatar/avatar"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/arc/popover/popover"
import { rowJourney, type OverviewRequest } from "@/lib/request-overview"
import { RequestLabels, useRequestLabels } from "./request-labels"
import { statusOfJourney } from "./tasks/statuses"
import { projectToneForId } from "@/lib/project-tone"
import { ProjectMarker } from "@/components/projects/project-marker"
import styles from "./request-rows.module.css"
import avatarStyles from "./request-picker-avatar.module.css"
import buttonStyles from "@/components/arc/button/button.module.css"
import { requestListHref } from "@/lib/request-workspace"
import { useRequestListContext, useSetRequestListView } from "./list-view-state"
import { useRequestRowPresentation } from "./row-presentation"
import { LocalTime, localDayLabel, useInBrowser, utcDayLabel } from "./local-time"

export type RequestPropertyKey = "status" | "project" | "pickedUpBy" | "createdAt" | "requestType" | "submittedBy"

/** The open Project's Requests, in the list's current status view. Read when the popover opens, so a view change
 * never re-renders the rows (#296). */
function ProjectRequestsLink({ projectId }: { projectId?: string | null }) {
  const { status } = useRequestListContext()
  const setListView = useSetRequestListView()
  return <Link href={requestListHref(status, projectId ?? "none")} className={`${buttonStyles.button} ${buttonStyles.secondary} ${buttonStyles.sm}`} onClick={event => {
    if (event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return
    setListView(current => ({ ...current, pagination: { ...current.pagination, pageIndex: 0 } }))
  }}>{projectId ? "View Project Requests" : "View Requests without a Project"}</Link>
}

/** Read-only saved properties. Lifecycle actions remain in Request detail. */
export function RequestProperty({ request, property, tabIndex }: { request: OverviewRequest; property: RequestPropertyKey;
  /** Plan item 2.4: -1 inside a Request row, whose row is the one tab stop. Standalone triggers keep the Tab order. */
  tabIndex?: number }) {
  const labels = useRequestLabels(request)
  const compact = Boolean(useRequestRowPresentation())
  const journey = rowJourney(request)
  const status = statusOfJourney(journey)
  // The viewer's day once in the browser; the server and the hydrating render share the zone-free label (critique 2.4).
  // Only the Submitted cell names it: every cell of every row renders on a view change (#296).
  const live = useInBrowser()
  const submitted = property !== "createdAt" ? "" : live ? localDayLabel(request.createdAt) : utcDayLabel(request.createdAt)
  const pickerName = request.assignedTo ? request.assigneeName?.trim() || "Unknown member" : "Unassigned"
  const properties = {
    status: { label: "Status", value: status.label, icon: <status.icon data-icon-size="xs" />, tone: status.tone },
    project: { label: "Project", value: request.projectName ?? (request.projectId ? "Unavailable Project" : "No Project"), icon: <ProjectMarker projectId={request.projectId} />, tone: "neutral" as const },
    pickedUpBy: { label: "Assignee", value: pickerName, icon: <UserRound data-icon-size="xs" />, tone: "neutral" as const },
    createdAt: { label: "Submitted", value: submitted, icon: <CalendarDays data-icon-size="xs" />, tone: "neutral" as const },
    requestType: { label: "Labels", value: labels.map(label => label.name).join(", ") || "No labels", icon: null, tone: "neutral" as const },
    submittedBy: { label: "Submitted by", value: request.creatorName ?? "Unknown member", icon: <UserRound data-icon-size="xs" />, tone: "neutral" as const },
  }
  const item = properties[property]
  return <Popover>
    <PopoverTrigger asChild><button type="button" tabIndex={tabIndex} data-property={property} className={[styles.propertyTrigger, property === "pickedUpBy" && avatarStyles.trigger].filter(Boolean).join(" ")} aria-label={`${item.label}: ${item.value}`}>
      {property === "requestType" ? <RequestLabels request={request} compact /> : compact && property === "createdAt" ? <LocalTime className={styles.submittedDate} iso={request.createdAt} day year={false} />
        : property === "pickedUpBy" ? request.assignedTo
        ? <Avatar name={pickerName} src={request.assigneeAvatarUrl ?? undefined} unoptimized size="sm" className={avatarStyles.avatar} data-avatar-tone={compact ? projectToneForId(request.assignedTo) : undefined} aria-hidden="true" />
        : <span className={avatarStyles.unassigned} aria-hidden="true"><UserRound data-icon-size="xs" /></span>
        : <Badge size="sm" tone={item.tone} icon={item.icon} className={styles.propertyBadge}><span className={styles.propertyValue}>{item.value}</span></Badge>}
    </button></PopoverTrigger>
    <PopoverContent aria-label={item.label}>
      <div className={styles.propertyDetail}>
        <p className={styles.propertyLabel}>{item.label}</p>
        {property === "createdAt" ? <LocalTime iso={request.createdAt} /> : <p>{item.value}</p>}
        {property === "project" && <ProjectRequestsLink projectId={request.projectId} />}
      </div>
    </PopoverContent>
  </Popover>
}
