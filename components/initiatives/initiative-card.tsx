import Link from "next/link";

const statusStyles: Record<string, string> = {
  active: "bg-accent-success/10 text-accent-success border-accent-success/20",
  completed: "bg-[var(--phase-dev)]/10 text-[var(--phase-dev)] border-[var(--phase-dev)]/20",
  archived: "bg-accent text-muted-foreground/60 border",
};

interface InitiativeCardProps {
  id: string;
  name: string;
  description: string | null;
  color: string;
  status: string;
  requestCount: number;
}

export function InitiativeCard({
  id,
  name,
  description,
  color,
  status,
  requestCount,
}: InitiativeCardProps) {
  return (
    <Link
      href={`/dashboard/initiatives/${id}`}
      className="block border border rounded-xl p-4 bg-card space-y-3 hover:border-border/80 transition-colors"
    >
      {/* Header */}
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-center gap-2">
          <span
            className="inline-block w-3 h-3 rounded-full shrink-0"
            style={{ background: color }}
          />
          <h3 className="text-sm font-medium text-foreground leading-snug">
            {name}
          </h3>
        </div>
        <span
          className={`text-[10px] px-1.5 py-0.5 rounded border font-medium capitalize shrink-0 ${statusStyles[status] ?? statusStyles.active}`}
        >
          {status}
        </span>
      </div>

      {/* Description */}
      {description && (
        <p className="text-xs text-muted-foreground leading-relaxed line-clamp-2">
          {description}
        </p>
      )}

      {/* Footer */}
      <div className="flex items-center justify-between">
        <span className="text-[11px] text-muted-foreground/60">
          {requestCount} request{requestCount !== 1 ? "s" : ""}
        </span>
      </div>
    </Link>
  );
}
