// Adapted from official shadcn/ui examples/tasks. MIT: docs/licenses/shadcn-ui.txt.
"use client"

import { type ReactTable, type RowData } from "@tanstack/react-table"
import { Settings2 } from "lucide-react"

import { Button } from "@/components/ui/button"
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuLabel,
  DropdownMenuGroup,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"

import { type TasksTableFeatures } from "./data-table-features"

export function DataTableViewOptions<TData extends RowData>({
  table,
}: {
  table: ReactTable<TasksTableFeatures, TData>
}) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger render={<Button
          variant="outline"
          size="sm"
          className="ml-auto hidden h-touch-target sm:h-8 lg:flex"
         />}>
          <Settings2 />
          View
        </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-[150px]">
        <DropdownMenuGroup><DropdownMenuLabel>Toggle columns</DropdownMenuLabel></DropdownMenuGroup>
        <DropdownMenuSeparator />
        {table
          .getAllColumns()
          .filter(
            (column) =>
              typeof column.accessorFn !== "undefined" && column.getCanHide()
          )
          .map((column) => {
            return (
              <DropdownMenuCheckboxItem
                key={({ status: "Status", submittedBy: "Submitted by", pickedUpBy: "Picked up by", createdAt: "Submitted" } as Record<string, string>)[column.id] ?? column.id}
                className="capitalize"
                checked={column.getIsVisible()}
                onCheckedChange={(value) => column.toggleVisibility(!!value)}
              >
                {({ status: "Status", submittedBy: "Submitted by", pickedUpBy: "Picked up by", createdAt: "Submitted" } as Record<string, string>)[column.id] ?? column.id}
              </DropdownMenuCheckboxItem>
            )
          })}
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
