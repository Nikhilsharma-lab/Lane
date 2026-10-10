"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useContext, type ComponentProps } from "react";
import { NewRequestContext } from "./new-request-context";
import { projectIdOrNull } from "@/lib/request-constants";
import { parseRequestProjectFilter } from "@/lib/request-workspace";

/** Keeps direct/new-tab navigation working while ordinary activation opens Intake in context. */
export function NewRequestLink({ onClick, ...props }: Omit<ComponentProps<typeof Link>, "href">) {
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
      onClick={(event) => {
        onClick?.(event);
        if (!composer || event.defaultPrevented || event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey || (props.target && props.target !== "_self")) return;
        event.preventDefault();
        composer.openComposer(event.currentTarget);
      }}
    />
  );
}
