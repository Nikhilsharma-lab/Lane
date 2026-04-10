interface AppetiteBarProps {
  appetiteWeeks: number;
  startsAt: string | Date;
  endsAt: string | Date;
  completedCount: number;
  totalCount: number;
}

export function AppetiteBar({
  appetiteWeeks,
  startsAt,
  endsAt,
  completedCount,
  totalCount,
}: AppetiteBarProps) {
  const start = new Date(startsAt).getTime();
  const end = new Date(endsAt).getTime();
  const now = Date.now();
  const elapsed = Math.max(0, Math.min(1, (now - start) / (end - start)));
  const weeksElapsed = Math.round(elapsed * appetiteWeeks * 10) / 10;

  return (
    <div>
      <div className="flex items-center justify-between mb-1.5">
        <span
          style={{
            fontSize: 11,
            color: "var(--text-secondary)",
            fontWeight: 520,
          }}
        >
          {weeksElapsed} of {appetiteWeeks} weeks elapsed
        </span>
        <span
          style={{
            fontSize: 11,
            color: "var(--text-secondary)",
            fontWeight: 520,
          }}
        >
          {completedCount} of {totalCount} requests completed
        </span>
      </div>
      <div
        style={{
          width: "100%",
          height: 6,
          background: "var(--bg-hover)",
          borderRadius: 3,
          overflow: "hidden",
        }}
      >
        <div
          style={{
            height: "100%",
            width: `${elapsed * 100}%`,
            borderRadius: 3,
            background:
              elapsed > 0.9
                ? "#E07070"
                : elapsed > 0.7
                  ? "#D4A84B"
                  : "var(--accent)",
            transition: "width 300ms ease",
          }}
        />
      </div>
    </div>
  );
}
