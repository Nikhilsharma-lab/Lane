"use client";

import dynamic from "next/dynamic";
import { createPortal } from "react-dom";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { useToastStack } from "@/components/arc/toast-stack/toast-stack";
import { Skeleton } from "@/components/arc/skeleton/skeleton";
import { Drawer, DrawerContent } from "@/components/arc/drawer/drawer";
import { NewRequestContext } from "./new-request-context";
import { usePendingMutationWriter } from "./pending-mutations-provider";
import type { OverviewRequest } from "@/lib/request-overview";
import { projectIdOrNull } from "@/lib/request-constants";
import { parseRequestProjectFilter, parseRequestStatusFilter, requestDetailHref, type RequestProjectFilter, type RequestStatusFilter } from "@/lib/request-workspace";

export { NewRequestLink } from "./new-request-link";

const IntakeForm = dynamic(() => import("@/app/(app)/intake/intake-form"), {
  loading: () => <Skeleton label="Loading New Request" lines={5} />,
});

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
  const insert = usePendingMutationWriter()?.insert;
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const projectFilter = parseRequestProjectFilter(searchParams.get("project"));
  const projectId = projectIdOrNull(projectFilter);
  const statusFilter = parseRequestStatusFilter(searchParams.get("status") ?? undefined);
  const [open, setOpen] = useState(false);
  const [hasOpened, setHasOpened] = useState(false);
  const [generation, setGeneration] = useState(0);
  const [initialProjectId, setInitialProjectId] = useState<string | null>(null);
  const [returnContext, setReturnContext] = useState<{ status: RequestStatusFilter; project: RequestProjectFilter }>({ status: "all", project: "all" });
  const [formHost, setFormHost] = useState<HTMLDivElement | null>(null);
  const busy = useRef(false);
  const completed = useRef(false);
  const trigger = useRef<HTMLElement | null>(null);
  const directEntry = pathname === "/intake";

  const openComposer = useCallback((element?: HTMLElement) => {
    if (directEntry) {
      document.getElementById("intake-title")?.focus();
      return;
    }
    trigger.current = element ?? (document.activeElement instanceof HTMLElement ? document.activeElement : null);
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
    setFormHost(current => current ?? document.createElement("div"));
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
  // already carries the created Request. A router refresh would render twice.
  // When the composer hands over the saved row, the overlay shows it in the
  // Open group at once and keeps it there if a navigation drops that response.
  const onCreated = useCallback((requestId: string, created?: OverviewRequest) => {
    if (created?.id === requestId) insert?.(created);
    completed.current = true;
    busy.current = false;
    setOpen(false);
    toast({ type: "success", title: "Request created",
      description: "Open and ready to be picked up.",
      action: { label: "Open Request", onClick: () => router.push(requestDetailHref(requestId, returnContext.status, returnContext.project)) },
    });
  }, [insert, returnContext, router, toast]);

  const value = useMemo(() => ({ openComposer }), [openComposer]);
  return (
    <NewRequestContext.Provider value={directEntry ? null : value}>
      {children}
      {hasOpened && !directEntry && formHost && <>
        {/* Keep the controller and File objects alive in a detached host when the
            Arc drawer closes. Its overlay and focus scope still unmount normally. */}
        {createPortal(<IntakeForm key={`${draftOwnerId}:${context.orgId}:${generation}`} context={context} draftOwnerId={draftOwnerId} initialProjectId={initialProjectId} presentation="dialog" active={open} onCreated={onCreated} onBusyChange={onBusyChange} />, formHost)}
        <Drawer open={open} onOpenChange={(next) => { if (!next && busy.current) return; setOpen(next); }}>
          <DrawerContent title="New Request" description="Describe your Request and the result you expect."
            onOpenAutoFocus={event => { event.preventDefault(); document.getElementById("intake-title")?.focus(); }}
            onCloseAutoFocus={event => {
              event.preventDefault();
              // Mobile navigation stays mounted while closed. Its original
              // compose link cannot receive focus once the drawer is inert.
              const targets = [trigger.current, document.querySelector<HTMLElement>('button[aria-label="Open navigation"]'), document.getElementById("lane-main")];
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
            <div ref={element => { if (element && formHost.parentElement !== element) element.appendChild(formHost); }} />
          </DrawerContent>
        </Drawer>
      </>}
    </NewRequestContext.Provider>
  );
}
