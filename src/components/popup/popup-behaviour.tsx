"use client"

import { useEffect, useState, useSyncExternalStore, type ReactNode } from "react"
import { popupCode } from "./lazy-popup"
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

const sheetCode = popupCode(() => import("./phone-sheet").then(module => module.default))

/** The adaptive popup's form: `sheet` as the phone panel under 640px, else `desktop`. The form chosen when it opens holds until it closes. */
export function AdaptiveForm({ open, desktop, sheet }: { open: boolean; desktop: ReactNode; sheet: PhoneSheetProps }) {
  const phoneNow = usePhone()
  const [phone, setPhone] = useState(phoneNow)
  if (!open && phone !== phoneNow) setPhone(phoneNow)
  const [PhoneSheet, setPhoneSheet] = useState(sheetCode.current)
  // #267: a panel whose code can't load (offline, an old tab after a deploy) leaves the centred dialog in its place.
  const [failed, setFailed] = useState(false)
  // Fetch the phone panel as soon as this is a phone, so the first open never waits for it.
  useEffect(() => {
    if (!phone || PhoneSheet) return
    let live = true
    sheetCode.load().then(loaded => { if (live) setPhoneSheet(() => loaded) }, () => { if (live) setFailed(true) })
    return () => { live = false }
  }, [phone, PhoneSheet])
  if (!phone || failed) return desktop
  return PhoneSheet && <PhoneSheet {...sheet} />
}
