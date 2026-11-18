"use client";

import { useSearchParams } from "next/navigation";
import { Skeleton } from "@/components/arc/skeleton/skeleton";
import { Placeholder } from "@/components/loading/placeholder";
import loading from "./settings-loading.module.css";

/** The frame's class names, handed down by the server so this small client part doesn't carry the stylesheet's map. */
export type LoadingClasses = { section: string; sectionHead: string; group: string; groupBox: string; groupRow: string };

/**
 * #288 (D22): the loading frame's section, named for the one that is opening: the address's `section` when it names
 * one (a planned one opens Coming soon), else the page's own. Its placeholders are that section's row groups.
 */
export function SettingsLoadingSection({ section, label, titles, planned, shapes, classes }: {
  section: string; label: string; titles: Record<string, string>; planned: string[]; shapes: Record<string, number[]>; classes: LoadingClasses;
}) {
  const asked = useSearchParams()?.get("section") ?? "";
  const id = planned.includes(asked) ? "coming-soon" : asked in titles ? asked : section;
  return <section className={classes.section}>
    <header className={classes.sectionHead}><h2>{titles[id] ?? "Settings"}</h2></header>
    <Placeholder><div className={loading.loadingGroups}>
      <Skeleton label={label} lines={1} className={loading.loadingPurpose} />
      {(shapes[id] ?? [3]).map((rows, group) => <div key={group} className={classes.group} aria-hidden="true">
        <span className={loading.loadingLabel} />
        <div className={classes.groupBox}>{Array.from({ length: rows }, (_, row) => <div key={row} className={classes.groupRow}><Skeleton lines={2} /><span className={loading.loadingControl} /></div>)}</div>
      </div>)}
    </div></Placeholder>
  </section>;
}
