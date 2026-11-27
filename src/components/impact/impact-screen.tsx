"use client"

import { useState } from "react"
import { Select } from "@/components/arc/select/select"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/arc/tabs/tabs"
import type { ImpactPeriod } from "@/lib/impact-period"
import type { ImpactDashboard, Teammate, MyWorkEntry } from "@/lib/impact-read-model"
import { impactTab, type ImpactTab } from "./impact-href"
import { MyWorkTab, TeammateWorkList } from "./my-work-list"
import { LazyOutcomeReport, preloadOutcomeReport } from "./outcome-report-lazy"
import type { QuarterNoteEditorTarget } from "./quarter-notes"
import styles from "./impact-screen.module.css"

// The Impact screen (#159, #208, #283): My work and the Outcome report in Arc tabs, held in the page address. It
// renders the read model's output and computes no totals. Read only: no add, edit, notify or export controls. Tabs and
// Showing come from what the read model returns: no Outcome report means My work alone, no teammates means no Showing.

/** Showing's value for the viewer's own list. A user id is a long random string, so it never names a person. */
const YOU = "you"

export type ImpactScreenProps = {
  dashboard: ImpactDashboard;
  /** The period chosen in the address. Null when none is chosen (the report shows the current quarter). */
  period: ImpactPeriod | null;
  /** The people the viewer may show a list for: their own teammates, from the read model. */
  teammates: Teammate[];
  /** The teammate chosen in the address, with their Requests. Null when none is chosen, or the address named someone else. */
  person: { id: string; name: string; entries: MyWorkEntry[] } | null;
  /** The open tab, from the address (impact-href.ts). */
  tab: ImpactTab;
  /** Showing's value while a choice is on its way (Live): the person chosen, null for You. Defaults to `person`. */
  showing?: string | null;
  /** Admins and Members file Requests: they get New Request on an empty My work. */
  canFile?: boolean;
  onTabChange?: (tab: ImpactTab) => void;
  onPeriodChange?: (period: ImpactPeriod) => void;
  /** Called with a teammate's id, or null for You. */
  onPersonChange?: (personId: string | null) => void;
  /** Set for an Admin only (#209): where Quarter note edits go. The server refuses anyone else. */
  quarterNoteEditor?: QuarterNoteEditorTarget;
};

export function ImpactScreen({ dashboard, teammates, person, tab, showing = person?.id ?? null, canFile = false, onTabChange, onPeriodChange, onPersonChange, quarterNoteEditor = null }: ImpactScreenProps) {
  const report = dashboard.outcomeReport
  // Opened on the report, the page renders it on the server; otherwise its code follows the page (outcome-report-lazy.tsx).
  const [reportFirst] = useState(tab === "outcome-report")

  // Showing (#283, C4): You first, then the viewer's teammates. A choice swaps the list below in place.
  const picker = teammates.length > 0 && <div className={styles.showing}>
    <Select label="Showing" value={showing ?? YOU} onValueChange={value => onPersonChange?.(value === YOU ? null : value)}
      description="Lists show results only, never totals or rankings."
      options={[{ value: YOU, label: "You" }, ...teammates.map(teammate => ({ value: teammate.id, label: teammate.name }))]} />
  </div>

  const myWork = <div className={styles.myWork}>
    {picker}
    {person
      ? <section className={styles.personList} aria-labelledby="impact-person-heading">
        <h2 id="impact-person-heading" className={styles.heading}>Requests by {person.name}</h2>
        <TeammateWorkList name={person.name} entries={person.entries} />
      </section>
      : <MyWorkTab entries={dashboard.myWork.requests} canFile={canFile} chooseSomeone={!canFile && teammates.length > 0} />}
  </div>

  if (report === null) return <div className={styles.screen}>
    <section aria-label="My work">{myWork}</section>
  </div>

  return <div className={styles.screen}>
    <Tabs value={tab} onValueChange={value => { const next = impactTab(value); if (next) onTabChange?.(next) }}>
      <div className={styles.tablist}>
        <TabsList aria-label="Impact views">
          <TabsTrigger value="my-work">My work</TabsTrigger>
          <TabsTrigger value="outcome-report" onPointerEnter={preloadOutcomeReport} onFocus={preloadOutcomeReport}>Outcome report</TabsTrigger>
        </TabsList>
      </div>
      <TabsContent value="my-work" className={styles.panel}>{myWork}</TabsContent>
      <TabsContent value="outcome-report" className={styles.panel}>
        <LazyOutcomeReport openedFirst={reportFirst} report={report} onPeriodChange={onPeriodChange} quarterNoteEditor={quarterNoteEditor} />
      </TabsContent>
    </Tabs>
  </div>
}
