"use client";
// Arc Pro source (https://uiarc.dev): navigation/search composition adapted from settings-command.
// Used as part of Lane under the Arc Pro license, not this repository's license; not for reuse outside Lane.

import Link from "next/link";
import { useCallback, useEffect, useId, useMemo, useRef, useState, useSyncExternalStore, type ReactNode } from "react";
import { AnimatePresence, LayoutGroup, m, useReducedMotion } from "motion/react";
import { ArrowLeft, Search, UserRound, Palette, ShieldCheck, Building2, Users, Clock, ChartLine, Mail, MessageSquare, CreditCard } from "lucide-react";
import { SettingsCommandPalette, relativeRect, type Rect, type Closing, type Result } from "@/components/arc/blocks/settings-command/settings-command";
import { motionTokens } from "@/components/arc/lib/motion-tokens";
import { WorkspaceIdentifier } from "./workspace-identifier";
import { Badge } from "@/components/arc/badge/badge";
import { settingsHref, settingsNavigation, searchSettings, settingsEntries, SETTINGS_SECTION_EVENT as sectionEvent, showSettingsSection, showsSettingsInPlace, settingsSectionAt } from "./settings-catalog";
import { SettingsCard } from "./settings-card";
import { FutureSettings } from "./coming-soon-panel";
import type { WorkspacePermission } from "@/lib/auth-guard";
import { ROLE_NAMES } from "@/lib/role-rules";
import styles from "./settings.module.css";
import { KeyCap } from "@/components/keyboard/key-caps";

function subscribe(listener: () => void) {
  window.addEventListener("popstate", listener);
  window.addEventListener(sectionEvent, listener);
  return () => { window.removeEventListener("popstate", listener); window.removeEventListener(sectionEvent, listener); };
}
const snapshot = () => new URLSearchParams(window.location.search).get("section")
  || settingsSectionAt(window.location.pathname)
  || (window.location.pathname === "/settings/members" ? "members" : "profile");

/** / opens Settings search; ⌘K and Ctrl K are left to the app's command palette (issue #101). */
export function opensSettingsSearch(event: { key: string; metaKey: boolean; ctrlKey: boolean; altKey: boolean }, typing: boolean) {
  return event.key === "/" && !typing && !event.metaKey && !event.ctrlKey && !event.altKey;
}

export type SettingsCommandAdapterProps = {
  membership: string; workspaceName: string; workspaceId?: string; initialSection?: string; page?: "profile" | "members" | "metrics";
  account?: ReactNode; role?: ReactNode; appearance?: ReactNode; security?: ReactNode; members?: ReactNode; workspaceManagement?: ReactNode;
  /** Rendered only by the Metrics page (/settings/metrics), which loads the library. */
  metrics?: ReactNode;
  /** #206 Inbox delivery: the person's choice for this workspace (Members and Admins). */
  delivery?: ReactNode;
  /** #207 Slack: the workspace's Slack connection (Admins only; pages render nothing for anyone else). */
  slack?: ReactNode;
  /** #213 Billing: the workspace's Free Requests left (Admins only; pages render nothing for anyone else). */
  billing?: ReactNode;
};

