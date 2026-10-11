"use client";

import { createContext, useContext, type ElementType, type ReactNode } from "react";
import styles from "./page-strip.module.css";

/** One ancestor in the strip's trail. */
export type PageStripCrumb = { label: string; href: string };
type PageStripFrame = {
  trail: readonly PageStripCrumb[];
  expand: ReactNode;
  /** The shell's client link (next/link) for the trail. */
  link: ElementType<{ href: string; title: string; children: ReactNode }>;
};

const PageStripContext = createContext<PageStripFrame | null>(null);

/** The shell supplies the trail, its link component and the expand control, so
 * this file depends only on React and its CSS module. The root boundaries render
 * the strip with no provider (no trail, no expand control) and so never ship a
 * copy of next/link or the shell in every route's first load. */
export function PageStripProvider({ value, children }: { value: PageStripFrame; children: ReactNode }) {
  return <PageStripContext value={value}>{children}</PageStripContext>;
}

export interface PageStripProps {
  /** The current page. A string, except in skeletons, which pass an Arc Skeleton while the name is unknown. */
  title: ReactNode;
  /** Renders the title as the page h1 (list, ProjectUnavailable, error and not-found frames). Pages whose h1 is in the content leave it off. */
  heading?: boolean;
  /** One quiet line after the title, hidden at 640px and below (the list's guest hint). */
  note?: string;
  /** Before the crumbs: a back or close link (Request detail). */
  leading?: ReactNode;
  /** Right-aligned before the action: small buttons and read-only state. */
  tools?: ReactNode;
  /** The one action slot: one filled Button or link, or one quiet line saying who owes the next step (2.5). */
  action?: ReactNode;
  /** An Arc DropdownMenu. Pass it only when it has items; nothing renders otherwise. */
  overflow?: ReactNode;
}

/** Plan item 2.0: each page owns one 44px strip. Crumbs, tools, one action
 * slot and overflow; skeletons render the same strip. */
export function PageStrip({ title, heading = false, note, leading, tools, action, overflow }: PageStripProps) {
  const frame = useContext(PageStripContext);
  const trail = frame?.trail ?? [];
  const CrumbLink = frame?.link ?? "a";
  const Current = heading ? "h1" : "span";
  const label = typeof title === "string" ? title : undefined;
  return <header className={styles.strip} data-slot="page-strip">
    <span className={styles.expandSlot}>{frame?.expand}</span>
    {leading}
    {trail.length > 0
      ? <nav aria-label="Breadcrumb" className={styles.crumbs}><ol>
        {trail.map((crumb, index) => <li key={index}><CrumbLink href={crumb.href} title={crumb.label}>{crumb.label}</CrumbLink></li>)}
        <li aria-current="page"><Current className={styles.current} title={label}>{title}</Current></li>
      </ol></nav>
      : <Current className={styles.title} title={label}>{title}</Current>}
    {note && <p className={styles.note} title={note}>{note}</p>}
    {(tools || action || overflow) && <div className={styles.end}>
      {tools && <div className={styles.tools}>{tools}</div>}
      {action && <div className={styles.action}>{action}</div>}
      {overflow}
    </div>}
  </header>;
}
