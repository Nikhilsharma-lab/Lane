// Adapted from official shadcn/ui examples/tasks. MIT: docs/licenses/shadcn-ui.txt.
"use client"

import { RequestWorkspaceKeyboard } from "@/app/(app)/request-workspace-keyboard"
import { requestListHref, type RequestStatusFilter } from "@/lib/request-workspace"
import * as React from "react"
import { useRouter } from "next/navigation"
import {
  useTable,
  type ColumnDef,
  type ColumnFiltersState,
  type ColumnVisibilityState,
  type RowData,
  type SortingState,
} from "@tanstack/react-table"

import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"

import { features, type TasksTableFeatures } from "./data-table-features"
import { DataTablePagination } from "./data-table-pagination"
import { DataTableToolbar } from "./data-table-toolbar"

interface DataTableProps<TData extends RowData> {
  columns: ColumnDef<TasksTableFeatures, TData>[]
  data: TData[]
  filter: RequestStatusFilter
}

export function DataTable<TData extends RowData>({
  columns,
  data,
  filter,
}: DataTableProps<TData>) {
  const router = useRouter()
  const [rowSelection, setRowSelection] = React.useState({})
  const [columnVisibility, setColumnVisibility] =
    React.useState<ColumnVisibilityState>({})
  const [localFilters, setLocalFilters] = React.useState<ColumnFiltersState>([])
  const columnFilters = React.useMemo<ColumnFiltersState>(() => [
    ...localFilters,
    ...(filter === "all" ? [] : [{ id: "status", value: [filter] }]),
  ], [localFilters, filter])
  const [sorting, setSorting] = React.useState<SortingState>([])

  const table = useTable({
    features,
    data,
    columns,
    state: {
      sorting,
      columnVisibility,
      rowSelection,
      columnFilters,
    },
    initialState: {
      pagination: {
        pageIndex: 0,
        pageSize: 25,
      },
    },
    enableRowSelection: false,
    getRowId: (row) => (row as { id: string }).id,
    onRowSelectionChange: setRowSelection,
    onSortingChange: setSorting,
    onColumnFiltersChange: (updater) => {
      const next = typeof updater === "function" ? updater(columnFilters) : updater
      setLocalFilters(next.filter(item => item.id !== "status"))
      const status = (next.find(item => item.id === "status")?.value as RequestStatusFilter[] | undefined)?.[0] ?? "all"
      if (status !== filter) router.replace(requestListHref(status), { scroll: false })
    },
    onColumnVisibilityChange: setColumnVisibility,
  })

  return (
    <div className="flex flex-col gap-4">
      <RequestWorkspaceKeyboard returnHref={requestListHref(filter)} onRestoreRequest={id => {
        const index = table.getPrePaginatedRowModel().rows.findIndex(row => row.id === id)
        if (index >= 0) table.setPageIndex(Math.floor(index / table.state.pagination.pageSize))
      }} />
      <DataTableToolbar table={table} />
      <div className="overflow-hidden rounded-md border">
        <Table aria-label="Requests">
          <TableHeader>
            {table.getHeaderGroups().map((headerGroup) => (
              <TableRow key={headerGroup.id}>
                {headerGroup.headers.map((header) => {
                  return (
                    <TableHead key={header.id} colSpan={header.colSpan}>
                      {header.isPlaceholder ? null : (
                        <table.FlexRender header={header} />
                      )}
                    </TableHead>
                  )
                })}
              </TableRow>
            ))}
          </TableHeader>
          <TableBody>
            {table.getRowModel().rows?.length ? (
              table.getRowModel().rows.map((row) => (
                <TableRow
                  key={row.id}
                  data-state={row.getIsSelected() && "selected"}
                >
                  {row.getVisibleCells().map((cell) => (
                    <TableCell key={cell.id}>
                      <table.FlexRender cell={cell} />
                    </TableCell>
                  ))}
                </TableRow>
              ))
            ) : (
              <TableRow>
                <TableCell
                  colSpan={columns.length}
                  className="h-24 text-center"
                >
                  No matching Requests.
                  <button type="button" className="ml-2 underline underline-offset-4" onClick={() => table.resetColumnFilters(true)}>Show all Requests</button>
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </div>
      <DataTablePagination table={table} />
    </div>
  )
}
