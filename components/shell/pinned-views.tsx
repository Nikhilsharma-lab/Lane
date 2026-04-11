"use client";

import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";
import { Pin } from "lucide-react";
import {
  SidebarMenu,
  SidebarMenuItem,
  SidebarMenuButton,
} from "@/components/ui/sidebar";

interface PinnedView {
  id: string;
  name: string;
  viewType: string;
  filters: Record<string, unknown>;
  groupBy: string | null;
  viewMode: string;
}

interface Props {
  views: PinnedView[];
}

function buildViewHref(view: PinnedView): string {
  const params = new URLSearchParams();
  const filters = view.filters as Record<string, string[] | undefined>;

  if (filters.phase?.length === 1) params.set("phase", filters.phase[0]);
  if (filters.priority?.length === 1) params.set("priority", filters.priority[0]);
  if (filters.projectId?.length === 1) params.set("project", filters.projectId[0]);
  if (filters.assigneeId?.length === 1) params.set("assignee", filters.assigneeId[0]);
  if (filters.designStage?.length === 1) params.set("stage", filters.designStage[0]);
  if (view.groupBy) params.set("group", view.groupBy);
  if (view.viewMode && view.viewMode !== "list") params.set("view", view.viewMode);

  const qs = params.toString();
  return `/dashboard/requests${qs ? `?${qs}` : ""}`;
}

export function PinnedViews({ views }: Props) {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const currentUrl = `${pathname}?${searchParams.toString()}`;

  if (views.length === 0) {
    return (
      <p className="px-2 py-2 text-[10px] font-mono text-muted-foreground/60 leading-snug">
        Save a filtered view from Requests to pin it here
      </p>
    );
  }

  return (
    <SidebarMenu>
      {views.map((view) => {
        const href = buildViewHref(view);
        const isActive = currentUrl.includes(href);

        return (
          <SidebarMenuItem key={view.id}>
            <Link href={href} className="contents">
              <SidebarMenuButton
                isActive={isActive}
                tooltip={view.name}
                size="sm"
              >
                <Pin className="size-3" />
                <span>{view.name}</span>
              </SidebarMenuButton>
            </Link>
          </SidebarMenuItem>
        );
      })}
    </SidebarMenu>
  );
}
