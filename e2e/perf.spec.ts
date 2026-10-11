import { expect, test, type CDPSession, type Page, type Request } from "@playwright/test"

/**
 * Plan item 1.15b: the §2.2 performance budgets, measured against a running
 * production build (`next start` locally, or the staging deployment).
 *
 * Skipped unless LANE_PERF_BASE_URL is set; playwright.config.ts then runs only
 * the "perf" project, starts no server and provisions nothing. The spec signs in
 * with a Playwright storage state the operator saved for a member of a workspace
 * that has Requests (LANE_PERF_STORAGE_STATE), and it reads data only, except
 * the Mark Done check, which runs only with LANE_PERF_MUTATE=1 and undoes itself.
 *
 *   LANE_PERF_BASE_URL=http://localhost:3000 \
 *   LANE_PERF_STORAGE_STATE=.auth/perf-member.json \
 *   pnpm exec playwright test --project perf
 *
 * Optional: LANE_PERF_RUNS (default 5), LANE_PERF_TOLERANCE (default 1.5, a
 * multiplier on every time budget so shared CI machines do not flake),
 * LANE_PERF_MUTATE=1.
 */

const BASE_URL = process.env.LANE_PERF_BASE_URL
const STORAGE_STATE = process.env.LANE_PERF_STORAGE_STATE
const RUNS = Math.max(1, Number(process.env.LANE_PERF_RUNS ?? 5) || 5)
const TOLERANCE = Math.max(1, Number(process.env.LANE_PERF_TOLERANCE ?? 1.5) || 1.5)
const MUTATE = process.env.LANE_PERF_MUTATE === "1"

// §2.2 budgets. Where §2.2 gives a target and a hard limit, the spec reports
// the target and asserts the hard limit times LANE_PERF_TOLERANCE.
const BUDGET = {
  visualResponse: { target: 50, limit: 100 }, // click or key to the next paint, p75
  viewSwitchInp: { target: 200, limit: 200 }, // status view switch at 4x CPU, p75, zero network
  detailContent: { target: 300, limit: 300 }, // list to detail, warm and prefetched, p75
  detailContentP95: 500,
  lcp: 1500, // warm, desktop
  ttfb: 400,
  cls: 0.02,
  markDoneOnScreen: { target: 50, limit: 100 }, // optimistic change in the next frame, p75
  longFramesPerTransition: 2, // at 4x CPU, in a 300 ms transition
}

test.skip(!BASE_URL, "Set LANE_PERF_BASE_URL to run the performance spec against a running app.")
test.skip(!STORAGE_STATE, "Set LANE_PERF_STORAGE_STATE to a saved, signed-in member session.")
test.describe.configure({ mode: "serial" })
test.use({ storageState: STORAGE_STATE })

type PerfWindow = Window & {
  __lanePerf: {
    events: { name: string; duration: number; interactionId: number; startTime: number }[]
    lcp: number
    cls: number
    longFrames: { startTime: number; duration: number; blockingDuration: number }[]
    lastInput: number
  }
}

/** Observers installed before any app script runs, so buffered entries are kept. */
function installObservers() {
  const perf: PerfWindow["__lanePerf"] = { events: [], lcp: 0, cls: 0, longFrames: [], lastInput: 0 }
  ;(window as unknown as PerfWindow).__lanePerf = perf
  const observe = (type: string, callback: (entries: PerformanceEntryList) => void, extra: Record<string, unknown> = {}) => {
    try { new PerformanceObserver(list => callback(list.getEntries())).observe({ type, buffered: true, ...extra } as PerformanceObserverInit) }
    catch { /* Unsupported entry type in this browser: the metric stays empty. */ }
  }
  observe("event", entries => {
    for (const entry of entries as (PerformanceEventTiming & { interactionId?: number })[]) {
      perf.events.push({ name: entry.name, duration: entry.duration, interactionId: entry.interactionId ?? 0, startTime: entry.startTime })
    }
  }, { durationThreshold: 16 })
  observe("largest-contentful-paint", entries => { const last = entries.at(-1); if (last) perf.lcp = last.startTime })
  observe("layout-shift", entries => {
    for (const entry of entries as (PerformanceEntry & { value: number; hadRecentInput: boolean })[]) if (!entry.hadRecentInput) perf.cls += entry.value
  })
  observe("long-animation-frame", entries => {
    for (const entry of entries as (PerformanceEntry & { blockingDuration?: number })[]) {
      perf.longFrames.push({ startTime: entry.startTime, duration: entry.duration, blockingDuration: entry.blockingDuration ?? 0 })
    }
  })
  // The input timestamp that on-screen timings count from.
  addEventListener("pointerdown", event => { perf.lastInput = event.timeStamp }, { capture: true })
  addEventListener("keydown", event => { perf.lastInput = event.timeStamp }, { capture: true })
}

