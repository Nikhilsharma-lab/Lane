"use client";

import Link from "@/components/link";
import { useSearchParams } from "next/navigation";
import { ArrowLeft, Search } from "lucide-react";
import { Skeleton } from "@/components/arc/skeleton/skeleton";
import { KeyCap } from "@/components/keyboard/key-caps";
import { Placeholder } from "@/components/loading/placeholder";
import { settingsCatalog, settingsNavigation } from "./settings-catalog";
import styles from "./settings.module.css";

/** Rows per group, as each section draws them: the placeholder takes the shape of what is opening. */
const SHAPES: Record<string, number[]> = {
  profile: [4], preferences: [1], "inbox-delivery": [3], "account-security": [2], workspace: [4],
  members: [4, 2], metrics: [5], slack: [2], billing: [3, 1], "coming-soon": [3, 3],
};
// Every section the frame can open, with its heading; "coming-soon" collects the planned ones.
const SECTIONS = settingsNavigation("admin");

/**
 * #288 (D22): Settings while a page loads. The header keeps its back arrow and search, the heading names the section
 * that is opening (the address's `section` when it names one, else the page's own `section`), and the placeholders
 * are that section's row groups, on Build 2's placeholder timing (`Placeholder`). Nothing moves when the page arrives.
 */
export function SettingsLoading({ section, label }: { section: string; label: string }) {
  const asked = useSearchParams()?.get("section");
  const planned = settingsCatalog.find(entry => entry.id === asked)?.soon;
  const id = planned ? "coming-soon" : SECTIONS.some(entry => entry.id === asked) ? asked! : section;
  const title = SECTIONS.find(entry => entry.id === id)?.label ?? "Settings";
  return <div className={styles.frame} aria-busy="true">
    <header className={styles.header}>
      <div className={styles.heading}><Link href="/" className={styles.back} aria-label="Back to Requests"><ArrowLeft aria-hidden="true" /></Link><h1>Settings</h1></div>
      <button className={styles.searchTrigger} type="button" disabled aria-keyshortcuts="/"><Search aria-hidden="true" /><span>Search settings</span><KeyCap className={styles.searchKey}>/</KeyCap></button>
    </header>
    <aside className={styles.sidebar}>
      <Placeholder><div className={styles.loadingNav} aria-hidden="true">{[0, 1, 2, 3, 4, 5].map(index => <span key={index} />)}</div></Placeholder>
    </aside>
    <div className={styles.content}><div className={styles.page}>
      <section className={styles.section}>
        <header className={styles.sectionHead}><h2>{title}</h2></header>
        <Placeholder><div className={styles.loadingGroups}>
          <Skeleton label={label} lines={1} className={styles.loadingPurpose} />
          {(SHAPES[id] ?? [3]).map((rows, group) => <div key={group} className={styles.group} aria-hidden="true">
            <span className={styles.loadingLabel} />
            <div className={styles.groupBox}>{Array.from({ length: rows }, (_, row) => <div key={row} className={styles.groupRow}><Skeleton lines={2} /><span className={styles.loadingControl} /></div>)}</div>
          </div>)}
        </div></Placeholder>
      </section>
    </div></div>
  </div>;
}
