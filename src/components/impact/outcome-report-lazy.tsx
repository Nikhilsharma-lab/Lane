"use client"

import dynamic from "next/dynamic"
import { useEffect, useState, type ComponentProps } from "react"
import { Placeholder } from "@/components/loading/placeholder"
import { afterPageLoad } from "@/lib/after-page-load"

// #283: the Outcome report's code stays out of Impact's first load when My work is the open tab, which is what keeps
// Arc tabs within Build 3's page budget. Opened on the report (the address says so, or someone who can't file), the
// page renders it on the server and its code arrives with the page. Otherwise it is fetched once the page has loaded and
// is idle (after-page-load.ts), and again as the pointer or focus reaches the tab, so switching to it renders at once,
// offline too. It renders only once its code is here, so a fetch that fails (offline, an old tab after a deploy) never
// throws the page out to the error screen: the placeholder stays and the fetch is tried again once back online.

type ReportModule = typeof import("./outcome-report")
let reportHere: ReportModule | null = null
const loadReport = () => import("./outcome-report").then(module => { reportHere = module; return module })
/** For a report open from the start: the server renders it, and the page brings its code. */
const ServerRenderedReport = dynamic(() => loadReport().then(module => module.OutcomeReportView), { loading: ReportLoading })

function ReportLoading() {
  return <Placeholder label="Loading the Outcome report" lines={6} />
}

/** Fetch the report's code ahead of a switch to its tab; settles once it is here. A failure is quiet: the tab tries again. */
export const preloadOutcomeReport = (): Promise<void> => loadReport().then(() => undefined, () => undefined)

/** Whether the report's code is here, fetching it once the page is idle and again whenever the browser comes back online. */
function useReportCode(): ReportModule | null {
  const [ready, setReady] = useState(reportHere)
  useEffect(() => {
    if (ready) return
    let live = true
    const retry = () => { removeEventListener("online", retry); fetchCode() }
    const fetchCode = () => {
      loadReport().then(module => { if (live) setReady(module) }, () => { if (live) addEventListener("online", retry) })
    }
    const cancel = afterPageLoad(fetchCode)
    return () => { live = false; cancel(); removeEventListener("online", retry) }
  }, [ready])
  return ready
}

/**
 * The Outcome report, rendered at once when it was open from the start (`openedFirst`) or its code is here, and
 * otherwise a placeholder until the code arrives.
 */
export function LazyOutcomeReport({ openedFirst, ...props }: ComponentProps<ReportModule["OutcomeReportView"]> & { openedFirst: boolean }) {
  const code = useReportCode()
  // Chosen once, so the report never remounts (and drops what it holds) when its code arrives after the first render.
  const [Opened] = useState(() => reportHere?.OutcomeReportView ?? (openedFirst ? ServerRenderedReport : null))
  const Report = Opened ?? code?.OutcomeReportView
  return Report ? <Report {...props} /> : <ReportLoading />
}
