// Adapted from official shadcn/ui examples/tasks. MIT: docs/licenses/shadcn-ui.txt.
"use client"

import { type ReactTable, type RowData } from "@tanstack/react-table"
import { X } from "lucide-react"

import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { DataTableViewOptions } from "./data-table-view-options"

import { statuses } from "./statuses"
import Link from "next/link"
import { DataTableFacetedFilter } from "./data-table-faceted-filter"
import { type TasksTableFeatures } from "./data-table-features"

interface DataTableToolbarProps<TData extends RowData> {
  table: ReactTable<TasksTableFeatures, TData>
}

export function DataTableToolbar<TData extends RowData>({
  table,
}: DataTableToolbarProps<TData>) {
  const isFiltered = table.state.columnFilters.length > 0

  return (
    <div className="flex flex-wrap items-center justify-between gap-2">
      <div className="flex flex-wrap items-center gap-2">
        <Input
          aria-label="Filter Requests"
          placeholder="Filter Requests..."
          value={(table.getColumn("title")?.getFilterValue() as string) ?? ""}
          onChange={(event) =>
            table.getColumn("title")?.setFilterValue(event.target.value)
          }
          className="h-touch-target w-[150px] sm:h-8 lg:w-[250px]"
        />
        {table.getColumn("status") && (
          <DataTableFacetedFilter
            column={table.getColumn("status")}
            title="Status"
            options={statuses}
          />
        )}
        {isFiltered && (
          <Button
            variant="ghost"
            size="sm"
            className="h-touch-target sm:h-8"
            onClick={() => table.resetColumnFilters(true)}
          >
            Reset
            <X />
          </Button>
        )}
      </div>
      <div className="flex items-center gap-2">
        <DataTableViewOptions table={table} />
        <Button className="h-touch-target sm:h-8" nativeButton={false} size="sm" render={<Link href="/intake" />}>New Request</Button>
      </div>
    </div>
  )
}
