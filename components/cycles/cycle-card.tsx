import Link from "next/link";
import { AppetiteBar } from "@/components/ui/appetite-bar";

const statusStyles: Record<string, string> = {
  draft: "bg-accent text-muted-foreground border",
  active: "bg-green-500/10 text-green-600 border-green-500/20",
  completed: "bg-[#7DA5C4]/10 text-[#7DA5C4] border-[#7DA5C4]/20",
  cancelled: "bg-red-500/10 text-red-500 border-red-500/20",
};

interface CycleCardProps {
  id: string;
  name: string;
  status: string;
  appetiteWeeks: number;
  startsAt: string | Date | null;
  endsAt: string | Date | null;
  projectName: string | null;
  projectColor: string | null;
  requestCount: number;
  completedCount: number;
}

export function CycleCard({
  id,
  name,
  status,
  appetiteWeeks,
  startsAt,
  endsAt,
  projectName,
  projectColor,
  requestCount,
  completedCount,
}: CycleCardProps) {
  const formatDate = (d: string | Date | null) => {
    if (!d) return "TBD";
    return new Date(d).toLocaleDateString("en-US", {
      month: "short",
      day: "numeric",
    });
  };

  return (
    <Link
      href={`/dashboard/cycles/${id}`}
      className="block border border rounded-xl p-4 bg-card space-y-3 hover:border-border/80 transition-colors"
    >
      {/* Header */}
      <div className="flex items-start justify-between gap-3">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-1.5 flex-wrap">
            <span
              className={`text-[10px] px-1.5 py-0.5 rounded border font-medium capitalize ${statusStyles[status] ?? statusStyles.draft}`}
            >
              {status}
            </span>
            {projectName && (
              <span className="flex items-center gap-1 text-[10px] text-muted-foreground/60">
                <span
                  className="inline-block w-2 h-2 rounded-full shrink-0"
                  style={{ background: projectColor ?? "#71717a" }}
                />
                {projectName}
              </span>
            )}
          </div>
          <h3 className="text-sm font-medium text-foreground leading-snug">
            {name}
          </h3>
        </div>

        {/* Appetite + date range */}
        <div className="shrink-0 text-right">
          <span className="text-xs font-mono text-muted-foreground">
            {appetiteWeeks}w
          </span>
          <p className="text-[10px] text-muted-foreground/60 mt-0.5">
            {formatDate(startsAt)} – {formatDate(endsAt)}
          </p>
        </div>
      </div>

      {/* Appetite bar */}
      {startsAt && endsAt && (
        <AppetiteBar
          appetiteWeeks={appetiteWeeks}
          startsAt={startsAt}
          endsAt={endsAt}
          completedCount={completedCount}
          totalCount={requestCount}
        />
      )}

      {/* Request count footer */}
      <div className="flex items-center justify-between">
        <span className="text-[11px] text-muted-foreground/60">
          {requestCount} request{requestCount !== 1 ? "s" : ""}
        </span>
        {requestCount > 0 && (
          <span className="text-[11px] text-muted-foreground/60">
            {completedCount}/{requestCount} completed
          </span>
        )}
      </div>
    </Link>
  );
}
