"use client";

import Link from "next/link";
import { useEffect, useEffectEvent, useState, type ReactNode } from "react";
import { Rows3 } from "lucide-react";
import { motion, type MotionStyle } from "motion/react";
import type { UserMenuWorkspaces } from "@/components/arc/user-menu/user-menu";
import { WorkspaceSidebar, type WorkspaceLinkProps } from "@/components/arc/blocks/workspace-sidebar/workspace-sidebar";
import { NewRequestLink } from "@/components/requests/new-request-link";
import { useRequestListView } from "@/components/requests/list-view-state";
import { parseRequestStatusFilter, requestListHref } from "@/lib/request-workspace";
import type { ProjectOption } from "@/lib/request-properties";
import type { WorkspaceSearchInput, WorkspaceSearchResponse } from "@/lib/workspace-search";
import { WorkspaceSearchPane } from "./workspace-search-pane";
import { SidebarControlsProvider, SidebarExpandButton } from "./sidebar-controls";
import { useSidebarResize } from "./use-sidebar-resize";
import { useSidebarPeek } from "./use-sidebar-peek";
import styles from "./workspace-shell.module.css";

export interface SidebarViewProps {
  children?: ReactNode;
  workspaceName: string;
  fullName: string;
  email: string;
  role: string;
  pathname: string;
  statusFilter: string;
  projectFilter?: string;
  projects?: ProjectOption[];
  projectsLoading?: boolean;
  projectsError?: string | null;
  onRetryProjects?: () => void | Promise<void>;
  onCreateProject?: (name: string) => Promise<ProjectOption>;
  notifications: ReactNode;
  compactNotifications?: ReactNode;
  onSignOut?: () => void | Promise<unknown>;
  onSearch?: (input: WorkspaceSearchInput) => Promise<WorkspaceSearchResponse>;
  workspaceSwitcher?: UserMenuWorkspaces;
  /** Collapses the sidebar at 880px and below; the expand control then opens it as a peek. Production enables it. */
  linearPreviewAutoCollapse?: boolean;
  /** Opt-in collapsible Projects folder; existing Project destinations stay flat. */
  previewProjectTree?: boolean;
}

const noProjects: ProjectOption[] = [];
const unavailableSearch = async (): Promise<WorkspaceSearchResponse> => ({ success: false, error: { code: "search_failed", message: "Search is unavailable in this preview." } });
function renderLink({ href, ...props }: WorkspaceLinkProps) {
  return href === "/intake" ? <NewRequestLink {...props} /> : <Link href={href} {...props} />;
}

