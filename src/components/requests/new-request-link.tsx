"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useContext, type ComponentProps } from "react";
import { NewRequestContext } from "./new-request-context";
import { projectIdOrNull } from "@/lib/request-constants";
import { parseRequestProjectFilter } from "@/lib/request-workspace";

/** Keeps direct/new-tab navigation working while ordinary activation opens Intake in context. */
export function NewRequestLink({ onClick, onPointerEnter, onPointerDown, onFocus, guided, ...props }: Omit<ComponentProps<typeof Link>, "href"> & {
  /** #217: the first-run guide's link opens a composer that explains each step. */
  guided?: boolean;
}) {
  const composer = useContext(NewRequestContext);
  const searchParams = useSearchParams();
  const projectId = projectIdOrNull(parseRequestProjectFilter(searchParams.get("project")));
  const href = projectId ? `/intake?project=${projectId}` : "/intake";
  return (
    <Link
      {...props}
      href={href}
      aria-haspopup={composer ? "dialog" : undefined}
      aria-keyshortcuts={composer ? "C" : undefined}
      onPointerEnter={(event) => { onPointerEnter?.(event); composer?.preload(); }}
      // #267: a touch has no hover; its press starts the composer's code on its way.
      onPointerDown={(event) => { onPointerDown?.(event); composer?.preload(); }}
      onFocus={(event) => { onFocus?.(event); composer?.preload(); }}
      onClick={(event) => {
        onClick?.(event);
        if (!composer || event.defaultPrevented || event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey || (props.target && props.target !== "_self")) return;
        event.preventDefault();
        composer.openComposer(event.currentTarget, guided ? { guided } : undefined);
      }}
    />
  );
}
