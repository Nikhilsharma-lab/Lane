import { describe, expect, it } from "vitest"
import { deviceDay, deviceName, readUserAgent } from "./signed-in-device-rules"

const named = (userAgent: string | null | undefined) => deviceName(readUserAgent(userAgent))

const CHROME = "AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0"
const IOS = "AppleWebKit/605.1.15 (KHTML, like Gecko)"

/** #380: a signed-in device reads "<browser> on <system>", from the user agent its session was made with. */
describe("Signed-in device names (#380)", () => {
  it.each([
    ["Chrome on macOS", `Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) ${CHROME} Safari/537.36`],
    ["Chrome on Windows", `Mozilla/5.0 (Windows NT 10.0; Win64; x64) ${CHROME} Safari/537.36`],
    ["Chrome on iPhone", `Mozilla/5.0 (iPhone; CPU iPhone OS 18_1 like Mac OS X) ${IOS} CriOS/131.0.6778.73 Mobile/15E148 Safari/604.1`],
    ["Chrome on iPad", `Mozilla/5.0 (iPad; CPU OS 18_1 like Mac OS X) ${IOS} CriOS/131.0.6778.73 Mobile/15E148 Safari/604.1`],
    ["Chrome on Android", `Mozilla/5.0 (Linux; Android 10; K) ${CHROME} Mobile Safari/537.36`],
    ["Chrome on Linux", `Mozilla/5.0 (X11; Linux x86_64) ${CHROME} Safari/537.36`],
    ["Edge on macOS", `Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) ${CHROME} Safari/537.36 Edg/131.0.0.0`],
    ["Edge on Windows", `Mozilla/5.0 (Windows NT 10.0; Win64; x64) ${CHROME} Safari/537.36 Edg/131.0.0.0`],
    ["Edge on iPhone", `Mozilla/5.0 (iPhone; CPU iPhone OS 18_1 like Mac OS X) ${IOS} Version/18.0 EdgiOS/131.2903.68 Mobile/15E148 Safari/605.1.15`],
    ["Edge on iPad", `Mozilla/5.0 (iPad; CPU OS 18_1 like Mac OS X) ${IOS} Version/18.0 EdgiOS/131.2903.68 Mobile/15E148 Safari/605.1.15`],
    ["Edge on Android", `Mozilla/5.0 (Linux; Android 10; K) ${CHROME} Mobile Safari/537.36 EdgA/131.0.2903.70`],
    ["Edge on Linux", `Mozilla/5.0 (X11; Linux x86_64) ${CHROME} Safari/537.36 Edg/131.0.0.0`],
    ["Firefox on macOS", "Mozilla/5.0 (Macintosh; Intel Mac OS X 10.15; rv:133.0) Gecko/20100101 Firefox/133.0"],
    ["Firefox on Windows", "Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:133.0) Gecko/20100101 Firefox/133.0"],
    ["Firefox on iPhone", `Mozilla/5.0 (iPhone; CPU iPhone OS 18_1 like Mac OS X) ${IOS} FxiOS/133.0 Mobile/15E148 Safari/605.1.15`],
    ["Firefox on iPad", `Mozilla/5.0 (iPad; CPU OS 18_1 like Mac OS X) ${IOS} FxiOS/133.0 Mobile/15E148 Safari/605.1.15`],
    ["Firefox on Android", "Mozilla/5.0 (Android 15; Mobile; rv:133.0) Gecko/133.0 Firefox/133.0"],
    ["Firefox on Linux", "Mozilla/5.0 (X11; Linux x86_64; rv:133.0) Gecko/20100101 Firefox/133.0"],
    ["Safari on macOS", `Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) ${IOS} Version/18.1 Safari/605.1.15`],
    ["Safari on iPhone", `Mozilla/5.0 (iPhone; CPU iPhone OS 18_1 like Mac OS X) ${IOS} Version/18.1 Mobile/15E148 Safari/604.1`],
    ["Safari on iPad", `Mozilla/5.0 (iPad; CPU OS 18_1 like Mac OS X) ${IOS} Version/18.1 Mobile/15E148 Safari/604.1`],
  ])("reads %s", (name, userAgent) => {
    expect(named(userAgent)).toBe(name)
  })

  it("reads an agent it doesn't know, or none, as an unknown browser on an unknown system", () => {
    for (const userAgent of ["curl/8.7.1", "", null, undefined]) expect(named(userAgent)).toBe("Unknown browser on unknown system")
  })

  it("doesn't call a browser built on Chrome's engine Chrome, and names only the part it knows", () => {
    expect(named(`Mozilla/5.0 (Windows NT 10.0; Win64; x64) ${CHROME} Safari/537.36 OPR/115.0.0.0`)).toBe("Unknown browser on Windows")
    expect(named(`Mozilla/5.0 (Linux; Android 14; SM-S918B) AppleWebKit/537.36 (KHTML, like Gecko) SamsungBrowser/26.0 Chrome/122.0.0.0 Mobile Safari/537.36`)).toBe("Unknown browser on Android")
    expect(named(`Mozilla/5.0 (X11; CrOS x86_64 14541.0.0) ${CHROME} Safari/537.36`)).toBe("Chrome on unknown system")
  })
})

/** #380 (#346 point 5): a device's dates read as a day, in the viewer's time zone, never with a clock time. */
describe("Signed-in device days (#380)", () => {
  const now = new Date("2026-11-22T12:00:00Z")
  const day = (at: string, timeZone = "UTC", clock = now) => deviceDay(at, { now: clock, timeZone })

  it("reads today, yesterday, a day this year and a day in another year", () => {
    expect(day("2026-11-22T00:30:00Z")).toBe("today")
    expect(day("2026-11-21T23:59:00Z")).toBe("yesterday")
    expect(day("2026-11-18T09:00:00Z")).toBe("18 Nov")
    expect(day("2025-11-18T09:00:00Z")).toBe("18 Nov 2025")
  })

  it("counts days in the viewer's zone, so a late evening there isn't yesterday", () => {
    // 01:30 on 22 Nov in Kolkata is still 21 Nov in UTC.
    expect(day("2026-11-21T20:00:00Z", "Asia/Kolkata", new Date("2026-11-22T06:00:00Z"))).toBe("today")
    expect(day("2026-11-21T20:00:00Z", "UTC", new Date("2026-11-22T06:00:00Z"))).toBe("yesterday")
  })

  it("reads the last day of last year as yesterday on New Year's Day", () => {
    expect(day("2025-12-31T10:00:00Z", "UTC", new Date("2026-01-01T10:00:00Z"))).toBe("yesterday")
  })

  it("never shows a clock time", () => {
    for (const at of ["2026-11-22T00:30:00Z", "2026-11-21T23:59:00Z", "2026-11-18T09:00:00Z", "2025-11-18T09:00:00Z"]) expect(day(at)).not.toMatch(/\d:\d/)
  })
})
