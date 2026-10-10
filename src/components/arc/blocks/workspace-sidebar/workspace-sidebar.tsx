"use client";

import Link from "next/link";
// Licensed Arc Pro workspace-sidebar. Lane data/route adapters are documented in arc-sources.md.
// Arc Pro source (https://uiarc.dev), used under the Arc Pro license as part of the Lane app.
// It is not covered by any license of this repository and may not be reused outside Lane.
import { useEffect, useEffectEvent, useId, useRef, useState, useSyncExternalStore, type ComponentProps, type FormEvent, type KeyboardEvent, type MouseEvent as ReactMouseEvent, type PointerEvent as ReactPointerEvent, type ReactElement, type ReactNode, type RefObject } from "react";
import { createPortal } from "react-dom";
import * as TooltipPrimitive from "@radix-ui/react-tooltip";
import { AnimatePresence, LayoutGroup, animate, motion, useMotionValue, useReducedMotion, useTransform, type TargetAndTransition, type Transition } from "motion/react";
import { Check, ChevronRight, Folder, LoaderCircle, Plus, Search, Settings, SquarePen, UsersRound, X } from "lucide-react";
import { Button } from "../../button/button";
import { UserMenu, type UserMenuWorkspaces } from "../../user-menu/user-menu";
import { ProjectContextMenu } from "@/components/shell/project-context-menu";
import { motionTokens } from "../../lib/motion-tokens";
import dotStyles from "@/components/projects/project-dot.module.css";
import { projectToneForId } from "@/lib/project-tone";
import styles from "./workspace-sidebar.module.css";

export type WorkspaceNavigationItem = { id: string; name: string; href: string; icon?: ReactNode };
export type WorkspaceNavigationGroup = { id: string; name: string; items: WorkspaceNavigationItem[] };
export type WorkspaceProject = { id: string; name: string; href: string };
type Workspace = { id: string; name: string; initial: string };
export type WorkspaceLinkProps = ComponentProps<typeof Link>;

function NavigationLink({ renderLink, ...props }: WorkspaceLinkProps & { renderLink?: (props: WorkspaceLinkProps) => ReactElement }) {
  return renderLink ? renderLink(props) : <Link {...props} />;
}

export interface WorkspaceSidebarProps {
  className?: string;
  /** Lane shell owns desktop width and full collapse via its pane edge. */
  layoutManaged?: boolean;
  /** Keep the managed desktop column for an opt-in compact preview. */
  forceDesktopLayout?: boolean;
  /** Opt-in Docs-sidebar folder treatment around the existing flat Project links. */
  projectTree?: boolean;
  workspace: Workspace;
  user: { name: string; email: string };
  settingsHref: string;
  membersHref?: string;
  onSignOut?: () => void | Promise<unknown>;
  projects: WorkspaceProject[];
  groups: WorkspaceNavigationGroup[];
  activeId: string;
  currentPage: string;
  loading?: boolean;
  error?: string | null;
  onRetry?: () => void | Promise<void>;
  onCreateProject?: (name: string) => Promise<WorkspaceProject>;
  onNavigate?: (target: { workspace: string; id: string; name: string }) => void;
  defaultCollapsed?: boolean;
  onCollapsedChange?: (collapsed: boolean) => void;
  onMobileOpenChange?: (open: boolean) => void;
  renderLink?: (props: WorkspaceLinkProps) => ReactElement;
  notifications?: ReactNode;
  compactNotifications?: ReactNode;
  onSearch?: () => void;
  searchActive?: boolean;
  workspaces?: UserMenuWorkspaces;
}

const { spring, duration, ease, blur } = motionTokens;
const enter = [...ease.enter] as [number, number, number, number];
const standard = [...ease.standard] as [number, number, number, number];
const instant: Transition = { duration: 0 };
// Licensed Arc Docs sidebar fold. Keep mounted so the existing Project links and menus retain identity.
const projectFolded: TargetAndTransition = { height: 0, opacity: 0, overflow: "hidden" };
const projectUnfold: TargetAndTransition = { height: "auto", opacity: 1, transitionEnd: { overflow: "visible" }, transition: { height: spring.smooth, opacity: { duration: .22, delay: .04, ease: standard } } };
const projectFold: TargetAndTransition = { ...projectFolded, transition: { height: spring.smooth, opacity: { duration: .14, ease: standard } } };
const projectUnfoldStill: TargetAndTransition = { height: "auto", opacity: 1, transitionEnd: { overflow: "visible" }, transition: instant };
const projectFoldStill: TargetAndTransition = { ...projectFolded, transition: instant };
const subscribeNothing = () => () => {};
/** Reduced motion is only known in the browser, so the first client render matches the server before it takes effect. */
function useReducedMotionSafe() {
  const hydrated = useSyncExternalStore(subscribeNothing, () => true, () => false);
  return !!useReducedMotion() && hydrated;
}