const p75 = (values: number[]) => {
  const sorted = [...values].sort((a, b) => a - b)
  return sorted[Math.max(0, Math.ceil(sorted.length * 0.75) - 1)] ?? NaN
}
const report = (label: string, values: number[], unit = "ms", target?: number) => {
  const digits = unit === "ms" ? 0 : 3
  const goal = target === undefined ? "" : `, target ${target} ${unit}`
  console.log(`[perf] ${label}: p75 ${p75(values).toFixed(digits)} ${unit}${goal} over ${values.length} runs (${values.map(value => value.toFixed(digits)).join(", ")})`)
}

/** True for a request that goes back to the server for RSC or page data. */
const isRscRequest = (request: Request) =>
  /[?&]_rsc=/.test(request.url()) || request.url().includes("/_next/data") || request.headers()["rsc"] === "1"

async function throttle(page: Page, rate: number): Promise<CDPSession> {
  const cdp = await page.context().newCDPSession(page)
  await cdp.send("Emulation.setCPUThrottlingRate", { rate })
  return cdp
}

/** Longest Event Timing duration among interactions that started after `since`. */
async function interactionDuration(page: Page, since: number) {
  await page.waitForTimeout(250) // entries are dispatched after the next paint
  return page.evaluate(start => {
    const events = (window as unknown as PerfWindow).__lanePerf.events.filter(entry => entry.interactionId > 0 && entry.startTime >= start)
    return events.reduce((max, entry) => Math.max(max, entry.duration), 0)
  }, since)
}

const now = (page: Page) => page.evaluate(() => performance.now())

async function openList(page: Page) {
  await page.goto("/")
  await expect(page.locator("li[data-request-id]").first()).toBeVisible()
  // Let hydration, prefetch and the streamed unread count settle.
  await page.waitForLoadState("networkidle")
}

const statusChip = (page: Page, label: string) =>
  page.getByRole("group", { name: "Status views" }).getByRole("button", { name: label, exact: true })

test.beforeEach(async ({ page }) => {
  await page.addInitScript(installObservers)
})

test("status view switch responds in the next frame with zero network", async ({ page }) => {
  await openList(page)
  const rsc: string[] = []
  page.on("request", request => { if (isRscRequest(request)) rsc.push(request.url()) })

  const durations: number[] = []
  for (let run = 0; run < RUNS; run++) {
    for (const label of ["Open", "In Progress", "Done", "All"]) {
      const chip = statusChip(page, label)
      if (!(await chip.isVisible())) continue // folded into "N more" at narrow widths
      const since = await now(page)
      await chip.click()
      await expect(chip).toHaveAttribute("aria-pressed", "true")
      durations.push(await interactionDuration(page, since))
    }
  }
  report("status chip, input to next paint", durations, "ms", BUDGET.visualResponse.target)
  expect(rsc, "A status view switch must not request RSC or page data").toEqual([])
  // Event Timing durations are rounded to 8 ms.
  expect(p75(durations)).toBeLessThanOrEqual(BUDGET.visualResponse.limit * TOLERANCE)
})

test("list to detail, warm and prefetched, shows content within budget", async ({ page }) => {
  await openList(page)
  const links = page.locator("li[data-request-id] a[href^='/requests/']")
  const count = Math.min(await links.count(), RUNS)
  expect(count, "The workspace needs at least one Request").toBeGreaterThan(0)

  const timings: number[] = []
  for (let run = 0; run < RUNS; run++) {
    const link = links.nth(run % count)
    await link.hover()
    await page.waitForTimeout(600) // intent prefetch (plan item 1.11) plus the viewport prefetch
    const content = page.evaluate(() => new Promise<number>((resolve, reject) => {
      const perf = (window as unknown as PerfWindow).__lanePerf
      const done = () => { if (document.querySelector("#request-problem")) { observer.disconnect(); resolve(performance.now() - perf.lastInput); return true } return false }
      const observer = new MutationObserver(() => { done() })
      observer.observe(document.body, { childList: true, subtree: true })
      setTimeout(() => { observer.disconnect(); reject(new Error("Detail content did not appear")) }, 10_000)
    }))
    await link.click()
    timings.push(await content)
    await page.goBack()
    await expect(page.locator("li[data-request-id]").first()).toBeVisible()
  }
  report("list to detail content (warm)", timings, "ms", BUDGET.detailContent.target)
  expect(p75(timings)).toBeLessThanOrEqual(BUDGET.detailContent.limit * TOLERANCE)
  // The p95 hard limit, approximated by the maximum of a small sample.
  expect(Math.max(...timings)).toBeLessThanOrEqual(BUDGET.detailContentP95 * TOLERANCE)
})

