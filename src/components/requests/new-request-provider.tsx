"use client";

import { createPortal } from "react-dom";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { useToastStack } from "@/components/arc/toast-stack/toast-stack";
import { Skeleton } from "@/components/arc/skeleton/skeleton";
import { Dialog, DialogContent } from "@/components/arc/dialog/dialog";
import { NewRequestContext } from "./new-request-context";
import { listFiltersOf, revealRequest, useListViewSnapshot, useRequestListContext, useSetRequestListView } from "./list-view-state";
import { requestCreatedToast } from "./request-created-toast";
import { matchesListFilters, type OverviewRequest } from "@/lib/request-overview";
import { projectIdOrNull } from "@/lib/request-constants";
import { readLostUploads, unfinishedUploadsScope } from "@/lib/unfinished-uploads";
import { hasIntakeDraft, intakeDraftScope } from "@/lib/intake-draft-key";
import { isTypingTarget, overlayOpen } from "@/lib/keyboard-guards";
import { parseRequestListContext, requestDetailHref, requestListHref, type RequestListContext } from "@/lib/request-workspace";
import { requestRowSelector } from "./list-focus";
import { isRequestPopoverEvent } from "./request-popover-events";

export { NewRequestLink } from "./new-request-link";

type IntakeFormComponent = typeof import("@/app/(app)/intake/intake-form").default;

// Plan item 2.3: C focuses the title within 100 ms on the first open. The form
// (react-hook-form, zod, the AI review) stays out of every route's first load:
// it loads once, on idle after the provider mounts or when the pointer or
// focus reaches New Request, and from then on renders synchronously, with no
// Suspense boundary. The skeleton shows only if C beats the preload.
let loadedForm: IntakeFormComponent | null = null;
let formPromise: Promise<IntakeFormComponent> | null = null;

export function preloadComposer(): Promise<IntakeFormComponent> {
  formPromise ??= import("@/app/(app)/intake/intake-form").then(
    (module) => (loadedForm = module.default),
    (error: unknown) => { formPromise = null; throw error; },
  );
  return formPromise;
}

// The composer dialog's body hands its height to its child, so the composer can
// scroll its own content and keep the footer at the bottom of the panel.
const fill = { display: "flex", flex: "1 1 auto", flexDirection: "column", minHeight: 0 } as const;

function createFormHost() {
  const host = document.createElement("div");
  Object.assign(host.style, fill);
  return host;
}

/** The page itself is never a place to return focus to: a closed composer would leave focus on nothing. */
function focusable(element: Element | null): HTMLElement | null {
  return element instanceof HTMLElement && element !== document.body && element !== document.documentElement ? element : null;
}

/** /intake's Create Request (intake-launcher.tsx). */
const intakeLauncher = () => document.querySelector<HTMLElement>("[data-intake-launcher]");
/** An automatic open on /intake returns focus to the launcher, which may still be streaming in when the composer opens. */
const LAUNCHER = "intake-launcher";

