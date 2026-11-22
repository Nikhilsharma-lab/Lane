import { momentDay, type Moment } from "@/lib/dates"

/**
 * #380 (#346 point 5): how Settings → Profile names a signed-in device and its days. Pure and browser-safe, so the
 * server read that builds the device list (increment 5) and the view share it. A device is a browser and a system,
 * never an IP address or a place.
 */
export type DeviceKind = { browser: string; system: string }

/**
 * One of a person's signed-in devices (a Better Auth session), as only they see it. There is deliberately no field
 * for an IP address or a place: support, not surveillance (#346 point 5).
 */
export type SignedInDevice = DeviceKind & {
  /** The session's own id, for signing it out. */
  id: string
  signedInAt: Moment
  lastUsedAt: Moment
  /** The device reading this. */
  current: boolean
}

// Proposed for Nikhil (#380): the words for an agent Lane can't read.
const UNKNOWN_BROWSER = "Unknown browser"
const UNKNOWN_SYSTEM = "unknown system"

// Browsers built on Chrome's engine that say "Chrome" in their agent; Lane doesn't know them, so it doesn't misname them.
const OTHER_BROWSERS = /\b(OPR|OPiOS|SamsungBrowser|YaBrowser|Vivaldi|UCBrowser)\//
// The order matters: Edge and Firefox on iOS also say Safari, and Chrome says Safari everywhere.
const BROWSERS: [string, RegExp][] = [
  ["Edge", /\b(Edg|EdgA|EdgiOS)\//],
  ["Firefox", /\b(Firefox|FxiOS)\//],
  ["Chrome", /\b(Chrome|CriOS)\//],
  ["Safari", /\bVersion\/[\d.]+.*\bSafari\//],
]
// iPhones and iPads say "like Mac OS X", and Android says Linux, so they come first.
const SYSTEMS: [string, RegExp][] = [
  ["iPhone", /\b(iPhone|iPod)\b/],
  ["iPad", /\biPad\b/],
  ["Android", /\bAndroid\b/],
  ["Windows", /\bWindows\b/],
  ["macOS", /\bMacintosh\b|\bMac OS X\b/],
  ["Linux", /\bLinux\b/],
]

/** The browser and system a user agent names: Chrome, Edge, Firefox or Safari, on macOS, Windows, iPhone, iPad, Android or Linux. */
export function readUserAgent(userAgent: string | null | undefined): DeviceKind {
  const agent = userAgent ?? ""
  const browser = OTHER_BROWSERS.test(agent) ? undefined : BROWSERS.find(([, pattern]) => pattern.test(agent))?.[0]
  const system = SYSTEMS.find(([, pattern]) => pattern.test(agent))?.[0]
  return { browser: browser ?? UNKNOWN_BROWSER, system: system ?? UNKNOWN_SYSTEM }
}

/** "Safari on iPhone". */
export function deviceName({ browser, system }: DeviceKind): string {
  return `${browser} on ${system}`
}

const dayKeys = new Map<string, Intl.DateTimeFormat>()
/** A moment's calendar day in a zone, as "YYYY-MM-DD" (undefined: the runtime's zone, the viewer's in the browser). */
function dayKey(at: Date, timeZone: string | undefined) {
  const key = timeZone ?? ""
  let format = dayKeys.get(key)
  if (!format) {
    format = new Intl.DateTimeFormat("en-CA", { timeZone, year: "numeric", month: "2-digit", day: "2-digit" })
    dayKeys.set(key, format)
  }
  return format.format(at)
}

/**
 * A device's day: "today", "yesterday", then Lane's day ("18 Nov", "18 Nov 2025" before this year). Lane knows when a
 * device was last used only to the day, so there is never a clock time.
 */
export function deviceDay(at: Moment, { now = new Date(), timeZone }: { now?: Date; timeZone?: string } = {}): string {
  const moment = at instanceof Date ? at : new Date(at)
  const today = dayKey(now, timeZone)
  const [year, month, day] = today.split("-").map(Number)
  const yesterday = dayKey(new Date(Date.UTC(year, month - 1, day - 1)), "UTC")
  const shown = dayKey(moment, timeZone)
  if (shown === today) return "today"
  if (shown === yesterday) return "yesterday"
  return momentDay(moment, { now, timeZone })
}