/** Phones get a top bar and an off-canvas drawer instead of a column beside the content. The stylesheet hides the inline column at the same width, so a phone never flashes it before hydration. */
const PHONE = "(max-width: 640px)";
const subscribePhone = (change: () => void) => {
  const query = window.matchMedia(PHONE);
  query.addEventListener("change", change);
  return () => query.removeEventListener("change", change);
};
function usePhone() {
  return useSyncExternalStore(subscribePhone, () => window.matchMedia(PHONE).matches, () => false);
}

const focusable = 'a[href], button:not([disabled]), input:not([disabled]), [tabindex]:not([tabindex="-1"])';

/** Rail width in px. The open width is the --full custom property, so a stylesheet can change it. */
const RAIL = 64;

/** The width follows one value from 0 (rail) to 1 (open) on the smooth spring, so the content beside the sidebar reflows every frame instead of jumping. */
function useRailWidth(rail: boolean, reduce: boolean, onOpened: () => void) {
  const open = useMotionValue(rail ? 0 : 1);
  const width = useTransform(open, value => `calc(${RAIL}px + (var(--full) - ${RAIL}px) * ${value})`);
  const opened = useEffectEvent(onOpened);
  useEffect(() => {
    const target = rail ? 0 : 1;
    if (reduce) { open.jump(target); if (!rail) opened(); return; }
    const controls = animate(open, target, { ...spring.smooth, onComplete: () => { if (!rail) opened(); } });
    return () => controls.stop();
  }, [rail, reduce, open]);
  return width;
}

/** [ toggles the rail while the block is on screen. It stays out of text fields, menus, and dialogs. */
function useRailShortcut(frame: RefObject<HTMLElement | null>, onToggle: () => void, disabled = false) {
  const handle = useEffectEvent((event: globalThis.KeyboardEvent) => {
    if (disabled || event.key !== "[" || event.repeat || event.metaKey || event.ctrlKey || event.altKey || event.defaultPrevented) return;
    const node = frame.current;
    const target = event.target instanceof HTMLElement ? event.target : null;
    if (!node || (target && (target.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(target.tagName) || target.closest('[role="menu"], [role="dialog"]')))) return;
    const box = node.getBoundingClientRect();
    if (!box.width || box.bottom < 0 || box.top > window.innerHeight) return;
    event.preventDefault();
    onToggle();
  });
  useEffect(() => {
    const listener = (event: globalThis.KeyboardEvent) => handle(event);
    window.addEventListener("keydown", listener);
    return () => window.removeEventListener("keydown", listener);
  }, []);
}

/** In the rail every item names itself on hover and focus. Closing the rail disarms any open tip. */
function RailTip({ enabled = true, label, note, shortcut, side = "right", children }: { enabled?: boolean; label: string; note?: string; shortcut?: string; side?: "right" | "bottom"; children: ReactElement }) {
  const [open, setOpen] = useState(false);
  if (!enabled && open) setOpen(false);
  return <TooltipPrimitive.Root open={enabled && open} onOpenChange={next => setOpen(next && enabled)}>
    <TooltipPrimitive.Trigger asChild>{children}</TooltipPrimitive.Trigger>
    <TooltipPrimitive.Portal>
      <TooltipPrimitive.Content className={styles.tip} side={side} sideOffset={side === "right" ? 14 : 8} collisionPadding={8}>{label}{note && <span className={styles.tipNote}>{note}</span>}{shortcut && <kbd>{shortcut}</kbd>}</TooltipPrimitive.Content>
    </TooltipPrimitive.Portal>
  </TooltipPrimitive.Root>;
}

/** The divider in the panel icon slides with the sidebar, so the control shows what it is about to do. */
function PanelGlyph({ collapsed, reduce }: { collapsed: boolean; reduce: boolean }) {
  return <svg width="20" height="20" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" aria-hidden="true">
    <rect x="2.75" y="3.75" width="14.5" height="12.5" rx="3.5" />
    <motion.path d="M8.25 4.25v11.5" initial={false} animate={{ x: collapsed ? -2.5 : 0 }} transition={reduce ? instant : spring.smooth} />
  </svg>;
}

const isPlainClick = (event: ReactMouseEvent) => event.button === 0 && !event.metaKey && !event.ctrlKey && !event.shiftKey && !event.altKey;

/** Changed text rises out of a soft blur while the old text lifts away a little faster. */
function Swap({ text, className, reduce }: { text: string; className?: string; reduce: boolean }) {
  return <span className={[styles.swap, className].filter(Boolean).join(" ")}>
    <AnimatePresence mode="popLayout" initial={false}>
      <motion.span key={text} className={styles.swapText} initial={reduce ? { opacity: 0 } : { opacity: 0, y: "0.35em", filter: `blur(${blur.soft}px)` }} animate={{ opacity: 1, y: 0, filter: "blur(0px)" }} exit={reduce ? { opacity: 0, transition: instant } : { opacity: 0, y: "-0.35em", filter: `blur(${blur.subtle}px)`, transition: { duration: duration.fast, ease: standard } }} transition={reduce ? instant : { duration: duration.standard, ease: enter }}>{text}</motion.span>
    </AnimatePresence>
  </span>;
}

