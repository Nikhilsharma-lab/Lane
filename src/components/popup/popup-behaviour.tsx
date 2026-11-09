"use client"

import { useState, type ReactNode } from "react"
import { PHONE_PANEL, usePhonePanel } from "@/lib/use-media-query"
import { popupCode, usePopupCode } from "./lazy-popup"
import type { PhoneSheetProps } from "./phone-sheet"

/**
 * #263: the one part of Lane's popups that waits for the page to settle (load-behaviour.ts): the switch to the phone
 * bottom panel. Focus and the typed-text guard are in adaptive-dialog.tsx and in-page-form.tsx, which load with the
 * page.
 */

const sheetCode = popupCode(() => import("./phone-sheet"))

// Build 4: on a phone the panel's code is fetched as soon as this module is here (load-behaviour.ts brings it once
// the page has loaded and is idle, or at the first press), not at the first open, which waited for it with nothing on
// screen. For the browser tests: from `ready` on, a popup on a phone opens as the panel.
if (typeof window !== "undefined" && window.matchMedia(PHONE_PANEL).matches) {
  sheetCode.load().then(() => { document.documentElement.dataset.popupSheet = "ready" }, () => undefined)
}

/**
 * The adaptive popup's form: `sheet` as the phone panel under 640px, else `desktop`. The form chosen when it opens
 * holds until it closes. Until the panel's code is here (or if it can't load: offline, an old tab after a deploy) the
 * centred dialog stands in, so an open never waits for it.
 */
export function AdaptiveForm({ open, desktop, sheet }: { open: boolean; desktop: ReactNode; sheet: PhoneSheetProps }) {
  const phoneNow = usePhonePanel()
  const [failed, setFailed] = useState(false)
  const phoneSheet = usePopupCode(sheetCode, phoneNow && !failed, () => setFailed(true))
  const sheetNow = phoneNow && !failed && phoneSheet !== null
  const [asSheet, setAsSheet] = useState(sheetNow)
  if (!open && asSheet !== sheetNow) setAsSheet(sheetNow)
  return asSheet && phoneSheet ? <phoneSheet.default {...sheet} /> : desktop
}