/** Real Arc Pro workspace-sidebar, composed with Lane routes and authorized data. */
export function SidebarView({ children, workspaceName, fullName, email, role, pathname, statusFilter, projectFilter = "all", projects = noProjects, projectsLoading = false, projectsError, onRetryProjects, onCreateProject, notifications, compactNotifications, onSignOut, onSearch = unavailableSearch, workspaceSwitcher, linearPreviewAutoCollapse = false, previewProjectTree = false }: SidebarViewProps) {
  const switchingWorkspace = Boolean(workspaceSwitcher?.pendingId);
  const { shellRef, cssWidth, collapsed, autoCollapsed, resizing, phone, expand, separator, peekWidth } = useSidebarResize(switchingWorkspace, linearPreviewAutoCollapse, openAutoPeek);
  const { peeking, peekTop, dismiss: dismissPeek, show: showPeek, triggerEvents, panelEvents } = useSidebarPeek(collapsed && !resizing, switchingWorkspace);
  function openAutoPeek() {
    const triggers = [...(shellRef.current?.querySelectorAll<HTMLButtonElement>('button[aria-label="Expand sidebar"]') ?? [])];
    const trigger = triggers.find(button => button === document.activeElement && button.getClientRects().length > 0)
      ?? triggers.find(button => button.getClientRects().length > 0 && !button.closest("[hidden],[inert]"));
    showPeek(trigger);
  }
  const [, setListView] = useRequestListView();
  const [mobileOpen, setMobileOpen] = useState(false);
  const [searchOpen, setSearchOpen] = useState(false);
  const [searchVisited, setSearchVisited] = useState(false);
  const [previousLocation, setPreviousLocation] = useState(`${pathname}?${statusFilter}&${projectFilter}`);
  const location = `${pathname}?${statusFilter}&${projectFilter}`;
  if (location !== previousLocation) { setPreviousLocation(location); setSearchOpen(false); }
  function openSearch() {
    dismissPeek();
    setSearchVisited(true); setSearchOpen(true);
    if (searchOpen && !mobileOpen) document.querySelector<HTMLInputElement>('#lane-main input[type="search"]')?.focus();
  }
  function closeSearch(restoreFocus = true) {
    setSearchOpen(false);
    if (restoreFocus) requestAnimationFrame(() => {
      const selector = phone ? '[aria-label="Open navigation"]' : collapsed ? '[aria-label="Expand sidebar"]' : '[aria-label="Search workspace"]';
      document.querySelector<HTMLButtonElement>(`button${selector}`)?.focus({ preventScroll: true });
    });
  }
  function navigateFromSearch(href: string) {
    closeSearch(false);
    if (href.startsWith("/?project=")) setListView(current => ({ ...current, pagination: { ...current.pagination, pageIndex: 0 } }));
  }
  const searchShortcut = useEffectEvent((event: KeyboardEvent) => {
    const target = event.target instanceof HTMLElement ? event.target : null;
    if (event.key !== "/" || event.defaultPrevented || event.repeat || event.metaKey || event.ctrlKey || event.altKey || mobileOpen || switchingWorkspace || target?.isContentEditable || target?.closest('input,textarea,select,[role="dialog"],[role="menu"],[role="textbox"]')) return;
    event.preventDefault();
    openSearch();
  });
  useEffect(() => { const listener = (event: KeyboardEvent) => searchShortcut(event); window.addEventListener("keydown", listener); return () => window.removeEventListener("keydown", listener); }, []);
  const isRequests = pathname === "/" || pathname.startsWith("/requests/");
  const filter = parseRequestStatusFilter(statusFilter);
  const active = isRequests ? projectFilter === "all" ? "requests" : projectFilter : pathname;
  const project = projects.find(item => item.id === projectFilter);
  const section = pathname.startsWith("/settings/") ? "Settings" : pathname === "/intake" ? "Intake" : project?.name ?? (projectFilter === "none" ? "No Project" : "Requests");
  const page = pathname === "/settings/profile" ? "Profile" : pathname === "/settings/members" ? "Members" : pathname.startsWith("/requests/") ? "Request detail" : null;
  const groups = [
    { id: "workspace", name: workspaceName, items: [
      { id: "requests", name: role === "guest" ? "My Requests" : "All Requests", href: "/", icon: <Rows3 size={16} strokeWidth={1.75} /> },
    ] },
  ];
  return <SidebarControlsProvider collapsed={collapsed} peeking={peeking} expand={() => { if (!autoCollapsed) dismissPeek(); expand(); }} {...triggerEvents}><motion.div ref={shellRef} className={styles.shell} style={{ "--sidebar-width": cssWidth, "--sidebar-peek-width": `${peekWidth}px`, "--sidebar-peek-top": `${peekTop}px` } as MotionStyle} data-workspace-shell data-resizing={resizing || undefined} data-linear-preview-auto-collapse={linearPreviewAutoCollapse || undefined}>
    {switchingWorkspace && <span className="sr-only" role="status">Switching workspace…</span>}
    <a href="#lane-main" className={styles.skip}>Skip to content</a>
    <aside id="lane-sidebar" className={styles.navigation} aria-label="Workspace sidebar" inert={switchingWorkspace || (collapsed && !peeking)} data-collapsed={collapsed || undefined} data-peeking={peeking || undefined} {...panelEvents}>
      <div className={styles.sidebarPanel} onClickCapture={event => { if (event.target instanceof Element && event.target.closest("a[href]")) dismissPeek(); }}>
      <WorkspaceSidebar className={styles.sidebar} layoutManaged forceDesktopLayout={linearPreviewAutoCollapse} projectTree={previewProjectTree} workspace={{ id: "current", name: workspaceName, initial: workspaceName.trim().slice(0, 1).toUpperCase() || "L" }}
        user={{ name: fullName, email }} settingsHref="/settings/profile" membersHref={role === "guest" ? undefined : "/settings/members"} onSignOut={onSignOut}
        groups={groups} projects={[...projects.map(item => ({ ...item, href: requestListHref(filter, item.id) })), { id: "none", name: "No Project", href: requestListHref(filter, "none") }]}
        activeId={searchOpen ? "search" : active} currentPage={searchOpen ? "Search" : page ?? section} loading={projectsLoading} error={projectsError} onRetry={onRetryProjects}
        onSearch={openSearch} searchActive={searchOpen}
        workspaces={workspaceSwitcher ?? { items: [{ id: "current", name: workspaceName }], currentId: "current", onSelect: () => {} }}
        onCreateProject={onCreateProject ? async name => { const created = await onCreateProject(name); return { ...created, href: requestListHref("all", created.id) }; } : undefined}
        onNavigate={({ id }) => {
          dismissPeek();
          closeSearch(false);
          if (id === "requests" || id === "none" || projects.some(item => item.id === id)) {
            setListView(current => ({ ...current, pagination: { ...current.pagination, pageIndex: 0 } }));
          }
        }}
        renderLink={renderLink} notifications={notifications} compactNotifications={compactNotifications} onMobileOpenChange={setMobileOpen} />
      </div>
    </aside>
    <div {...separator} className={styles.resizeHandle} />
    <main id="lane-main" tabIndex={-1} className={styles.main} inert={mobileOpen || switchingWorkspace} aria-busy={switchingWorkspace || undefined} onPointerDownCapture={() => { if (peeking) dismissPeek(); }}>
      {pathname !== "/" && !searchOpen && <header className={styles.topbar}><SidebarExpandButton /><nav aria-label="Breadcrumb" className={styles.crumbs}><ol>
        <li><Link href="/" title={workspaceName}>{workspaceName}</Link></li>
        <li>{page ? <Link href={isRequests ? requestListHref(filter, projectFilter) : "/settings/profile"}>{section}</Link> : <span aria-current="page">{section}</span>}</li>
        {page && <li aria-current="page">{page}</li>}
      </ol></nav></header>}
      <div className={styles.content} hidden={searchOpen}>{children}</div>
      {searchVisited && <WorkspaceSearchPane active={searchOpen && !mobileOpen} onSearch={onSearch} onClose={closeSearch} onNavigate={navigateFromSearch} />}
    </main>
  </motion.div></SidebarControlsProvider>;
}
