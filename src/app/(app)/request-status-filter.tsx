"use client"

import { usePathname, useRouter, useSearchParams } from "next/navigation"

import { Select } from "@/components/arc/select/select"
import {
  isRequestStatusFilter,
  type RequestStatusFilter,
} from "@/lib/request-workspace"
import { statuses } from "@/components/requests/tasks/statuses"

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

  return <Select label="Status" id="request-status-filter" value={value} onValueChange={handleValueChange} options={[{ value: "all", label: "All statuses" }, ...statuses.map(item => ({ value: item.value, label: item.label }))]} />
}