/** Arc SettingsCommand frame, section navigation and search composition; Lane supplies permission-filtered rows and immediate saves. */
export function SettingsCommandAdapter({ membership, workspaceName, workspaceId, initialSection = "profile", page = "profile", account, role, appearance, security, members, workspaceManagement, metrics, delivery, slack, billing }: SettingsCommandAdapterProps) {
  const section = useSyncExternalStore(subscribe, snapshot, () => initialSection);
  const entries = useMemo(() => settingsEntries(membership), [membership]);
  const nav = useMemo(() => settingsNavigation(membership), [membership]);
  const requested = entries.find(entry => entry.id === section);
  const resolvedSection = requested?.soon ? "coming-soon" : section;
  const selected = nav.find(e => e.id === resolvedSection) ?? nav[0];
  const current = selected.id;
  // #258: Members' content (and Clerk's member list) mounts the first time Members is shown, however it is
  // reached (its own page, an in-place switch or a search result), then stays mounted for the visit.
  const [membersShown, setMembersShown] = useState(current === "members");
  if (current === "members" && !membersShown) setMembersShown(true);
  const icons = { profile: UserRound, preferences: Palette, "account-security": ShieldCheck, workspace: Building2, members: Users, metrics: ChartLine, "inbox-delivery": Mail, slack: MessageSquare, billing: CreditCard, "coming-soon": Clock };
  const uid = useId();
  const reduce = !!useReducedMotion();
  const frame = useRef<HTMLDivElement>(null);
  const content = useRef<HTMLElement>(null);
  const trigger = useRef<HTMLButtonElement>(null);
  const destination = useRef<string | null>(null);
  const [palette, setPalette] = useState<{ origin: Rect; width: number } | null>(null);
  const [closing, setClosing] = useState<Closing>(null);
  const [query, setQuery] = useState("");
  const [active, setActive] = useState(0);
  const results = useMemo(() => searchSettings(entries, query), [entries, query]);
  const suggestions = useMemo(() => searchSettings(entries, ""), [entries]);

  function select(id: string) {
    showSettingsSection(id);
    content.current?.scrollTo({ top: 0 });
  }
  function focusDestination() {
    const target = destination.current;
    destination.current = null;
    const node = target ? document.getElementById(target) : null;
    (node?.querySelector<HTMLElement>("input:not(:disabled),button:not(:disabled),[tabindex]:not(:disabled)") ?? node ?? content.current?.querySelector<HTMLElement>("h1"))?.focus({ preventScroll: true });
    node?.scrollIntoView({ block: "center", behavior: reduce ? "instant" : "smooth" });
  }
  useEffect(() => {
    // Restore focus to the destination once the search overlay is removed.
    if (!palette && destination.current) focusDestination();
  });
  function openPalette() {
    if (!frame.current || !trigger.current) return;
    destination.current = null;
    setQuery(""); setActive(0); setClosing(null);
    setPalette({ origin: relativeRect(trigger.current, frame.current), width: frame.current.clientWidth });
  }
  function closePalette() {
    if (!frame.current || !trigger.current) return;
    destination.current = null;
    setClosing({ to: relativeRect(trigger.current, frame.current), mode: "trigger" });
  }
  const onClosed = useCallback(() => {
    setPalette(null); setClosing(null);
    if (!destination.current) requestAnimationFrame(() => trigger.current?.focus({ preventScroll: true }));
  }, []);
  function pick(result: Result) {
    // A section with its own page (Metrics) loads there; every other section shows in place.
    const href = settingsHref(result.def.section);
    if (!showsSettingsInPlace(href, window.location.pathname)) { window.location.assign(href); return; }
    destination.current = result.def.target ?? `settings-${result.def.section}`;
    select(result.def.section);
    if (frame.current && trigger.current) setClosing({ to: relativeRect(trigger.current, frame.current), mode: "row" });
  }
  useEffect(() => {
    content.current?.scrollTo({ top: 0 });
    const target = window.location.hash.slice(1);
    if (entries.some(entry => entry.target === target && entry.section === selected.id)) {
      document.getElementById(target)?.scrollIntoView({ block: "center" });
    }
  }, [entries, page, selected.id]);

  const panels: Record<string, ReactNode> = {
    profile: <>{account}<div id="role" tabIndex={-1}>{role}</div></>,
    preferences: <div id="theme" tabIndex={-1}>{appearance}</div>,
    "account-security": security,
    workspace: <><SettingsCard title="Workspace details" description="Your current workspace and membership." footer="Workspace access is separate from your profile role."><div className={styles.rows}><div className={styles.row}><strong>Workspace name</strong><span className={styles.value}>{workspaceName}</span></div><div className={styles.row}><strong>Your access</strong><Badge>{ROLE_NAMES[membership as WorkspacePermission] ?? "Member"}</Badge></div>{workspaceId && <WorkspaceIdentifier value={workspaceId} />}</div></SettingsCard>{workspaceManagement}</>,
    members: membersShown ? members : null,
    metrics,
    "inbox-delivery": delivery,
    slack,
    billing,
    "coming-soon": <FutureSettings entries={entries.filter(entry => entry.soon)} />,
  };

  return <div ref={frame} className={styles.frame} data-settings-frame onKeyDown={event => {
    const target = event.target as HTMLElement;
    if (event.defaultPrevented || event.repeat || target.closest('[role="dialog"]')) return;
    const typing = target.isContentEditable || target.closest('input,textarea,select,[role="textbox"]');
    if (opensSettingsSearch(event, !!typing)) {
      event.preventDefault(); event.stopPropagation(); openPalette();
    }
  }}>
    <header className={styles.header} inert={!!palette}>
      <div className={styles.heading}><Link href="/" className={styles.back} aria-label="Back to Requests"><ArrowLeft aria-hidden="true" /></Link><h1>Settings</h1></div>
      <button ref={trigger} className={styles.searchTrigger} type="button" onClick={openPalette} aria-haspopup="dialog" aria-keyshortcuts="/"><Search aria-hidden="true" /><span>Search settings</span><KeyCap className={styles.searchKey}>/</KeyCap></button>
    </header>
    <aside className={styles.sidebar} inert={!!palette}>
      <nav aria-label="Settings" className={styles.navigation}><LayoutGroup id={`${uid}-nav`}>{[...new Set(nav.map(entry => entry.group))].map(group => <div key={group} className={styles.navGroup}><h2 className={styles.navGroupTitle}>{group}</h2><ul>
        {nav.filter(entry => entry.group === group).map(entry => { const Icon = icons[entry.id as keyof typeof icons]; return <li key={entry.id}>
          <Link className={styles.navItem} data-pressable="" href={settingsHref(entry.id)} aria-current={current === entry.id ? "page" : undefined}
            onClick={event => {
              if (event.button || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
              // A section with its own page is a real navigation from anywhere else.
              if (!showsSettingsInPlace(settingsHref(entry.id), window.location.pathname)) return;
              event.preventDefault(); select(entry.id);
            }}>
            {current === entry.id && <m.span className={styles.navHighlight} layoutId="selection" transition={reduce ? { duration: 0 } : motionTokens.spring.morph} aria-hidden="true" />}
            <Icon aria-hidden="true" /><span>{entry.label}</span>
          </Link>
        </li>; })}
      </ul></div>)}</LayoutGroup></nav>
      <div className={styles.workspaceFooter}>{workspaceName}</div>
    </aside>
    <section ref={content} className={styles.content} inert={!!palette} tabIndex={0} role="region" aria-label="Settings content">
      <div className={styles.page}>
        {nav.map(entry => <section key={entry.id} id={`settings-${entry.id}`} hidden={selected.id !== entry.id} className={styles.section} tabIndex={-1} aria-labelledby={`${uid}-${entry.id}`}>
          <header className={styles.sectionHead}><h2 id={`${uid}-${entry.id}`}>{entry.label}</h2><p>{entry.description}</p></header>
          {panels[entry.id]}
        </section>)}
      </div>
    </section>
    <AnimatePresence>{palette && <m.div className={styles.scrim} onPointerDown={closePalette} initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} aria-hidden="true" />}</AnimatePresence>
    {palette && <SettingsCommandPalette uid={uid} origin={palette.origin} frameWidth={palette.width} closing={closing} onClosed={onClosed} query={query} onQuery={setQuery} results={results} suggestions={suggestions} active={active} onActive={setActive} onPick={pick} onClose={closePalette} reduce={reduce} />}
  </div>;
}
