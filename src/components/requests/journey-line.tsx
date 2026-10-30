import { Fragment } from "react"
import { LocalTime } from "./local-time"
import type { JourneyLine as Line } from "./request-timeline-model"

/** #261 (B5): one Journey line, its moments shown as every Lane moment is (`LocalTime`: the viewer's zone, the full date and time on hover). */
export function JourneyLine({ line }: { line: Line }) {
  return <p>{line.map((part, index) => <Fragment key={index}>{typeof part === "string" ? part : <LocalTime iso={part.at} day />}</Fragment>)}</p>
}
