"use client"

import Link from "next/link"
import type { ReactNode } from "react"
import type { OverviewRequest } from "@/lib/request-overview"
import { requestDetailHref, type RequestProjectFilter, type RequestStatusFilter } from "@/lib/request-workspace"
import { RequestProperty } from "../request-properties"
import styles from "../request-rows.module.css"

export type RequestColumn = { key: string; label: string; value: (row: OverviewRequest) => string; render: (row: OverviewRequest, filter: RequestStatusFilter, projectFilter?: RequestProjectFilter) => ReactNode }
export const columns: RequestColumn[] = [
  { key: "title", label: "Request", value: row => row.reframedProblem ?? row.title, render: (row, filter, projectFilter) => <Link id={`request-${row.id}`} href={requestDetailHref(row.id, filter, projectFilter)} title={row.reframedProblem ?? row.title} className={styles.title}>{row.reframedProblem ?? row.title}</Link> },
  { key: "status", label: "Status", value: row => row.status, render: row => <RequestProperty request={row} property="status" /> },
  { key: "project", label: "Project", value: row => row.projectName ?? "", render: (row, filter) => <RequestProperty request={row} property="project" filter={filter} /> },
  { key: "pickedUpBy", label: "Owner", value: row => row.assigneeName ?? "", render: row => <RequestProperty request={row} property="pickedUpBy" /> },
  { key: "createdAt", label: "Submitted", value: row => row.createdAt, render: row => <RequestProperty request={row} property="createdAt" /> },
  { key: "requestType", label: "Request type", value: row => row.requestType ?? "", render: row => <RequestProperty request={row} property="requestType" /> },
  { key: "submittedBy", label: "Submitted by", value: row => row.creatorName ?? "", render: row => <RequestProperty request={row} property="submittedBy" /> },
]