function Mark({ initial, small = false }: { initial: string; small?: boolean }) {
  return <span className={[styles.mark, small ? styles.markSmall : ""].filter(Boolean).join(" ")} aria-hidden="true">
    <span className={styles.markFace}>{initial}</span>
  </span>;
}

/** Search keeps the whole name readable and lifts the matching letters out of the dimmed rest. */
function Name({ name, query, unread = false }: { name: string; query: string; unread?: boolean }) {
  const index = query ? name.toLowerCase().indexOf(query.toLowerCase()) : -1;
  return <span className={styles.name} data-searching={query ? "" : undefined} data-unread={unread ? "" : undefined}>
    {index < 0 ? name : <>{name.slice(0, index)}<mark>{name.slice(index, index + query.length)}</mark>{name.slice(index + query.length)}</>}
  </span>;
}

function Highlight({ reduce }: { reduce: boolean }) {
  return <motion.span layoutId="active" className={styles.highlight} aria-hidden="true" transition={reduce ? instant : spring.morph} />;
}

/** Section titles fold into a hairline in the rail. The title leaves first, then the height closes. */
function SectionTitle({ id, text, rail, reduce }: { id: string; text: string; rail: boolean; reduce: boolean }) {
  return <motion.h2 id={id} className={styles.sectionTitle} initial={false} animate={{ height: rail ? 17 : 32 }} transition={reduce ? instant : spring.smooth}>
    <span className={styles.sectionText}>{text}</span>
    <span className={styles.divider} aria-hidden="true" />
  </motion.h2>;
}

type PanelProps = Pick<WorkspaceSidebarProps, "projects" | "groups" | "activeId" | "loading" | "error" | "onRetry" | "renderLink" | "notifications" | "compactNotifications" | "projectTree"> & {
  reduce: boolean; rail: boolean;
  onExpand: () => void;
  onSelect: (id: string, name: string) => void;
  onCreate?: (name: string) => Promise<WorkspaceProject>;
  onContextMenuChange: (open: boolean) => void;
};

