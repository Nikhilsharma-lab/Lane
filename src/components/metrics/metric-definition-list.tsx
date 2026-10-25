import { ChartLine } from "lucide-react";
import { EmptyState } from "@/components/arc/empty-state/empty-state";
import { metricUnitName, type MetricUnit } from "@/lib/metric-definition-rules";
import styles from "./metric-definition-list.module.css";

export type MetricDefinitionListItem = { id: string; name: string; unit: MetricUnit; link: string | null; howCounted: string | null };

/** The Metrics page's list (#196): each definition's name, unit, how it's counted and where it lives. Read-only for now. */
export function MetricDefinitionList({ definitions }: { definitions: MetricDefinitionListItem[] }) {
  if (!definitions.length) {
    return <EmptyState icon={<ChartLine data-icon-size="2xl" aria-hidden="true" />} title="No metrics yet" description="Metrics your workspace measures appear here." />;
  }
  return <ul className={styles.list} aria-label="Metric definitions">
    {definitions.map(definition => <li key={definition.id} className={styles.definition}>
      <h4 className={styles.name}>{definition.name}</h4>
      <dl className={styles.facts}>
        <div className={styles.fact}><dt>Unit</dt><dd>{metricUnitName(definition.unit)}</dd></div>
        <div className={styles.fact}><dt>How it&apos;s counted</dt><dd>{definition.howCounted ?? <span className={styles.missing}>Not written yet</span>}</dd></div>
        <div className={styles.fact}><dt>Where it lives</dt><dd>{definition.link
          ? <a className={styles.link} href={definition.link} target="_blank" rel="noopener noreferrer">{definition.link}<span className="sr-only"> (opens in a new tab)</span></a>
          : <span className={styles.missing}>Add where this lives</span>}</dd></div>
      </dl>
    </li>)}
  </ul>;
}
