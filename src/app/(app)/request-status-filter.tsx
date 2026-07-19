"use client"

import { usePathname, useRouter, useSearchParams } from "next/navigation"

import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import {
  isRequestStatusFilter,
  type RequestStatusFilter,
} from "@/lib/request-workspace"
import { statusLabel } from "@/lib/request-status"

function filterLabel(filter: RequestStatusFilter) {
  return filter === "all" ? "All statuses" : statusLabel(filter)
}

export function RequestStatusFilter({
  value,
}: {
  value: RequestStatusFilter
}) {
  const pathname = usePathname()
  const router = useRouter()
  const searchParams = useSearchParams()

  function handleValueChange(nextValue: string | null) {
    if (!isRequestStatusFilter(nextValue)) return

    const nextParams = new URLSearchParams(searchParams.toString())
    if (nextValue === "all") {
      nextParams.delete("status")
    } else {
      nextParams.set("status", nextValue)
    }

    const query = nextParams.toString()
    router.replace(query ? `${pathname}?${query}` : pathname, { scroll: false })
  }

  return (
    <Select value={value} onValueChange={handleValueChange}>
      <SelectTrigger
        aria-label="Filter Requests by status"
        size="sm"
        className="w-full sm:w-[156px]"
      >
        <SelectValue>
          {(selectedValue) =>
            filterLabel(
              isRequestStatusFilter(selectedValue) ? selectedValue : "all"
            )
          }
        </SelectValue>
      </SelectTrigger>
      <SelectContent align="start">
        <SelectItem value="all">All statuses</SelectItem>
        <SelectItem value="open">Open</SelectItem>
        <SelectItem value="in_progress">In Progress</SelectItem>
        <SelectItem value="done">Done</SelectItem>
      </SelectContent>
    </Select>
  )
}
