"use client";

import Link from "next/link";
import { useCallback, useEffect, useEffectEvent, useMemo, useState, type CSSProperties, type MouseEvent, type ReactNode } from "react";
import { Rows3 } from "lucide-react";
import type { UserMenuWorkspaces } from "@/components/arc/user-menu/user-menu";
import { WorkspaceSidebar, type WorkspaceLinkProps } from "@/components/arc/blocks/workspace-sidebar/workspace-sidebar";
import { NewRequestLink } from "@/components/requests/new-request-link";
import { ListAnnouncerProvider } from "@/components/requests/list-announcer";
import { useRequestListContext, useSetRequestListView, withListContext } from "@/components/requests/list-view-state";
import { parseRequestStatusFilter, requestListContextFromHref, requestListHref } from "@/lib/request-workspace";
import type { ProjectOption } from "@/lib/request-constants";
import type { WorkspaceSearchInput, WorkspaceSearchResponse } from "@/lib/workspace-search";
import { WorkspaceSearchPane } from "./workspace-search-pane";
import { SidebarControlsProvider, SidebarExpandButton } from "./sidebar-controls";
import { PageStripProvider, type PageStripCrumb } from "./page-strip";
import { useSidebarResize } from "./use-sidebar-resize";
import { useSidebarPeek } from "./use-sidebar-peek";
import { KeyboardShortcuts } from "./keyboard-shortcuts";
import styles from "./workspace-shell.module.css";

export interface SidebarViewProps {
  children?: ReactNode;
  workspaceName: string;
  fullName: string;
  email: string;
  role: string;
  pathname: string;
  /** The URL status view. Read only without the list view provider (fixtures); the layout state wins (plan item 1.7). */
  statusFilter?: string;
  projectFilter?: string;
  projects?: ProjectOption[];
  projectsLoading?: boolean;
  projectsError?: string | null;
  onRetryProjects?: () => void | Promise<void>;
  onCreateProject?: (name: string) => Promise<ProjectOption>;
  notifications: ReactNode;
  /** No longer read: one bell instance serves both the panel and the rail (plan item 1.8, 2026-10-10). Kept so existing fixtures type-check. */
  compactNotifications?: ReactNode;
  onSignOut?: () => void | Promise<unknown>;
  onSearch?: (input: WorkspaceSearchInput) => Promise<WorkspaceSearchResponse>;
  workspaceSwitcher?: UserMenuWorkspaces;
}

const noProjects: ProjectOption[] = [];
const unavailableSearch = async (): Promise<WorkspaceSearchResponse> => ({ success: false, error: { code: "search_failed", message: "Search is unavailable in this preview." } });
const isPlainClick = (event: MouseEvent) => event.button === 0 && !event.metaKey && !event.ctrlKey && !event.shiftKey && !event.altKey;
// Plan item 2.0: each page's strip carries the expand control, so phones keep a way into navigation.
const expandButton = <SidebarExpandButton />;

