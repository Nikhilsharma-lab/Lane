"use client";

import dynamic from "next/dynamic";
import { createPortal } from "react-dom";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { useToastStack } from "@/components/arc/toast-stack/toast-stack";
import { Skeleton } from "@/components/arc/skeleton/skeleton";
import { Drawer, DrawerContent } from "@/components/arc/drawer/drawer";
import { NewRequestContext } from "./new-request-context";
import { listFiltersOf, revealRequest, useListViewSnapshot, useRequestListContext, useSetRequestListView } from "./list-view-state";
import { requestCreatedToast } from "./request-created-toast";
import { matchesListFilters, type OverviewRequest } from "@/lib/request-overview";
import { projectIdOrNull } from "@/lib/request-constants";
import { readUnfinishedUploads, unfinishedUploadsScope } from "@/lib/unfinished-uploads";
import { parseRequestListContext, requestDetailHref, type RequestListContext } from "@/lib/request-workspace";

export { NewRequestLink } from "./new-request-link";

const IntakeForm = dynamic(() => import("@/app/(app)/intake/intake-form"), {
  loading: () => <Skeleton label="Loading New Request" lines={5} />,
});

// The compact drawer's body hands its height to its child, so the composer can
// scroll its own content and keep the footer at the bottom of the panel.
const fill = { display: "flex", flex: "1 1 auto", flexDirection: "column", minHeight: 0 } as const;

function createFormHost() {
  const host = document.createElement("div");
  Object.assign(host.style, fill);
  return host;
}

function isEditing(target: EventTarget | null) {
  return target instanceof Element && Boolean(target.closest("input, textarea, select, [contenteditable]:not([contenteditable='false']), [role='textbox'], [role='combobox']"));
}

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
  // mirror of it, and the fallback outside the layout's provider.
  const listContext = useRequestListContext();
  const { status: statusFilter, project: projectFilter } = listContext ?? parseRequestListContext(searchParams);
  const projectId = projectIdOrNull(projectFilter);
  const listSnapshot = useListViewSnapshot();
  const setListView = useSetRequestListView();
  const [open, setOpen] = useState(false);
  const [hasOpened, setHasOpened] = useState(false);
  const [generation, setGeneration] = useState(0);
  const [initialProjectId, setInitialProjectId] = useState<string | null>(null);
  const [returnContext, setReturnContext] = useState<RequestListContext>({ status: "all", project: "all" });
  const [formHost, setFormHost] = useState<HTMLDivElement | null>(null);
  const busy = useRef(false);
  const completed = useRef(false);
  const trigger = useRef<HTMLElement | null>(null);
  const createdId = useRef<string | null>(null);
  const directEntry = pathname === "/intake";

  const openComposer = useCallback((element?: HTMLElement) => {
    if (directEntry) {
      document.getElementById("intake-title")?.focus();
      return;
    }
    trigger.current = element ?? (document.activeElement instanceof HTMLElement ? document.activeElement : null);
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
    setHasOpened(true);
    setOpen(true);
  }, [directEntry, hasOpened, projectFilter, projectId, statusFilter]);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.defaultPrevented || event.repeat || event.isComposing || event.key.toLowerCase() !== "c" || event.metaKey || event.ctrlKey || event.altKey || event.shiftKey || isEditing(event.target)) return;
      const overlayOpen = Array.from(document.querySelectorAll<HTMLElement>('[role="dialog"], [role="alertdialog"], [role="menu"], [role="listbox"]'))
        .some((element) => element.getClientRects().length > 0 && element.getAttribute("aria-hidden") !== "true");
      if (overlayOpen) return;
      event.preventDefault();
      openComposer();
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [openComposer]);

  const onBusyChange = useCallback((value: boolean) => { busy.current = value; }, []);
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
    // Plan item 2.3 (S4): on the list, say when the current filters leave the
    // new Request out, and offer to show it. Filters never clear silently.
    const view = pathname === "/" && created?.id === requestId ? listSnapshot?.() : undefined;
    const hidden = Boolean(view && created && !matchesListFilters(created, listFiltersOf(view)));
    toast(requestCreatedToast({
      hidden,
      onOpen: () => router.push(href),
      onShow: created ? () => setListView((previous) => revealRequest(previous, created)) : undefined,
    }));
  }, [listSnapshot, pathname, returnContext, router, setListView, toast]);

  // Plan item 2.3 (S3): a reload interrupted uploads after a Request was
  // created. Once per document, after hydration, open the composer so it can
  // say which files weren't added. /intake shows it in the page itself.
  const checkedLostUploads = useRef(false);
  useEffect(() => {
    if (checkedLostUploads.current || directEntry) return;
    const timer = window.setTimeout(() => {
      checkedLostUploads.current = true;
      if (readUnfinishedUploads(window.sessionStorage, unfinishedUploadsScope(draftOwnerId, context.orgId))) openComposer();
    }, 0);
    return () => window.clearTimeout(timer);
  }, [context.orgId, directEntry, draftOwnerId, openComposer]);

  const value = useMemo(() => ({ openComposer }), [openComposer]);
  return (
    <NewRequestContext.Provider value={directEntry ? null : value}>
      {children}
      {hasOpened && !directEntry && formHost && <>
        {/* Keep the controller and File objects alive in a detached host when the
            Arc drawer closes. Its overlay and focus scope still unmount normally. */}
        {createPortal(<IntakeForm key={`${draftOwnerId}:${context.orgId}:${generation}`} context={context} draftOwnerId={draftOwnerId} initialProjectId={initialProjectId} presentation="dialog" active={open} onCreated={onCreated} onBusyChange={onBusyChange} />, formHost)}
        <Drawer open={open} onOpenChange={(next) => { if (!next && busy.current) return; setOpen(next); }}>
          <DrawerContent compact title="New Request" description="Describe your Request and the result you expect."
            onOpenAutoFocus={event => { event.preventDefault(); document.getElementById("intake-title")?.focus(); }}
            onCloseAutoFocus={event => {
              event.preventDefault();
              // Mobile navigation stays mounted while closed. Its original
              // compose link cannot receive focus once the drawer is inert.
              // The welcome's New Request unmounts when the first Request lands
              // in its place (plan item 2.1), so that row's title link is next.
              const created = createdId.current ? document.getElementById(`request-${createdId.current}`) : null;
              const targets = [trigger.current, created, document.querySelector<HTMLElement>('button[aria-label="Open navigation"]'), document.getElementById("lane-main")];
              for (const target of targets) {
                if (!target?.isConnected || !target.getClientRects().length || target.closest("[hidden], [inert]") || getComputedStyle(target).visibility !== "visible") continue;
                target.focus({ preventScroll: true });
                if (document.activeElement === target) break;
              }
            }}
            onEscapeKeyDown={event => { if (busy.current) event.preventDefault(); }}
            onInteractOutside={event => {
              const target = event.target;
              if (busy.current || (target instanceof Element && target.closest("[data-lane-request-property-popover]"))) {
                event.preventDefault();
              }
            }}>
            <div style={fill} ref={element => { if (element && formHost.parentElement !== element) element.appendChild(formHost); }} />
          </DrawerContent>
        </Drawer>
      </>}
    </NewRequestContext.Provider>
  );
}
