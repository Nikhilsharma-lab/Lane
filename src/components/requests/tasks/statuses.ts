import { createElement, type SVGProps } from "react"
import { StatusGlyph } from "../status-glyph"
import { JOURNEY_STATUSES, type Journey, type JourneyStatus } from "@/lib/request-journey"

const iconFor = (status: JourneyStatus) =>
  function StatusIcon(props: SVGProps<SVGSVGElement>) { return createElement(StatusGlyph, { ...props, status }) }

const TONES = { open: "neutral", in_progress: "warning", done: "success", measuring: "info", closed: "success" } as const satisfies Record<JourneyStatus, string>

/** The five journey statuses with their glossary labels (request-journey.ts), glyphs and tones (#133).
 * A row's own words come from `rowJourney(row).label`, which also says "Closed without a result". */
export const statuses = JOURNEY_STATUSES.map(({ status, label }) => ({ value: status, label, icon: iconFor(status), tone: TONES[status] }))

export const statusOf = (status: JourneyStatus) => statuses.find(item => item.value === status)!

/** A Request's journey as its glyph, tone and own words ("Closed without a result" included). */
export const statusOfJourney = (journey: Journey) => ({ ...statusOf(journey.status), label: journey.label })