function Panel({ projects, groups, activeId, loading, error, onRetry, renderLink, reduce, rail, onExpand, onSelect, onCreate, notifications, compactNotifications, onContextMenuChange, projectTree = false }: PanelProps) {
  const group = useId();
  const projectSection = useRef<HTMLElement>(null);
  const projectFolder = useRef<HTMLButtonElement>(null);
  const [projectsOpen, setProjectsOpen] = useState(true);
  const activeProject = projects.some(project => project.id === activeId) ? activeId : null;
  const [previousActiveProject, setPreviousActiveProject] = useState(activeProject);
  if (activeProject !== previousActiveProject) {
    setPreviousActiveProject(activeProject);
    if (activeProject) setProjectsOpen(true);
  }
  const tree = projectTree && !rail;
  const projectBranchOpen = !tree || projectsOpen;
  function toggleProjects(open: boolean) {
    if (!open && projectSection.current?.contains(document.activeElement)) projectFolder.current?.focus({ preventScroll: true });
    setProjectsOpen(open);
  }
  function onProjectTreeKey(event: KeyboardEvent<HTMLElement>) {
    if (!tree || event.defaultPrevented || event.altKey || event.ctrlKey || event.metaKey || event.shiftKey) return;
    const target = event.target instanceof HTMLElement ? event.target.closest<HTMLElement>("[data-project-tree-item]") : null;
    if (!target || !projectSection.current?.contains(target)) return;
    const items = [...projectSection.current.querySelectorAll<HTMLElement>("[data-project-tree-item]")].filter(item => !item.closest("[inert]"));
    const index = items.indexOf(target);
    if (index === -1) return;
    if (event.key === "ArrowLeft") { event.preventDefault(); toggleProjects(false); return; }
    if (event.key === "ArrowRight" && target === projectFolder.current) {
      event.preventDefault();
      if (projectsOpen) items[1]?.focus(); else toggleProjects(true);
      return;
    }
    const next = event.key === "ArrowDown" ? items[index + 1] : event.key === "ArrowUp" ? items[index - 1] : event.key === "Home" ? items[0] : event.key === "End" ? items[items.length - 1] : undefined;
    if (next) { event.preventDefault(); next.focus(); }
  }
  async function retryProjects() {
    // The retry button disappears while loading. Keep focus on a stable named
    // group, then enter its result only if the person has not moved elsewhere.
    const section = projectSection.current;
    if (section?.contains(document.activeElement)) section.focus({ preventScroll: true });
    try {
      await onRetry?.();
    } finally {
      requestAnimationFrame(() => {
        const current = projectSection.current;
        if (current && document.activeElement === current) current.querySelector<HTMLElement>("a[href], button:not([disabled])")?.focus({ preventScroll: true });
      });
    }
  }
  const LinkElement = (props: WorkspaceLinkProps) => renderLink ? renderLink(props) : <Link {...props} />;
  const row = (item: WorkspaceNavigationItem, project = false) => {
    const link = LinkElement({
      href: item.href, className: styles.row, title: item.name,
      "aria-current": activeId === item.id ? "page" : undefined,
      ...(project && tree ? { "data-project-tree-item": "" } : {}),
      onClick: (event) => { if (isPlainClick(event)) onSelect(item.id, item.name); },
      children: <>{activeId === item.id && <Highlight reduce={reduce} />}
        <span className={styles.lead} aria-hidden="true">{project ? <span className={dotStyles.dot} data-tone={item.id === "none" ? "slate" : projectToneForId(item.id)} data-hollow={item.id === "none" || undefined} /> : item.icon}</span>
        <Name name={item.name} query="" />
      </>,
    });
    return <li key={item.id} className={styles.item}>
      {project ? <ProjectContextMenu href={item.href} label={item.name} onNavigate={() => onSelect(item.id, item.name)} onOpenChange={onContextMenuChange}>{link}</ProjectContextMenu> : <RailTip enabled={rail} label={item.name}>{link}</RailTip>}
    </li>;
  };

  function section(sectionGroup: WorkspaceNavigationGroup) {
    return <section key={sectionGroup.id} className={styles.section} role="group" aria-label={sectionGroup.name}>
      <SectionTitle id={`${group}-${sectionGroup.id}`} text={sectionGroup.name} rail={rail} reduce={reduce} />
      <ul className={styles.list}>{sectionGroup.items.map(item => row(item))}</ul>
      {sectionGroup.id === "workspace" && <div className={styles.notificationSlot}>{rail ? compactNotifications ?? notifications : notifications}</div>}
    </section>;
  }
  const projectContents = <>
    {loading && <p role="status" className={styles.message} data-rail-hidden="" inert={rail}>Loading Projects…</p>}
    {error && <div className={styles.message} data-rail-hidden="" inert={rail}><p role="alert">{error}</p><Button type="button" size="sm" variant="secondary" onClick={retryProjects}>Retry Projects</Button></div>}
    {!loading && !error && <ul className={styles.list}>{projects.map(project => row(project, true))}</ul>}
    {!loading && !error && projects.every(project => project.id === "none") && <p className={styles.message} data-rail-hidden="" inert={rail}>Create a Project to group your Requests.</p>}
  </>;

  return <div className={styles.panel}><LayoutGroup id={group}>
    {groups.filter(item => item.id !== "settings").map(section)}
    <section ref={projectSection} className={styles.section} role="group" aria-label="Projects" tabIndex={-1} onKeyDown={onProjectTreeKey}>
      {tree ? <button ref={projectFolder} type="button" className={styles.projectFolder} data-project-tree-item data-holds={!projectsOpen && activeProject ? "" : undefined} aria-label="Projects" aria-expanded={projectsOpen} aria-controls={`${group}-project-branch`} aria-describedby={!projectsOpen && activeProject ? `${group}-project-current` : undefined} onClick={() => toggleProjects(!projectsOpen)}>
        <Folder className={styles.projectFolderIcon} size={16} strokeWidth={1.75} aria-hidden="true" />
        <span className={styles.projectFolderLabel}>Projects</span>
        {!projectsOpen && activeProject && <span className={styles.projectFolderCurrent}><span id={`${group}-project-current`} className={styles.srOnly}>Contains the current Project</span></span>}
        <ChevronRight className={styles.projectChevron} size={14} strokeWidth={1.75} aria-hidden="true" />
      </button> : <SectionTitle id={`${group}-projects`} text="Projects" rail={rail} reduce={reduce} />}
      {tree ? <motion.div id={`${group}-project-branch`} className={styles.projectBranch} initial={false} animate={projectBranchOpen ? reduce ? projectUnfoldStill : projectUnfold : reduce ? projectFoldStill : projectFold} inert={!projectBranchOpen} aria-hidden={!projectBranchOpen || undefined}>{projectContents}</motion.div> : projectContents}
      {onCreate && <Composer reduce={reduce} rail={rail} onExpand={onExpand} onCreate={tree ? async name => { const created = await onCreate(name); setProjectsOpen(true); return created; } : onCreate} />}
    </section>
    {groups.filter(item => item.id === "settings").map(section)}
  </LayoutGroup></div>;
}

