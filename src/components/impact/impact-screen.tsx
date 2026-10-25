"use client"

import Link from "next/link"
import { useRef, useState, type KeyboardEvent } from "react"
import type { ImpactPeriod } from "@/lib/impact-period"
import type { ImpactDashboard, Teammate, MyWorkEntry } from "@/lib/impact-read-model"
import { impactHref } from "./impact-href"
import { MyWorkTab, TeammateWorkList } from "./my-work-list"
import { OutcomeReportView } from "./outcome-report"
import styles from "./impact-screen.module.css"

// The Impact screen (#159, #208): My work and the Outcome report for a non-guest, My work alone for a guest. It
// renders the read model's output and computes no totals. Read only: no add, edit, notify or export controls.

export type TabId = "my-work" | "outcome-report";
const TABS: { id: TabId; label: string }[] = [
  { id: "my-work", label: "My work" },
  { id: "outcome-report", label: "Outcome report" },
];

/** Where a tab key moves the selection: arrows wrap, Home and End jump to the ends. Null for any other key. */
export function nextTab(current: TabId, key: string): TabId | null {
  const index = TABS.findIndex(tab => tab.id === current);
  const last = TABS.length - 1;
  const target = key === "ArrowRight" || key === "ArrowDown" ? (index === last ? 0 : index + 1)
    : key === "ArrowLeft" || key === "ArrowUp" ? (index === 0 ? last : index - 1)
      : key === "Home" ? 0 : key === "End" ? last : -1;
  return target < 0 ? null : TABS[target].id;
}

export type ImpactScreenProps = {
  dashboard: ImpactDashboard;
  /** The period chosen in the URL, kept on teammate links. Null when none is chosen (the report shows the current quarter). */
  period: ImpactPeriod | null;
  /** The people a non-guest may open a list for. Empty for a guest. */
  teammates: Teammate[];
  /** The teammate chosen in the URL, with their Requests. Null when none is chosen. */
  person: { id: string; name: string; entries: MyWorkEntry[] } | null;
  onPeriodChange?: (period: ImpactPeriod) => void;
  /** The tab open first. The page opens the Outcome report when the address names a period and no teammate. */
  initialTab?: TabId;
};

export function ImpactScreen({ dashboard, period, teammates, person, onPeriodChange, initialTab = "my-work" }: ImpactScreenProps) {
  const [selected, setSelected] = useState<TabId>(initialTab);
  const tabs = useRef<Partial<Record<TabId, HTMLButtonElement | null>>>({});
  // The read model returns no Outcome report for a guest, so a guest sees My work alone, with no tabs.
  const report = dashboard.outcomeReport;

  const onKeyDown = (current: TabId) => (event: KeyboardEvent<HTMLButtonElement>) => {
    const next = nextTab(current, event.key);
    if (!next) return;
    event.preventDefault();
    setSelected(next);
    tabs.current[next]?.focus();
  };

  const myWork = <MyWorkTab entries={dashboard.myWork.requests} />;
  // Teammates are for a non-guest only; the read model returns no Outcome report, and no teammates, for a guest.
  const teammateLists = <>
    {teammates.length > 0 && <section className={styles.people} aria-labelledby="impact-teammates-heading">
      <h2 id="impact-teammates-heading" className={styles.heading}>Teammates</h2>
      <p className={styles.note}>Open a teammate&apos;s Requests to see their results. Lists show results only, never totals or rankings.</p>
      <ul className={styles.peopleList}>
        {teammates.map(teammate => <li key={teammate.id}>
          <Link href={impactHref({ period, person: teammate.id })} className={styles.person} aria-current={person?.id === teammate.id ? "true" : undefined}>{teammate.name}</Link>
        </li>)}
      </ul>
    </section>}
    {person && <section className={styles.personList} aria-labelledby="impact-person-heading">
      <h2 id="impact-person-heading" className={styles.heading}>Requests by {person.name}</h2>
      <TeammateWorkList name={person.name} entries={person.entries} />
    </section>}
  </>;

  if (report === null) return <div className={styles.screen}>
    <section aria-label="My work">{myWork}</section>
  </div>;

  const panels: Record<TabId, React.ReactNode> = {
    "my-work": <>{myWork}{teammateLists}</>,
    "outcome-report": <OutcomeReportView report={report} onPeriodChange={onPeriodChange} />,
  };

  return <div className={styles.screen}>
    <div role="tablist" aria-label="Impact views" className={styles.tablist}>
      {TABS.map(tab => <button
        key={tab.id}
        ref={element => { tabs.current[tab.id] = element; }}
        id={`impact-tab-${tab.id}`}
        type="button"
        role="tab"
        aria-selected={selected === tab.id}
        aria-controls={`impact-panel-${tab.id}`}
        tabIndex={selected === tab.id ? 0 : -1}
        className={styles.tab}
        onClick={() => setSelected(tab.id)}
        onKeyDown={onKeyDown(tab.id)}
      >{tab.label}</button>)}
    </div>
    {TABS.map(tab => <section
      key={tab.id}
      id={`impact-panel-${tab.id}`}
      role="tabpanel"
      aria-labelledby={`impact-tab-${tab.id}`}
      tabIndex={0}
      hidden={selected !== tab.id}
      className={styles.panel}
    >{panels[tab.id]}</section>)}
  </div>;
}
