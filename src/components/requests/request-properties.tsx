"use client"

import { CalendarDays, Folder, Tag, UserRound } from "lucide-react"
import Link from "next/link"
import { Badge } from "@/components/arc/badge/badge"
import { Avatar } from "@/components/arc/avatar/avatar"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/arc/popover/popover"
import type { OverviewRequest } from "@/lib/request-overview"
import { REQUEST_TYPE_LABELS } from "@/lib/request-properties"
import { statuses } from "./tasks/statuses"
import { projectToneForId } from "@/lib/project-tone"
import dotStyles from "@/components/projects/project-dot.module.css"
import styles from "./request-rows.module.css"
import avatarStyles from "./request-picker-avatar.module.css"
import buttonStyles from "@/components/arc/button/button.module.css"
import { requestListHref, type RequestStatusFilter } from "@/lib/request-workspace"
import { useRequestListView } from "./list-view-state"
import { useRequestRowPresentation } from "./row-presentation"

export type RequestPropertyKey = "status" | "project" | "pickedUpBy" | "createdAt" | "requestType" | "submittedBy"

/** Read-only saved properties. Lifecycle actions remain in Request detail. */
export function RequestProperty({ request, property, filter = "all" }: { request: OverviewRequest; property: RequestPropertyKey; filter?: RequestStatusFilter }) {
  const compact = Boolean(useRequestRowPresentation())
  const [, setListView] = useRequestListView()
  const status = statuses.find(item => item.value === request.status)!
  const date = new Date(request.createdAt)
  const pickerName = request.assignedTo ? request.assigneeName?.trim() || "Unknown member" : "Unassigned"
  const properties = {
    status: { label: "Status", value: status.label, icon: <status.icon size={12} />, tone: status.tone },
    project: { label: "Project", value: request.projectName ?? (request.projectId ? "Unavailable Project" : "No Project"), icon: request.projectId ? <span className={dotStyles.dot} data-tone={projectToneForId(request.projectId)} aria-hidden="true" /> : <Folder size={12} />, tone: "neutral" as const },
    pickedUpBy: { label: "Owner", value: pickerName, icon: <UserRound size={12} />, tone: "neutral" as const },
    createdAt: { label: "Submitted", value: date.toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" }), icon: <CalendarDays size={12} />, tone: "neutral" as const },
    requestType: { label: "Request type", value: request.requestType ? REQUEST_TYPE_LABELS[request.requestType] : "No type", icon: compact && request.requestType ? <span className={styles.typeDot} data-type={request.requestType} aria-hidden="true" /> : <Tag size={12} />, tone: "neutral" as const },
    submittedBy: { label: "Submitted by", value: request.creatorName ?? "Unknown member", icon: <UserRound size={12} />, tone: "neutral" as const },
  }
  const item = properties[property]
  return <Popover>
    <PopoverTrigger asChild><button type="button" data-property={property} className={[styles.propertyTrigger, property === "pickedUpBy" && avatarStyles.trigger].filter(Boolean).join(" ")} aria-label={`${item.label}: ${item.value}`}>
      {compact && property === "createdAt" ? <time className={styles.submittedDate} dateTime={request.createdAt}>{date.toLocaleDateString("en-GB", { day: "numeric", month: "short", timeZone: "UTC" })}</time>
        : property === "pickedUpBy" ? request.assignedTo
        ? <Avatar name={pickerName} src={request.assigneeAvatarUrl ?? undefined} unoptimized size="sm" className={avatarStyles.avatar} data-avatar-tone={compact ? projectToneForId(request.assignedTo) : undefined} aria-hidden="true" />
        : <span className={avatarStyles.unassigned} aria-hidden="true"><UserRound size={12} /></span>
        : <Badge size="sm" tone={item.tone} icon={item.icon} className={styles.propertyBadge}><span className={styles.propertyValue}>{item.value}</span></Badge>}
    </button></PopoverTrigger>
    <PopoverContent aria-label={item.label}>
      <div className={styles.propertyDetail}>
        <p className={styles.propertyLabel}>{item.label}</p>
        {property === "createdAt" ? <time dateTime={request.createdAt}>{date.toUTCString()}</time> : <p>{item.value}</p>}
        {property === "project" && <Link href={requestListHref(filter, request.projectId ?? "none")} className={`${buttonStyles.button} ${buttonStyles.secondary} ${buttonStyles.sm}`} onClick={event => {
          if (event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return
          setListView(current => ({ ...current, pagination: { ...current.pagination, pageIndex: 0 } }))
        }}>{request.projectId ? "View Project Requests" : "View Requests without a Project"}</Link>}
      </div>
    </PopoverContent>
  </Popover>
}
