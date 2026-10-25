import { LocalTime } from "@/components/requests/local-time";
import { METRIC_UNITS, metricUnitName, type MetricUnit } from "@/lib/metric-definition-rules";
import styles from "./metric-definition-history.module.css";

/** One history entry as the page hands it to the browser. `before`/`after` are the library's snapshots. */
export type MetricHistoryItem = {
  revision: number;
  kind: "created" | "edited" | "archived" | "restored" | "merged_away" | "merged_into";
  before: Record<string, unknown> | null;
  after: Record<string, unknown>;
  /** Null for a starter metric, which Lane added. */
  authorName: string | null;
  createdAt: string;
};

const KIND: Record<MetricHistoryItem["kind"], string> = {
  created: "Added", edited: "Edited", archived: "Archived", restored: "Restored",
  merged_away: "Merged into another metric", merged_into: "Another metric merged into this one",
};

const FIELDS = [["name", "Name"], ["unit", "Unit"], ["link", "Where it lives"], ["howCounted", "How it's counted"]] as const;

function shown(field: typeof FIELDS[number][0], value: unknown): string | null {
  if (typeof value !== "string" || !value) return null;
  return field === "unit" && (METRIC_UNITS as readonly string[]).includes(value) ? metricUnitName(value as MetricUnit) : value;
}

/** What a change did to each field, in plain words. A creation lists what it was added with. */
function changes(entry: MetricHistoryItem): string[][] {
  return FIELDS.flatMap(([field, label]) => {
    const after = shown(field, entry.after[field]);
    if (!entry.before) return after ? [[`${label}: `, after]] : [];
    const before = shown(field, entry.before[field]);
    if (before === after) return [];
    if (!before) return [[`${label} added: `, after!]];
    if (!after) return [[`${label} removed: `, before]];
    return [[`${label} changed from `, before, " to ", after]];
  });
}

/** A Metric definition's history (#197), newest first: who changed what, when, with the before and after. */
export function MetricDefinitionHistory({ entries }: { entries: MetricHistoryItem[] }) {
  const newestFirst = [...entries].sort((a, b) => b.revision - a.revision);
  return <ol className={styles.history} aria-label="Changes to this metric">
    {newestFirst.map(entry => <li key={entry.revision} className={styles.entry}>
      <p className={styles.heading}>
        <span>{KIND[entry.kind]} by {entry.authorName ?? "Lane"}</span>
        <LocalTime iso={entry.createdAt} className={styles.time} />
      </p>
      {(entry.kind === "created" || entry.kind === "edited") && <ul className={styles.changes}>
        {changes(entry).map(parts => <li key={parts[0]}>{parts.map((part, index) => index % 2 ? <span key={index} className={styles.value}>{part}</span> : part)}</li>)}
      </ul>}
    </li>)}
  </ol>;
}
