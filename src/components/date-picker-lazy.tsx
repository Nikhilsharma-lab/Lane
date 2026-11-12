"use client"

import type { DatePickerProps } from "@/components/arc/date-picker/date-picker"
import { Placeholder } from "@/components/loading/placeholder"
import { couldNotOpen, popupCode, usePopupCode } from "@/components/popup/lazy-popup"

// Arc's date picker and its calendar arrive on their own, after the form that holds them (#277), so the loaders that
// pages ship for their popups name one chunk fewer per form. The form fetches it as its own code arrives.
const pickerCode = popupCode(() => import("@/components/arc/date-picker/date-picker"))

/** Call when a form that holds a date picker loads, so the picker is there by the time the form shows. */
export const preloadDatePicker = pickerCode.preload

/** Arc's DatePicker, loaded on demand. Props are the Arc component's. */
export function DatePicker(props: DatePickerProps) {
  // A picker that can't load says so; the form keeps its date (today) and everything typed.
  const picker = usePopupCode(pickerCode, true, () => couldNotOpen("calendar", () => undefined, { retry: null, textKept: true }))
  return picker ? <picker.DatePicker {...props} /> : <Placeholder label="Loading calendar" lines={1} />
}
