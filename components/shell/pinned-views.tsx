"use client";

import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";
import { Pin } from "lucide-react";

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
      <div className="px-2.5 py-2">
        <p
          style={{
            fontFamily: "'Geist Mono', monospace",
            fontSize: 10,
            color: "var(--text-tertiary)",
            lineHeight: 1.4,
          }}
        >
          Save a filtered view from Requests to pin it here
        </p>
      </div>
    );
  }

  return (
    <div className="py-0.5 px-1">
      {views.map((view) => {
        const href = buildViewHref(view);
        const isActive = currentUrl.includes(href);

        return (
          <Link
            key={view.id}
            href={href}
            className="flex items-center gap-2 px-2.5 py-[6px] rounded-[7px] transition-colors hover:bg-[var(--bg-hover)]"
            style={{
              background: isActive ? "var(--bg-hover)" : undefined,
            }}
          >
            <Pin size={12} style={{ color: "var(--text-tertiary)", flexShrink: 0 }} />
            <span
              className="truncate"
              style={{
                fontSize: 12,
                fontWeight: isActive ? 540 : 440,
                color: isActive ? "var(--text-primary)" : "var(--text-tertiary)",
                letterSpacing: "-0.01em",
              }}
            >
              {view.name}
            </span>
          </Link>
        );
      })}
    </div>
  );
}
