"use client"

import type { DateRangePickerProps } from "@/components/arc/date-range-picker/date-range-picker"
import { Placeholder } from "@/components/loading/placeholder";
import { couldNotOpen, popupCode, usePopupCode } from "@/components/popup/lazy-popup"

export type { DateRange, DateRangePickerProps } from "@/components/arc/date-range-picker/date-range-picker"

// The calendar (Arc's date-range picker, its month strip and motion) stays out of every route's
// first load. It arrives when a date dialog first opens, or earlier when the pointer or focus
// reaches the control that opens one; from then on it renders synchronously, with no fallback.
const pickerCode = popupCode(() => import("@/components/arc/date-range-picker/date-range-picker"))

/** Call from the hover and focus of a control that opens a date dialog, so the first open has the calendar ready. */
export const preloadDateRangePicker = pickerCode.preload

/** Arc's DateRangePicker, loaded on demand. Props are the Arc component's. */
export function DateRangePicker(props: DateRangePickerProps) {
  // A calendar that can't load closes its date dialog, as Cancel does, and Lane says so.
  const picker = usePopupCode(pickerCode, true, () => couldNotOpen("calendar", () => props.onCancel?.(), { retry: null }))
  return picker ? <picker.DateRangePicker {...props} /> : <Placeholder label="Loading calendar" lines={5} />
}