/** Lives with the authenticated workspace, so closing a composer does not discard File objects. */
export function NewRequestProvider({ children, context, draftOwnerId }: {
  children: ReactNode;
  context: { orgId: string };
  draftOwnerId: string;
}) {
  const router = useRouter();
  const { toast } = useToastStack();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  // Plan item 1.7 moved the list context into layout state; the URL is only a
  // mirror of it, and the fallback outside the layout's provider. The layout
  // mirrors only the "/" URL, so on /intake the URL's Project, which
  // NewRequestLink writes as /intake?project=, names the new Request's Project.
  const listContext = useRequestListContext();
  const urlContext = parseRequestListContext(searchParams);
  const statusFilter = (listContext ?? urlContext).status;
  const projectFilter = pathname === "/intake" && searchParams.has("project") ? urlContext.project : (listContext ?? urlContext).project;
  const projectId = projectIdOrNull(projectFilter);
  const listSnapshot = useListViewSnapshot();
  const setListView = useSetRequestListView();
  const [open, setOpen] = useState(false);
  const [hasOpened, setHasOpened] = useState(false);
  const [generation, setGeneration] = useState(0);
  const [initialProjectId, setInitialProjectId] = useState<string | null>(null);
  const [returnContext, setReturnContext] = useState<RequestListContext>({ status: "all", project: "all" });
  const [formHost, setFormHost] = useState<HTMLDivElement | null>(null);
  const [IntakeForm, setIntakeForm] = useState<IntakeFormComponent | null>(() => loadedForm);
  const preload = useCallback(() => {
    if (loadedForm) return;
    preloadComposer().then((form) => setIntakeForm(() => form), () => undefined);
  }, []);
  const busy = useRef(false);
  // Decision 2026-10-21 (critique 2.3): while the problem check runs, X and Esc cancel it and keep the draft.
  const cancelCheck = useRef<(() => void) | null>(null);
  const completed = useRef(false);
  const trigger = useRef<HTMLElement | typeof LAUNCHER | null>(null);
  const createdId = useRef<string | null>(null);
  // Where the person is now, for a toast action that runs after a navigation.
  const onList = useRef(pathname === "/");
  useEffect(() => { onList.current = pathname === "/"; }, [pathname]);

  const openComposer = useCallback((element?: HTMLElement | typeof LAUNCHER) => {
    // C pressed with nothing focused names no trigger, and close falls back below.
    trigger.current = element ?? focusable(document.activeElement);
    createdId.current = null;
    // A retained composer belongs to its draft, even after navigating to a
    // different Project. Only a new generation inherits the current location.
    if (!hasOpened || completed.current) {
      setInitialProjectId(projectId);
      setReturnContext({ status: statusFilter, project: projectFilter });
    }
    if (completed.current) {
      setGeneration((value) => value + 1);
      completed.current = false;
    }
    setFormHost(current => current ?? createFormHost());
    if (!IntakeForm) preload();
    setHasOpened(true);
    setOpen(true);
  }, [IntakeForm, hasOpened, preload, projectFilter, projectId, statusFilter]);

  useEffect(() => {
    if (IntakeForm) return;
    if (typeof window.requestIdleCallback === "function") {
      const idle = window.requestIdleCallback(preload, { timeout: 4000 });
      return () => window.cancelIdleCallback(idle);
    }
    const timer = window.setTimeout(preload, 1500);
    return () => window.clearTimeout(timer);
  }, [IntakeForm, preload]);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.defaultPrevented || event.repeat || event.isComposing || event.key.toLowerCase() !== "c" || event.metaKey || event.ctrlKey || event.altKey || event.shiftKey || isTypingTarget(event.target)) return;
      // Plan item 2.4: C, ? and the list keys share one guard.
      if (overlayOpen()) return;
      event.preventDefault();
      openComposer();
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [openComposer]);

  const onBusyChange = useCallback((value: boolean) => { busy.current = value; }, []);
  const onCancelCheckChange = useCallback((cancel: (() => void) | null) => { cancelCheck.current = cancel; }, []);
  /** X, Esc: the first cancels a running check and stays open; a busy save or upload still holds the dialog. */
  const holdOpen = useCallback(() => {
    if (cancelCheck.current) { cancelCheck.current(); return true; }
    return busy.current;
  }, []);
  // saveRequest revalidates the list and the new detail path, so its response
  // already carries the created Request; the composer has already put the row
  // in the Open group through the pending overlay (plan item 2.3). A router
  // refresh would render twice.
  const onCreated = useCallback((requestId: string, { open: openRequest, created }: { open: boolean; created?: OverviewRequest }) => {
    createdId.current = requestId;
    completed.current = true;
    busy.current = false;
    setOpen(false);
    const href = requestDetailHref(requestId, returnContext.status, returnContext.project);
    if (openRequest) {
      router.push(href);
      return;
    }
    // /intake is a launcher with no list to show the new Request in. As 2.3's
    // /intake page did, creating there opens the Request.
    if (pathname === "/intake") {
      toast(requestCreatedToast({}));
      router.push(href);
      return;
    }
    // Plan item 2.3 (S4): on the list, say when the current filters leave the
    // new Request out, and offer to show it. Filters never clear silently.
    const view = pathname === "/" && created?.id === requestId ? listSnapshot?.() : undefined;
    const hidden = Boolean(view && created && !matchesListFilters(created, listFiltersOf(view)));
    toast(requestCreatedToast({
      hidden,
      onOpen: () => router.push(href),
      onShow: view && created ? () => {
        setListView((previous) => revealRequest(previous, created));
        // The toast outlives the page. Away from the list, Show it goes back to
        // it, in the view that holds the new Request, and the list consumes the reveal there.
        if (onList.current) return;
        const revealed = revealRequest(listSnapshot?.() ?? view, created);
        router.push(requestListHref(revealed.status, revealed.project));
      } : undefined,
    }));
  }, [listSnapshot, pathname, returnContext, router, setListView, toast]);

  // After hydration, the composer opens by itself for what this tab kept.
  // Plan item 2.3 (S3): a reload interrupted uploads after a Request was
  // created. Once per document load, on any page, /intake included, the
  // composer says which files weren't added. A record found later, after an
  // in-app navigation, is this document's own, not evidence of a reload.
  // And /intake, a launcher since 2026-10-13, still restores this workspace's
  // draft or review as 2.3's page did, after a reload or Sign in again: each
  // arrival there with one opens the composer once, its restored step focused.
  // Closing it returns focus to Create Request; a visit with no draft shows
  // the launcher only.
  const checkedLoad = useRef(false);
  const checkedIntake = useRef(false);
  useEffect(() => {
    const onIntake = pathname === "/intake";
    if (!onIntake) checkedIntake.current = false;
    if (checkedLoad.current && (!onIntake || checkedIntake.current)) return;
    const timer = window.setTimeout(() => {
      const firstCheck = !checkedLoad.current;
      checkedLoad.current = true;
      if (onIntake) checkedIntake.current = true;
      const lostUploads = firstCheck && readLostUploads(window.sessionStorage, unfinishedUploadsScope(draftOwnerId, context.orgId));
      const draft = onIntake && hasIntakeDraft(window.sessionStorage, intakeDraftScope(draftOwnerId, context.orgId));
      if (lostUploads || draft) openComposer(onIntake ? LAUNCHER : undefined);
    }, 0);
    return () => window.clearTimeout(timer);
  }, [context.orgId, draftOwnerId, openComposer, pathname]);

  const value = useMemo(() => ({ openComposer, preload }), [openComposer, preload]);
  return (
    <NewRequestContext.Provider value={value}>
      {children}
      {/* For the perf spec (e2e/perf.spec.ts): C after this has no chunk to wait for. */}
      <span hidden data-composer-ready={IntakeForm ? "true" : undefined} />
      {hasOpened && formHost && <>
        {/* Keep the controller and File objects alive in a detached host when the
            Arc dialog closes. Its overlay and focus scope still unmount normally. */}
        {IntakeForm && createPortal(<IntakeForm key={`${draftOwnerId}:${context.orgId}:${generation}`} context={context} draftOwnerId={draftOwnerId} initialProjectId={initialProjectId} active={open} onCreated={onCreated} onBusyChange={onBusyChange} onCancelCheckChange={onCancelCheckChange} />, formHost)}
        <Dialog open={open} onOpenChange={(next) => { if (!next && holdOpen()) return; setOpen(next); }}>
          <DialogContent layout="composer" title="New Request" description="Describe your Request and the result you expect."
            onOpenAutoFocus={event => {
              // The title in the compose step, the step's heading otherwise. Until
              // the form arrives, Radix focuses the close button.
              const target = formHost.querySelector<HTMLElement>("[data-composer-autofocus]");
              if (!target) return;
              event.preventDefault();
              target.focus({ preventScroll: true });
            }}
            onCloseAutoFocus={event => {
              event.preventDefault();
              // Focus goes back to the trigger. The welcome's New Request
              // unmounts when the first Request lands in its place (plan item
              // 2.1), so the new Request is next: its row, the list's one tab
              // stop (plan item 2.4), or the detail pane's link to it. Mobile
              // navigation stays mounted while closed, and its compose link
              // cannot receive focus once navigation is inert, so its opener
              // stands in. /intake's Create Request and the page's main region
              // come last. The document itself is never a target.
              const opener = trigger.current === LAUNCHER ? intakeLauncher() : trigger.current;
              const id = createdId.current;
              const created = id ? document.querySelector<HTMLElement>(requestRowSelector(id)) ?? document.getElementById(`request-${id}`) : null;
              const targets = [opener, created, ...document.querySelectorAll<HTMLElement>('button[aria-label="Expand sidebar"], button[aria-label="Open navigation"]'), intakeLauncher(), document.getElementById("lane-main")];
              for (const candidate of targets) {
                const target = focusable(candidate);
                if (!target?.isConnected || !target.getClientRects().length || target.closest("[hidden], [inert]") || getComputedStyle(target).visibility !== "visible") continue;
                target.focus({ preventScroll: true });
                if (document.activeElement !== target) continue;
                if (target === created) target.scrollIntoView({ block: "nearest" });
                break;
              }
            }}
            onEscapeKeyDown={event => { if (holdOpen()) event.preventDefault(); }}
            onInteractOutside={event => {
              const target = event.target;
              if (busy.current || isRequestPopoverEvent(event.detail.originalEvent) || (target instanceof Element && target.closest("[data-lane-request-property-popover]"))) {
                event.preventDefault();
              }
            }}>
            {!IntakeForm && <div className="p-6"><Skeleton label="Loading New Request" lines={5} /></div>}
            <div style={fill} ref={element => { if (element && formHost.parentElement !== element) element.appendChild(formHost); }} />
          </DialogContent>
        </Dialog>
      </>}
    </NewRequestContext.Provider>
  );
}
