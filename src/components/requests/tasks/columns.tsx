"use client"
// Official Tasks columns composition, with Lane fields and existing detail links.
import Link from "next/link"
import { createColumnHelper } from "@tanstack/react-table"
import type { OverviewRequest } from "@/lib/request-overview"
import { requestDetailHref, type RequestStatusFilter } from "@/lib/request-workspace"
import { relativeTime } from "@/lib/relative-time"
import { DataTableColumnHeader } from "./data-table-column-header"
import type { TasksTableFeatures } from "./data-table-features"
import { statuses } from "./statuses"

const columnHelper = createColumnHelper<TasksTableFeatures, OverviewRequest>()
export const columns = columnHelper.columns([
  columnHelper.accessor(row => row.reframedProblem ?? row.title, {
    id: "title",
    header: ({ column }) => <DataTableColumnHeader column={column} title="Request" />,
    enableHiding: false,
    cell: ({ row, table }) => {
      const status = (table.getColumn("status")?.getFilterValue() as string[] | undefined)?.[0] ?? "all"
      return <Link id={`request-${row.original.id}`} href={requestDetailHref(row.original.id, status as RequestStatusFilter)} className="block min-w-[220px] max-w-[500px] truncate font-medium underline-offset-4 hover:underline focus-visible:rounded-sm focus-visible:outline-2 focus-visible:outline-ring" title={row.original.reframedProblem ?? row.original.title}>{row.getValue("title")}</Link>
    },
  }),
  columnHelper.accessor("status", {
    header: ({ column }) => <DataTableColumnHeader column={column} title="Status" />,
    cell: ({ row }) => {
      const status = statuses.find(status => status.value === row.getValue("status"))!
      return <div className="flex w-[110px] items-center gap-2"><status.icon aria-hidden="true" className="size-4 text-muted-foreground" /><span>{status.label}</span></div>
    },
    filterFn: (row, id, value) => value.includes(row.getValue(id)),
  }),
  columnHelper.accessor("creatorName", {
    id: "submittedBy",
    header: ({ column }) => <DataTableColumnHeader column={column} title="Submitted by" />,
    cell: ({ row }) => <span className="whitespace-nowrap">{row.original.creatorName ?? "Unknown member"}</span>,
  }),
  columnHelper.accessor("assigneeName", {
    id: "pickedUpBy",
    header: ({ column }) => <DataTableColumnHeader column={column} title="Picked up by" />,
    cell: ({ row }) => <span className="whitespace-nowrap">{row.original.assigneeName ?? "Not picked up"}</span>,
  }),
  columnHelper.accessor("createdAt", {
    header: ({ column }) => <DataTableColumnHeader column={column} title="Submitted" />,
    cell: ({ row }) => <time dateTime={row.original.createdAt} title={new Date(row.original.createdAt).toUTCString()} className="whitespace-nowrap">{relativeTime(new Date(row.original.createdAt))}</time>,
  }),
])
