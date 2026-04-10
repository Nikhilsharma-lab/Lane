import Link from "next/link";

const statusStyles: Record<string, string> = {
  active: "bg-green-500/10 text-green-600 border-green-500/20",
  completed: "bg-[#7DA5C4]/10 text-[#7DA5C4] border-[#7DA5C4]/20",
  archived: "bg-[var(--bg-hover)] text-[var(--text-tertiary)] border-[var(--border)]",
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
      className="block border border-[var(--border)] rounded-xl p-4 bg-[var(--bg-surface)] space-y-3 hover:border-[var(--border-strong)] transition-colors"
    >
      {/* Header */}
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-center gap-2">
          <span
            className="inline-block w-3 h-3 rounded-full shrink-0"
            style={{ background: color }}
          />
          <h3 className="text-sm font-medium text-[var(--text-primary)] leading-snug">
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
        <p className="text-xs text-[var(--text-secondary)] leading-relaxed line-clamp-2">
          {description}
        </p>
      )}

      {/* Footer */}
      <div className="flex items-center justify-between">
        <span className="text-[11px] text-[var(--text-tertiary)]">
          {requestCount} request{requestCount !== 1 ? "s" : ""}
        </span>
      </div>
    </Link>
  );
}