/** Real Arc Pro workspace-sidebar, composed with Lane routes and authorized data. */
export function SidebarView({ children, workspaceName, fullName, email, role, pathname, statusFilter, projectFilter: urlProjectFilter = "all", projects = noProjects, projectsLoading = false, projectsError, onRetryProjects, onCreateProject, notifications, onSignOut, onSearch = unavailableSearch, workspaceSwitcher }: SidebarViewProps) {
  const switchingWorkspace = Boolean(workspaceSwitcher?.pendingId);
  const { shellRef, layoutWidth, motion, collapsed, autoCollapsed, resizing, phone, expand, separator, peekWidth } = useSidebarResize(switchingWorkspace, true, openAutoPeek);
  // No peek while the panel slides (plan item 2.4).
  const { peeking, peekTop, dismiss: dismissPeek, show: showPeek, triggerEvents, panelEvents } = useSidebarPeek(collapsed && !resizing && !motion, switchingWorkspace);
  function openAutoPeek() {
    const triggers = [...(shellRef.current?.querySelectorAll<HTMLButtonElement>('button[aria-label="Expand sidebar"]') ?? [])];
    const trigger = triggers.find(button => button === document.activeElement && button.getClientRects().length > 0)
      ?? triggers.find(button => button.getClientRects().length > 0 && !button.closest("[hidden],[inert]"));
    showPeek(trigger);
  }
  // Plan items 1.7 and 1.14: the list context comes from the layout's list
  // view state (the URL only mirrors it on "/"), and the sidebar subscribes to
  // that context and the setter only, so typing in the list filter does not
  // re-render it. Fixtures without the provider fall back to the props.
  const setListView = useSetRequestListView();
  const listContext = useRequestListContext();
  const filter = listContext?.status ?? parseRequestStatusFilter(statusFilter);
  const projectFilter = listContext?.project ?? urlProjectFilter;
  // Already on "/", a plain click on a Requests list link (All Requests, a
  // Project, No Project) changes the view in place with no request; the URL
  // follows through history.replaceState. onNavigate has already set the
  // context. Modified clicks and every other route keep navigating.
  const renderLink = useCallback(({ href, onClick, ...props }: WorkspaceLinkProps) => {
    if (href === "/intake") return <NewRequestLink {...props} onClick={onClick} />;
    return <Link href={href} {...props} onClick={event => {
      onClick?.(event);
      if (event.defaultPrevented || pathname !== "/" || !isPlainClick(event) || typeof href !== "string" || !requestListContextFromHref(href)) return;
      event.preventDefault();
    }} />;
  }, [pathname]);
  const [mobileOpen, setMobileOpen] = useState(false);
  const [searchOpen, setSearchOpen] = useState(false);
  const [searchVisited, setSearchVisited] = useState(false);
  const [previousLocation, setPreviousLocation] = useState(`${pathname}?${filter}&${projectFilter}`);
  const location = `${pathname}?${filter}&${projectFilter}`;
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
    const target = requestListContextFromHref(href);
    if (target) setListView(current => withListContext(current, target));
  }
  const searchShortcut = useEffectEvent((event: KeyboardEvent) => {
    if (pathname.startsWith("/settings/")) return;
    const target = event.target instanceof HTMLElement ? event.target : null;
    if (event.key !== "/" || event.defaultPrevented || event.repeat || event.metaKey || event.ctrlKey || event.altKey || mobileOpen || switchingWorkspace || target?.isContentEditable || target?.closest('input,textarea,select,[role="dialog"],[role="menu"],[role="textbox"]')) return;
    event.preventDefault();
    openSearch();
  });
  useEffect(() => { const listener = (event: KeyboardEvent) => searchShortcut(event); window.addEventListener("keydown", listener); return () => window.removeEventListener("keydown", listener); }, []);
  const isRequests = pathname === "/" || pathname.startsWith("/requests/");
  const active = isRequests ? projectFilter === "all" ? "requests" : projectFilter : pathname;
  const project = projects.find(item => item.id === projectFilter);
  const section = pathname.startsWith("/settings/") ? "Settings" : pathname === "/intake" ? "New Request" : project?.name ?? (projectFilter === "none" ? "No Project" : "Requests");
  const page = pathname === "/settings/profile" ? "Profile" : pathname === "/settings/members" ? "Members" : pathname.startsWith("/requests/") ? "Request detail" : null;
  // Plan item 2.0: the ancestors the topbar used to show. Each page's strip adds
  // its own name as the current crumb. Memoised, so typing in the list filter
  // does not re-render the strips (plan item 1.14).
  const listHref = requestListHref(filter, projectFilter);
  const trail = useMemo<PageStripCrumb[]>(() => pathname === "/" ? [] : [
    { label: workspaceName, href: "/" },
    ...(pathname.startsWith("/requests/") ? [{ label: section, href: listHref }]
      : pathname.startsWith("/settings/") ? [{ label: "Settings", href: "/settings/profile" }] : []),
  ], [pathname, workspaceName, section, listHref]);
  const frame = useMemo(() => ({ trail, expand: expandButton, link: Link }), [trail]);
  const groups = [
    { id: "workspace", name: workspaceName, items: [
      { id: "requests", name: role === "guest" ? "My Requests" : "All Requests", href: "/", icon: <Rows3 strokeWidth={1.75} /> },
    ] },
  ];
  // Settings has its own Arc navigation and search. Preserve all workspace state
  // above this boundary so returning to Requests restores the same view.
  if (pathname.startsWith("/settings/")) return <PageStripProvider value={frame}><main id="lane-main" tabIndex={-1}>{children}</main></PageStripProvider>;
  // Plan item 2.4: the content's width (--sidebar-width) changes once per toggle while the panel slides;
  // the strips keep their expand control until an expand ends, so it leaves with the width change.
  // Pinning a visible peek keeps the panel where it already is, with no slide.
  // Plan item 2.7 (decision D6): the shell hosts the one polite region, so the bell, the list and detail all speak through it;
  // the page providers pass through. The region sits inside the shell element, as the page's did inside the page.
  return <SidebarControlsProvider collapsed={collapsed || motion === "expanding"} peeking={peeking} expand={() => { const fromPeek = peeking; if (!autoCollapsed) dismissPeek(); expand(fromPeek); }} {...triggerEvents}><div ref={shellRef} className={styles.shell} style={{ "--sidebar-width": `${layoutWidth}px`, "--sidebar-peek-width": `${peekWidth}px`, "--sidebar-peek-top": `${peekTop}px` } as CSSProperties} data-workspace-shell data-resizing={resizing || undefined} data-linear-preview-auto-collapse="true"><ListAnnouncerProvider>
    {switchingWorkspace && <span className="sr-only" role="status">Switching workspace…</span>}
    <a href="#lane-main" className={styles.skip}>Skip to content</a>
    <aside id="lane-sidebar" className={styles.navigation} aria-label="Workspace sidebar" inert={switchingWorkspace || (collapsed && !peeking)} data-collapsed={collapsed || undefined} data-peeking={peeking || undefined} data-motion={motion ?? undefined} {...panelEvents}>
      <div className={styles.sidebarPanel} data-sidebar-panel="" onClickCapture={event => { if (isPlainClick(event) && event.target instanceof Element && event.target.closest("a[href]")) dismissPeek(); }}>
      <WorkspaceSidebar className={styles.sidebar} layoutManaged forceDesktopLayout projectTree workspace={{ id: "current", name: workspaceName, initial: workspaceName.trim().slice(0, 1).toUpperCase() || "L" }}
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
            // A new Project moves to the first page; choosing the current one also returns there.
            setListView(current => { const next = withListContext(current, { project: id === "requests" ? "all" : id }); return next !== current || !current.pagination.pageIndex ? next : { ...current, pagination: { ...current.pagination, pageIndex: 0 } }; });
          }
        }}
        renderLink={renderLink} notifications={notifications} onMobileOpenChange={setMobileOpen} />
      </div>
    </aside>
    <div {...separator} className={styles.resizeHandle} />
    <main id="lane-main" tabIndex={-1} className={styles.main} inert={mobileOpen || switchingWorkspace} aria-busy={switchingWorkspace || undefined} onPointerDownCapture={() => { if (peeking) dismissPeek(); }}>
      <PageStripProvider value={frame}><div className={styles.content} hidden={searchOpen}>{children}</div></PageStripProvider>
      {searchVisited && <WorkspaceSearchPane active={searchOpen && !mobileOpen} onSearch={onSearch} onClose={closeSearch} onNavigate={navigateFromSearch} />}
    </main>
    {/* Plan item 2.4: `?` lists the shortcuts on every authenticated page. */}
    <KeyboardShortcuts />
  </ListAnnouncerProvider></div></SidebarControlsProvider>;
}
