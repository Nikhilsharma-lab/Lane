"use client"

import { useState, useSyncExternalStore, type ReactNode } from "react"
import { popupCode, usePopupCode } from "./lazy-popup"
import type { PhoneSheetProps } from "./phone-sheet"

/**
 * #263: the one part of Lane's popups that waits for the page to settle (load-behaviour.ts): the switch to the phone
 * bottom panel. Focus and the typed-text guard are in adaptive-dialog.tsx and in-page-form.tsx, which load with the
 * page.
 */

/** Under 640px Lane's dialogs become bottom panels (polish bar §1). */
const PHONE = "(max-width: 639.98px)"
function subscribePhone(change: () => void) {
  const query = window.matchMedia(PHONE)
  query.addEventListener("change", change)
  return () => query.removeEventListener("change", change)
}
const usePhone = () => useSyncExternalStore(subscribePhone, () => window.matchMedia(PHONE).matches, () => false)

const sheetCode = popupCode(() => import("./phone-sheet"))

/** The adaptive popup's form: `sheet` as the phone panel under 640px, else `desktop`. The form chosen when it opens holds until it closes. */
export function AdaptiveForm({ open, desktop, sheet }: { open: boolean; desktop: ReactNode; sheet: PhoneSheetProps }) {
  const phoneNow = usePhone()
  const [phone, setPhone] = useState(phoneNow)
  if (!open && phone !== phoneNow) setPhone(phoneNow)
  // A panel whose code can't load (offline, an old tab after a deploy) leaves the centred dialog in its place.
  const [failed, setFailed] = useState(false)
  // Fetched as soon as this is a phone, so the first open never waits for it.
  const phoneSheet = usePopupCode(sheetCode, phone && !failed, () => setFailed(true))
  if (!phone || failed) return desktop
  return phoneSheet && <phoneSheet.default {...sheet} />
}