test("warm page load and interactions at 4x CPU stay within LCP, CLS, INP and long-frame budgets", async ({ page }) => {
  await openList(page) // the cold load primes caches; the measured loads are warm
  const cdp = await throttle(page, 4)
  const lcp: number[] = [], ttfb: number[] = [], cls: number[] = [], inp: number[] = [], longFrames: number[] = []
  try {
    for (let run = 0; run < RUNS; run++) {
      await page.reload()
      await expect(page.locator("li[data-request-id]").first()).toBeVisible()
      await page.waitForTimeout(1000) // LCP finalises on the first input; read it before interacting
      const load = await page.evaluate(() => {
        const navigation = performance.getEntriesByType("navigation")[0] as PerformanceNavigationTiming | undefined
        const perf = (window as unknown as PerfWindow).__lanePerf
        return { lcp: perf.lcp, cls: perf.cls, ttfb: navigation ? navigation.responseStart - navigation.startTime : NaN }
      })
      lcp.push(load.lcp); cls.push(load.cls); ttfb.push(load.ttfb)

      let worst = 0
      for (const label of ["Open", "All"]) {
        const chip = statusChip(page, label)
        if (!(await chip.isVisible())) continue
        const since = await now(page)
        await chip.click()
        worst = Math.max(worst, await interactionDuration(page, since))
        // Long animation frames inside the 300 ms after the input.
        longFrames.push(await page.evaluate(start => (window as unknown as PerfWindow).__lanePerf.longFrames
          .filter(frame => frame.startTime >= start && frame.startTime <= start + 300).length, since))
      }
      inp.push(worst)
    }
  } finally {
    await cdp.send("Emulation.setCPUThrottlingRate", { rate: 1 })
  }
  report("LCP at 4x CPU (warm)", lcp, "ms", BUDGET.lcp)
  report("TTFB (warm)", ttfb, "ms", BUDGET.ttfb)
  report("CLS", cls, "", BUDGET.cls)
  report("INP proxy at 4x CPU (worst interaction per load)", inp, "ms", BUDGET.viewSwitchInp.target)
  report("long animation frames per 300 ms transition at 4x CPU", longFrames, "frames", BUDGET.longFramesPerTransition)

  expect(p75(lcp)).toBeLessThanOrEqual(BUDGET.lcp * TOLERANCE)
  expect(p75(ttfb)).toBeLessThanOrEqual(BUDGET.ttfb * TOLERANCE)
  expect(p75(cls)).toBeLessThanOrEqual(BUDGET.cls * TOLERANCE)
  expect(p75(inp)).toBeLessThanOrEqual(BUDGET.viewSwitchInp.limit * TOLERANCE)
  expect(p75(longFrames)).toBeLessThanOrEqual(BUDGET.longFramesPerTransition)
})

test("Mark Done shows on the row in the next frame and never reverts", async ({ page }) => {
  test.skip(!MUTATE, "Set LANE_PERF_MUTATE=1 to measure Mark Done; it changes a Request and then undoes it.")
  await openList(page)
  await statusChip(page, "All").click()

  const timings: number[] = []
  for (let run = 0; run < RUNS; run++) {
    const row = page.locator("li[data-request-id]:has(button[data-status='in_progress'])").first()
    if (!(await row.count())) break
    const id = await row.getAttribute("data-request-id")
    const glyph = page.locator(`li[data-request-id="${id}"] button[data-status]`)
    await glyph.click()
    const item = page.getByRole("menuitem", { name: /mark done/i }).first()
    await expect(item).toBeVisible()

    // Records the time from the input to the first frame that shows Done, and
    // every status the row shows for three seconds after it (the no-revert gate).
    const watch = page.evaluate(rowId => new Promise<{ onScreen: number; sequence: string[] }>(resolve => {
      const perf = (window as unknown as PerfWindow).__lanePerf
      const sequence: string[] = []
      let onScreen = NaN, scheduled = false
      const read = () => document.querySelector(`li[data-request-id="${rowId}"] button[data-status]`)?.getAttribute("data-status") ?? "gone"
      const tick = () => {
        const status = read()
        if (sequence.at(-1) !== status) sequence.push(status)
        if (status === "done" && !scheduled) { scheduled = true; requestAnimationFrame(() => { onScreen = performance.now() - perf.lastInput }) }
      }
      const observer = new MutationObserver(tick)
      observer.observe(document.body, { attributes: true, childList: true, subtree: true, attributeFilter: ["data-status"] })
      tick()
      setTimeout(() => { observer.disconnect(); resolve({ onScreen, sequence }) }, 3000)
    }), id)
    await item.click()
    const { onScreen, sequence } = await watch
    timings.push(onScreen)
    expect(sequence.filter(status => status !== "gone"), "The row must go to Done once and stay there").toEqual(["in_progress", "done"])

    // Put the Request back.
    await page.getByRole("button", { name: "Undo" }).first().click()
    await expect(glyph).toHaveAttribute("data-status", "in_progress", { timeout: 10_000 })
  }
  test.skip(timings.length === 0, "No In Progress Request to mark Done in this workspace.")
  report("Mark Done, input to on screen", timings, "ms", BUDGET.markDoneOnScreen.target)
  expect(p75(timings)).toBeLessThanOrEqual(BUDGET.markDoneOnScreen.limit * TOLERANCE)
})