/** Arc's inline project composer, connected to a real async create operation. */
function Composer({ reduce, rail, onExpand, onCreate }: { reduce: boolean; rail: boolean; onExpand: () => void; onCreate: (name: string) => Promise<WorkspaceProject> }) {
  const id = useId();
  const [state, setState] = useState<"idle" | "open" | "commit">("idle");
  const [value, setValue] = useState("");
  const [error, setError] = useState("");
  const input = useRef<HTMLInputElement>(null);
  const trigger = useRef<HTMLButtonElement>(null);
  const inFlight = useRef(false);
  const mounted = useRef(true);
  const restoreTrigger = useRef(false);
  useEffect(() => { mounted.current = true; return () => { mounted.current = false; }; }, []);
  useEffect(() => {
    if (state !== "idle" || !restoreTrigger.current) return;
    restoreTrigger.current = false;
    trigger.current?.focus({ preventScroll: true });
  }, [state]);

  function open() { setState("open"); requestAnimationFrame(() => input.current?.focus()); }
  function close() {
    if (inFlight.current) return;
    restoreTrigger.current = true; setState("idle"); setValue(""); setError("");
  }
  async function submit(event: FormEvent) {
    event.preventDefault();
    if (inFlight.current) return;
    const name = value.trim().replace(/\s+/g, " ");
    if (!name) { setError("Enter a Project name."); input.current?.focus(); return; }
    inFlight.current = true; setValue(name); setState("commit"); setError("");
    try {
      await onCreate(name);
      if (mounted.current) { restoreTrigger.current = true; setState("idle"); setValue(""); }
    } catch (failure) {
      if (mounted.current) { setState("open"); setError(failure instanceof Error ? failure.message : "Project could not be created. Try again."); requestAnimationFrame(() => input.current?.focus()); }
    } finally { inFlight.current = false; }
  }
  const idle = state === "idle";
  return <motion.div className={styles.composerWrap} initial={false} animate={{ opacity: 1 }} transition={reduce ? instant : { duration: duration.standard }}>
    <form className={styles.composer} data-state={state} data-invalid={error ? "" : undefined} onSubmit={submit} aria-busy={state === "commit"}>
      <span className={styles.lead} aria-hidden="true">{state === "commit" ? <LoaderCircle size={15} /> : <Plus size={15} strokeWidth={1.75} />}</span>
      <span className={styles.composerField}>
        {idle ? <span className={styles.composerLabel} aria-hidden="true">New Project</span> :
          <input ref={input} id={`${id}-name`} className={styles.composerInput} value={value} maxLength={80} readOnly={state === "commit"} placeholder="Project name" aria-label="Project name" aria-invalid={error ? true : undefined} aria-describedby={error ? `${id}-error` : `${id}-help`} autoComplete="off" enterKeyHint="done"
            onChange={event => { setValue(event.target.value); setError(""); }} onKeyDown={event => { if (event.key === "Escape") { event.preventDefault(); event.stopPropagation(); close(); } }} />}
      </span>
      {!idle && <button type="submit" className={styles.createButton} disabled={state === "commit"} aria-label="Create Project"><Check size={15} strokeWidth={1.75} aria-hidden="true" /></button>}
      {idle && <RailTip enabled={rail} label="New Project"><button ref={trigger} type="button" className={styles.composerTrigger} onClick={() => { if (rail) onExpand(); open(); }}>New Project</button></RailTip>}
      <span id={`${id}-help`} className={styles.srOnly}>Press Enter to create the Project or Escape to cancel.</span>
    </form>
    {error && <p id={`${id}-error`} className={styles.createError} role="alert">{error}</p>}
    {state === "commit" && <span className={styles.srOnly} role="status">Creating Project…</span>}
  </motion.div>;
}

/** Locks the page behind the open drawer, keeping the scrollbar's room so nothing shifts sideways. */
function usePageLock(locked: boolean) {
  useEffect(() => {
    if (!locked) return;
    const root = document.documentElement;
    const previous = { overflow: root.style.overflow, gutter: root.style.scrollbarGutter };
    if (root.scrollHeight > root.clientHeight) root.style.scrollbarGutter = "stable";
    root.style.overflow = "hidden";
    return () => { root.style.overflow = previous.overflow; root.style.scrollbarGutter = previous.gutter; };
  }, [locked]);
}

