"use client"
// Official shadcn examples/tasks page composition. See docs/free-ui-components.md.
import { DataTable } from "@/components/requests/tasks/data-table"
import { columns } from "@/components/requests/tasks/columns"
import type { OverviewRequest } from "@/lib/request-overview"
import type { RequestStatusFilter } from "@/lib/request-workspace"

export function RequestsOverview({ requests, filter, isGuest }: {
  requests: OverviewRequest[]
  filter: RequestStatusFilter
  isGuest: boolean
}) {
  return (
    <main data-slot="requests-workspace" className="flex min-h-0 min-w-0 flex-1 flex-col gap-8 overflow-y-auto bg-background p-4 lg:p-8">
      <div className="flex items-center justify-between gap-2">
        <div className="flex flex-col gap-1">
          <h1 className="text-2xl font-semibold tracking-tight">{isGuest ? "My Requests" : "Requests"}</h1>
          <p className="text-muted-foreground">{isGuest ? "Only Requests you submit appear here." : "Here’s a list of your workspace’s Requests."}</p>
        </div>
      </div>
      <DataTable data={requests} columns={columns} filter={filter} />
      {requests.length === 200 && <p className="text-type-meta text-muted-foreground">Showing the latest 200 Requests.</p>}
    </main>
  )
}
