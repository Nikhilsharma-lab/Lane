import Link from "next/link";
import { ChartLine } from "lucide-react";
import { EmptyState } from "@/components/arc/empty-state/empty-state";
import { metricUnitName, type MetricUnit } from "@/lib/metric-definition-rules";
import styles from "./metric-definition-list.module.css";

export type MetricDefinitionListItem = { id: string; name: string; unit: MetricUnit; link: string | null; howCounted: string | null };

const EMPTY = {
  active: { title: "No metrics yet", description: "Metrics your workspace measures appear here." },
  archived: { title: "No archived metrics", description: "Metrics an Admin archives appear here, and can be restored." },
};

/**
 * The Metrics page's list (#196): each definition's name, unit, how it's counted and where it lives.
 * Each name opens the definition's own page (#197), where it is edited; so does "Add where this lives". A Viewer
 * (`canEdit` false, #210) reads the same facts with nothing to add.
 */
export function MetricDefinitionList({ definitions, view = "active", canEdit = true }: { definitions: MetricDefinitionListItem[]; view?: "active" | "archived"; canEdit?: boolean }) {
  if (!definitions.length) {
    return <EmptyState icon={<ChartLine data-icon-size="2xl" aria-hidden="true" />} {...EMPTY[view]} />;
  }
  return <ul className={styles.list} aria-label={view === "archived" ? "Archived metric definitions" : "Metric definitions"}>
    {definitions.map(definition => <li key={definition.id} className={styles.definition}>
      <h4 className={styles.name}><Link className={styles.open} href={`/settings/metrics/${definition.id}`}>{definition.name}</Link></h4>
      <MetricDefinitionFacts definition={definition} canEdit={canEdit} />
    </li>)}
  </ul>;
}

/** One definition's unit, how it's counted and where it lives. Someone who can edit is offered to add a missing link. */
export function MetricDefinitionFacts({ definition, canEdit = true }: { definition: MetricDefinitionListItem; canEdit?: boolean }) {
  return <dl className={styles.facts}>
    <div className={styles.fact}><dt>Unit</dt><dd>{metricUnitName(definition.unit)}</dd></div>
    <div className={styles.fact}><dt>How it&apos;s counted</dt><dd>{definition.howCounted ?? <span className={styles.missing}>Not written yet</span>}</dd></div>
    <div className={styles.fact}><dt>Where it lives</dt><dd>{definition.link
      ? <a className={styles.link} href={definition.link} target="_blank" rel="noopener noreferrer">{definition.link}<span className="sr-only"> (opens in a new tab)</span></a>
      : canEdit ? <Link className={styles.add} href={`/settings/metrics/${definition.id}`}>Add where this lives</Link> : <span className={styles.missing}>Not added yet</span>}</dd></div>
  </dl>;
}
