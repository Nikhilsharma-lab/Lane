import Link from "next/link"
import { Badge } from "@/components/arc/badge/badge"
import type { ProjectView } from "@/lib/impact-read-model"
import { byProjectSections, type MetricCells, type MeasuredLine, type PredictionLine, type ProjectSection, type RequestLine } from "@/lib/impact-by-project-view"
import { requestDetailHref } from "@/lib/request-workspace"
import { MetricChart } from "./metric-chart"
import styles from "./by-project-tab.module.css"

// The "By project" tab (#156). Renders the read model's Project views; every number and every total comes from the read model.

function Cells({ cells }: { cells: MetricCells }) {
  return <dl className={styles.cells}>
    <div className={styles.cell}><dt className={styles.cellLabel}>Baseline</dt><dd className={styles.cellValue}>{cells.baseline}</dd></div>
    <div className={styles.cell}><dt className={styles.cellLabel}>Actual</dt><dd className={styles.cellValue}>{cells.actual}</dd></div>
    <div className={styles.cell}><dt className={styles.cellLabel}>Change</dt><dd className={styles.cellValue}>{cells.change}</dd></div>
    <div className={styles.cell}><dt className={styles.cellLabel}>Predicted change</dt><dd className={styles.cellValue}>{cells.predicted}</dd></div>
  </dl>
}

function MeasuredEntry({ line }: { line: MeasuredLine }) {
  return <li className={styles.line}>
    <div className={styles.lineHead}>
      <span className={styles.metric}>{line.metric}</span>
      <span className={styles.muted}>{line.context}</span>
      <span className={styles.muted}>{line.window}</span>
      <span className={styles.muted}>{line.summary}</span>
      {line.total && <span className={styles.metric}>{line.total}</span>}
    </div>
    {line.chart && <MetricChart chart={line.chart} />}
    {line.cells ? <Cells cells={line.cells} /> : <ul className={styles.nested}>
      {line.results.map(result => <li key={result.requestId} className={styles.nestedRow}>
        <Link href={requestDetailHref(result.requestId, "all")} className={styles.link}>{result.title}</Link>
        <Cells cells={result.cells} />
      </li>)}
    </ul>}
  </li>
}

function PredictionEntry({ prediction }: { prediction: PredictionLine }) {
  return <li className={styles.requestRow}>
    <Link href={requestDetailHref(prediction.requestId, "all")} className={styles.link}>{prediction.title}</Link>
    <span className={styles.muted}>{prediction.metric} · {prediction.context}</span>
    <span className={styles.muted}>Predicted {prediction.predicted}, {prediction.window}</span>
  </li>
}

function RequestEntry({ request }: { request: RequestLine }) {
  return <li className={styles.requestRow}>
    <Link href={requestDetailHref(request.requestId, "all")} className={styles.link}>
      {request.code && <span className={styles.code}>{request.code}</span>} {request.title}
    </Link>
    <Badge tone="neutral" size="sm">{request.journey}</Badge>
    {request.note && <span className={styles.muted}>{request.note}</span>}
  </li>
}

function ProjectBlock({ section }: { section: ProjectSection }) {
  const headingId = `by-project-${section.projectId ?? "unassigned"}`
  return <section aria-labelledby={headingId} className={styles.section}>
    <h2 id={headingId} className={styles.heading}>{section.heading}</h2>

    {section.measured.length > 0
      ? <ul className={styles.lines} aria-label={`Measured results for ${section.heading}`}>{section.measured.map(line => <MeasuredEntry key={line.key} line={line} />)}</ul>
      : section.emptyMessage && <p className={styles.muted}>{section.emptyMessage}</p>}

    {section.stillDueLabel && <p><Badge tone="info" size="sm">{section.stillDueLabel}</Badge></p>}

    {section.predictions.length > 0 && <div className={styles.group}>
      <h3 className={styles.subheading}>Predicted, not yet measured</h3>
      <ul className={styles.list}>{section.predictions.map(prediction => <PredictionEntry key={prediction.requestId} prediction={prediction} />)}</ul>
    </div>}

    <div className={styles.group}>
      <h3 className={styles.subheading}>Requests</h3>
      <ul className={styles.list}>{section.requests.map(request => <RequestEntry key={request.requestId} request={request} />)}</ul>
    </div>
  </section>
}

export function ByProjectTab({ projects }: { projects: ProjectView[] }) {
  const sections = byProjectSections(projects)
  if (sections.length === 0) return <p className={styles.muted}>No Requests yet.</p>
  return <div className={styles.tab}>{sections.map(section => <ProjectBlock key={section.projectId ?? "unassigned"} section={section} />)}</div>
}