export function WorkspaceSidebar({ className, layoutManaged = false, forceDesktopLayout = false, projectTree = false, workspace, user, settingsHref, membersHref, onSignOut, projects, groups, activeId, currentPage, loading, error, onRetry, onCreateProject, onNavigate, defaultCollapsed = false, onCollapsedChange, onMobileOpenChange, renderLink, notifications, compactNotifications, onSearch, searchActive = false, workspaces }: WorkspaceSidebarProps) {
  const reduce = useReducedMotionSafe();
  const phone = usePhone() && !forceDesktopLayout;
  const [collapsed, setCollapsed] = useState(defaultCollapsed);
  const [drawer, setDrawer] = useState(false);
  // The drawer stays visible until its slide out settles, then leaves the accessibility tree.
  const [shown, setShown] = useState(false);
  const [accountOpen, setAccountOpen] = useState(false);
  const returnFocus = useRef(false);
  const menuReturnToOpener = useRef(false);
  const backdropPress = useRef(false);
  const menuOpen = useRef(false);
  const contextMenuOpen = useRef(false);
  // A phone has no rail: the drawer always opens at full width, and leaving phone width closes it.
  const rail = collapsed && !phone && !layoutManaged;
  if (!phone && (drawer || shown)) { setDrawer(false); setShown(false); }
  const navId = useId();
  const frame = useRef<HTMLElement>(null);
  const sheet = useRef<HTMLDivElement>(null);
  const opener = useRef<HTMLButtonElement>(null);
  const closeTimer = useRef(0);
  // The drawer's offset and fade are motion values, so a finger can hold it mid-slide and the backdrop dims with its position.
  const sheetX = useMotionValue(-4096);
  const sheetFade = useMotionValue(1);
  const travel = useRef(320);
  const release = useRef(0);
  const swipe = useRef<{ id: number; x: number; y: number; time: number; axis: "x" | "y" | null; velocity: number } | null>(null);
  const shade = useTransform([sheetX, sheetFade], ([x, fade]: number[]) => Math.min(1, Math.max(0, 1 + x / travel.current)) * fade);
  const toggleRef = useRef<HTMLButtonElement>(null);
  const width = useRailWidth(rail, reduce, () => {});
  const [announcement, setAnnouncement] = useState("");
  const accountTrigger = useRef<HTMLButtonElement>(null);

  usePageLock(phone && drawer);
  useEffect(() => { onMobileOpenChange?.(phone && drawer); return () => onMobileOpenChange?.(false); }, [phone, drawer, onMobileOpenChange]);
  useEffect(() => () => window.clearTimeout(closeTimer.current), []);
  // Focus moves into the drawer once it can take it, and back to the bar's button once the bar is interactive again.
  useEffect(() => {
    if (drawer) sheet.current?.focus({ preventScroll: true });
    else if (returnFocus.current) { returnFocus.current = false; opener.current?.focus({ preventScroll: true, focusVisible: false } as FocusOptions); }
  }, [drawer]);
  // One spring carries the drawer in and out from wherever it is, including mid-swipe, so a reversal never restarts the slide.
  useEffect(() => {
    if (!shown) return;
    const settle = () => { if (!drawer) setShown(false); };
    if (reduce) {
      // Nothing travels: the drawer fades in place, and only moves off screen once it is invisible.
      if (drawer) sheetX.jump(0);
      const fade = animate(sheetFade, drawer ? 1 : 0, { duration: duration.fast, ease: standard, onComplete: () => { if (!drawer) sheetX.jump(-travel.current); settle(); } });
      return () => fade.stop();
    }
    sheetFade.jump(1);
    // A swipe hands over its release speed, so the close continues the throw instead of restarting it.
    const velocity = release.current;
    release.current = 0;
    const slide = animate(sheetX, drawer ? 0 : -travel.current, { ...spring.smooth, velocity, onComplete: settle });
    return () => slide.stop();
  }, [drawer, shown, reduce, sheetX, sheetFade]);

  function openDrawer() {
    window.clearTimeout(closeTimer.current);
    // The slide starts just past the drawer's own edge, measured each time so a rotated phone still travels the right distance.
    const node = sheet.current;
    if (node) travel.current = node.offsetLeft + node.offsetWidth + 12;
    if (!shown) { sheetX.jump(-travel.current); sheetFade.jump(reduce ? 0 : 1); }
    // Focus moves into the drawer itself, so the keyboard starts at its top without a phone keyboard popping up.
    setShown(true);
    setDrawer(true);
  }
  function closeDrawer(delay = 0) {
    window.clearTimeout(closeTimer.current);
    const close = () => {
      const active = document.activeElement;
      const fromMenu = menuOpen.current;
      if (fromMenu) menuReturnToOpener.current = true;
      returnFocus.current = fromMenu || !active || active === document.body || !!sheet.current?.contains(active);
      setDrawer(false);
    };
    if (delay && !reduce) closeTimer.current = window.setTimeout(close, delay);
    else close();
  }

  function select(itemId: string, name: string) {
    onNavigate?.({ workspace: workspace.id, id: itemId, name });
    if (phone) closeDrawer();
  }

  async function create(name: string) {
    if (!onCreateProject) throw new Error("Project creation is unavailable.");
    const project = await onCreateProject(name);
    setAnnouncement(`Project ${project.name} created`);
    return project;
  }

  function setRail(next: boolean) {
    if (next === collapsed) return;
    // Focus never stays behind in a part of the sidebar the rail hides.
    const active = document.activeElement;
    if (next && active instanceof HTMLElement && active.closest("[data-rail-hidden]") && frame.current?.contains(active)) toggleRef.current?.focus();
    setCollapsed(next);
    setAnnouncement(next ? "Sidebar collapsed" : "Sidebar expanded");
    onCollapsedChange?.(next);
  }
  useRailShortcut(frame, () => { if (workspaces?.pendingId) return; if (phone) { if (drawer) closeDrawer(); else openDrawer(); } else if (!layoutManaged) setRail(!collapsed); }, layoutManaged && !phone);

  function onAccountOpenChange(open: boolean) {
    menuOpen.current = open;
    setAccountOpen(open);
    if (!open && phone) requestAnimationFrame(() => {
      if (menuReturnToOpener.current) { menuReturnToOpener.current = false; opener.current?.focus({ preventScroll: true }); }
      else accountTrigger.current?.focus({ preventScroll: true });
    });
  }

  /** A horizontal swipe toward the edge drags the drawer with the finger; a flick or a pull past a third closes it, anything less springs back. Vertical moves stay with the list. */
  function onSheetPointerDown(event: ReactPointerEvent<HTMLDivElement>) {
    if (event.pointerType === "mouse" || !drawer || swipe.current || menuOpen.current || contextMenuOpen.current) return;
    const target = event.target instanceof Element ? event.target : null;
    if (!target || !sheet.current?.contains(target)) return;
    if (target?.closest("input, textarea, [data-lifted]")) return;
    swipe.current = { id: event.pointerId, x: event.clientX, y: event.clientY, time: event.timeStamp, axis: null, velocity: 0 };
  }
  function onSheetPointerMove(event: ReactPointerEvent<HTMLDivElement>) {
    const gesture = swipe.current;
    if (!gesture || gesture.id !== event.pointerId) return;
    const dx = event.clientX - gesture.x, dy = event.clientY - gesture.y;
    if (!gesture.axis) {
      if (Math.hypot(dx, dy) < 8) return;
      // A row lifted for reordering keeps the finger.
      gesture.axis = Math.abs(dx) > Math.abs(dy) * 1.2 && !sheet.current?.querySelector("[data-lifted]") ? "x" : "y";
      if (gesture.axis === "x") { gesture.x = event.clientX; event.currentTarget.setPointerCapture(event.pointerId); }
      return;
    }
    if (gesture.axis !== "x") return;
    const offset = event.clientX - gesture.x;
    // Past the open position the drawer gives a little and resists, like a sheet that is already fully out.
    const next = offset > 0 ? 10 * (1 - Math.exp(-offset / 60)) : offset;
    const elapsed = Math.max(1, event.timeStamp - gesture.time);
    gesture.velocity = (next - sheetX.get()) / elapsed * 1000;
    gesture.time = event.timeStamp;
    sheetX.jump(next);
  }
  function onSheetPointerEnd(event: ReactPointerEvent<HTMLDivElement>) {
    const gesture = swipe.current;
    if (!gesture || gesture.id !== event.pointerId) return;
    swipe.current = null;
    if (gesture.axis !== "x") return;
    const x = sheetX.get();
    const close = event.type !== "pointercancel" && (x < -travel.current / 3 || gesture.velocity < -500);
    if (!close) { animate(sheetX, 0, reduce ? instant : { ...spring.smooth, velocity: gesture.velocity }); return; }
    release.current = gesture.velocity;
    closeDrawer();
  }

  /** The drawer is a modal layer: Tab stays inside it and Escape closes it, unless a menu or field inside handled the key first. */
  function onSheetKeyDown(event: KeyboardEvent<HTMLDivElement>) {
    const target = event.target instanceof Element ? event.target : null;
    if (event.defaultPrevented || contextMenuOpen.current || !sheet.current || !target || !sheet.current.contains(target)) return;
    if (event.key === "Escape") { event.preventDefault(); closeDrawer(); return; }
    if (event.key !== "Tab") return;
    const items = [...sheet.current.querySelectorAll<HTMLElement>(focusable)].filter(item => !item.closest("[inert]") && item.getClientRects().length > 0);
    if (!items.length) return;
    const first = items[0], last = items[items.length - 1];
    if (event.shiftKey && (document.activeElement === first || document.activeElement === sheet.current)) { event.preventDefault(); last.focus(); }
    else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
  }

  const nav = <motion.nav ref={frame} id={navId} className={[styles.sidebar, className].filter(Boolean).join(" ")} aria-label="Primary navigation" style={phone ? undefined : { width: layoutManaged ? "100%" : width }} data-rail={rail || undefined} data-placement={phone ? "drawer" : "inline"} data-force-desktop={forceDesktopLayout || undefined}>
      <div className={styles.header}>
        <div className={styles.identityRow}>
        <div className={styles.accountSlot}>
          <UserMenu ref={accountTrigger} user={user} showName={!rail} showTheme={false} align="start"
            className={styles.accountTrigger} open={accountOpen} onOpenChange={onAccountOpenChange}
            items={[
              { label: "Settings", icon: <Settings size={16} />, href: settingsHref, current: activeId === settingsHref, onSelect: () => select(settingsHref, "Settings") },
              ...(membersHref ? [{ label: "Invite and manage members", icon: <UsersRound size={16} />, href: membersHref, current: activeId === membersHref, onSelect: () => select(membersHref, "Invite and manage members") }] : []),
            ]}
            workspaces={workspaces} signOutLabel="Log out"
            onSignOut={onSignOut ? async () => { await onSignOut(); if (phone) closeDrawer(); } : undefined} />
        </div>
          <div className={styles.identityActions}>
            <RailTip label="Search workspace" shortcut="/" side={rail ? "right" : "bottom"}><button type="button" className={styles.headerAction} aria-label="Search workspace" aria-keyshortcuts="/" aria-pressed={searchActive} onClick={() => { if (phone) closeDrawer(); onSearch?.(); }}><Search size={17} strokeWidth={1.75} aria-hidden="true" /></button></RailTip>
            <RailTip label="New Request" shortcut="C" side={rail ? "right" : "bottom"}><NavigationLink renderLink={renderLink} href="/intake" className={styles.headerAction} aria-label="New Request" aria-keyshortcuts="C" onClick={event => { if (isPlainClick(event)) select("/intake", "New Request"); }}><SquarePen size={17} strokeWidth={1.75} aria-hidden="true" /></NavigationLink></RailTip>
            {phone
              ? <button ref={toggleRef} type="button" className={styles.headerAction} aria-label="Close sidebar" onClick={() => closeDrawer()}><X size={18} strokeWidth={1.75} aria-hidden="true" /></button>
              : !layoutManaged && <RailTip label={collapsed ? "Expand sidebar" : "Collapse sidebar"} shortcut="[" side={rail ? "right" : "bottom"}><button ref={toggleRef} type="button" className={styles.headerAction} aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"} aria-expanded={!collapsed} aria-keyshortcuts="[" onClick={() => setRail(!collapsed)}><PanelGlyph collapsed={collapsed} reduce={reduce} /></button></RailTip>}
          </div>
        </div>
      </div>

      <motion.div className={styles.scroll} layoutScroll>
        <div className={styles.stack}>
          <AnimatePresence initial={false}>
            <Panel key={workspace.id} projects={projects} groups={groups} activeId={activeId} reduce={reduce} rail={rail} projectTree={projectTree} onExpand={() => setRail(false)} onSelect={select}
              loading={loading} error={error} onRetry={onRetry} renderLink={renderLink} onCreate={onCreateProject ? create : undefined} onContextMenuChange={open => { contextMenuOpen.current = open; }} notifications={notifications} compactNotifications={compactNotifications} />
          </AnimatePresence>
        </div>
      </motion.div>

      <p className={styles.srOnly} role="status" aria-live="polite">{announcement}</p>
    </motion.nav>;

  if (!phone) return <TooltipPrimitive.Provider delayDuration={250} skipDelayDuration={300}>{nav}</TooltipPrimitive.Provider>;

  /* Phones: a compact bar names the open page, and the sidebar slides in over the content from the bar's edge. It stays mounted while closed, so its scroll and state are where they were left. */
  return <TooltipPrimitive.Provider delayDuration={250} skipDelayDuration={300}>
    <div className={styles.topbar} inert={drawer}>
      <button ref={opener} type="button" className={styles.opener} aria-label="Open navigation" aria-expanded={drawer} aria-controls={navId} aria-keyshortcuts="[" onClick={openDrawer}><PanelGlyph collapsed reduce={reduce} /></button>
      <Mark initial={workspace.initial} small />
      <span className={styles.topbarText}>
        <Swap className={styles.topbarPage} text={currentPage} reduce={reduce} />
        <Swap className={styles.topbarWorkspace} text={workspace.name} reduce={reduce} />
      </span>
    </div>
    {createPortal(<>
      <motion.div className={styles.backdrop} data-open={drawer ? "" : undefined} data-shown={shown ? "" : undefined} aria-hidden="true" style={{ opacity: shade }}
        onPointerDown={() => { backdropPress.current = !menuOpen.current && !contextMenuOpen.current; }} onClick={() => { if (backdropPress.current) closeDrawer(); backdropPress.current = false; }} />
      <motion.div ref={sheet} className={styles.sheet} data-shown={shown ? "" : undefined} role="dialog" aria-modal="true" aria-label="Navigation" tabIndex={-1} inert={!drawer || accountOpen || Boolean(workspaces?.pendingId)} onKeyDown={onSheetKeyDown}
        style={{ x: sheetX, opacity: sheetFade }} onPointerDown={onSheetPointerDown} onPointerMove={onSheetPointerMove} onPointerUp={onSheetPointerEnd} onPointerCancel={onSheetPointerEnd}>
        {nav}
      </motion.div>
    </>, document.body)}
  </TooltipPrimitive.Provider>;
}

export default WorkspaceSidebar;
