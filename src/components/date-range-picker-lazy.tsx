"use client"

import dynamic from "next/dynamic"
import { useState, type ComponentType } from "react"
import { Skeleton } from "@/components/arc/skeleton/skeleton"
import type { DateRangePickerProps } from "@/components/arc/date-range-picker/date-range-picker"

export type { DateRange, DateRangePickerProps } from "@/components/arc/date-range-picker/date-range-picker"

type Picker = ComponentType<DateRangePickerProps>

// The calendar (Arc's date-range picker, its month strip and motion) stays out of every route's
// first load. It arrives when a date dialog first opens, or earlier when the pointer or focus
// reaches the control that opens one; from then on it renders synchronously, with no fallback.
let loaded: Picker | null = null
const load = () => import("@/components/arc/date-range-picker/date-range-picker").then(module => (loaded = module.DateRangePicker))

/** Call from the hover and focus of a control that opens a date dialog, so the first open has the calendar ready. */
export function preloadDateRangePicker() {
  void load().catch(() => undefined)
}

const LoadingDateRangePicker = dynamic(load, { loading: () => <Skeleton label="Loading calendar" lines={5} /> })

/** Arc's DateRangePicker, loaded on demand. Props are the Arc component's. */
export function DateRangePicker(props: DateRangePickerProps) {
  // The choice holds for this mount: a picker that opened on the fallback finishes loading in place instead of remounting.
  const [Component] = useState<Picker>(() => loaded ?? LoadingDateRangePicker)
  return <Component {...props} />
}
