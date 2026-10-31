import Link from "next/link";
import { ArrowUpRight, ChartLine } from "lucide-react";
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
 * Each name opens the definition's own page (#197), where it is edited; so does "Add dashboard link". A Viewer
 * (`canEdit` false, #210) reads the same facts with nothing to add.
 */
export function MetricDefinitionList({ definitions, view = "active", canEdit = true }: { definitions: MetricDefinitionListItem[]; view?: "active" | "archived"; canEdit?: boolean }) {
  if (!definitions.length) {
    return <EmptyState icon={<ChartLine data-icon-size="2xl" aria-hidden="true" />} {...EMPTY[view]} />;
  }
  return <ul className={styles.list} aria-label={view === "archived" ? "Archived metric definitions" : "Metric definitions"}>
    {definitions.map(definition => <li key={definition.id} className={styles.definition}>
      <div className={styles.heading}>
        <h4 className={styles.name}><Link className={styles.open} href={`/settings/metrics/${definition.id}`}>{definition.name}</Link></h4>
        <span className={styles.unit}>{metricUnitName(definition.unit)}</span>
      </div>
      {definition.howCounted && <p className={styles.summary}>{definition.howCounted}</p>}
      {definition.link
        ? <a className={styles.source} href={definition.link} target="_blank" rel="noopener noreferrer">View source<ArrowUpRight data-icon-size="sm" aria-hidden="true" /><span className="sr-only"> for {definition.name} (opens in a new tab)</span></a>
        : canEdit && <Link className={styles.source} href={`/settings/metrics/${definition.id}`}>Add source<span className="sr-only"> for {definition.name}</span></Link>}
    </li>)}
  </ul>;
}

/** One definition's unit, how it's counted and where it lives. Someone who can edit is offered to add a missing link. */
export function MetricDefinitionFacts({ definition, canEdit = true }: { definition: MetricDefinitionListItem; canEdit?: boolean }) {
  return <dl className={styles.facts}>
    <div className={styles.fact}><dt>Unit</dt><dd>{metricUnitName(definition.unit)}</dd></div>
    {definition.howCounted && <div className={styles.fact}><dt>Saved definition</dt><dd>{definition.howCounted}</dd></div>}
    <div className={styles.fact}><dt>Dashboard link</dt><dd>{definition.link
      ? <a className={styles.link} href={definition.link} target="_blank" rel="noopener noreferrer">{definition.link}<span className="sr-only"> (opens in a new tab)</span></a>
      : canEdit ? <Link className={styles.add} href={`/settings/metrics/${definition.id}`}>Add dashboard link</Link> : <span className={styles.missing}>Not added yet</span>}</dd></div>
  </dl>;
}
