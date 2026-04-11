"use client";

import { AlignJustify, LayoutGrid, Columns, type LucideIcon } from "lucide-react";

export type ViewMode = "list" | "board" | "kanban";

interface ViewModeToggleProps {
  value: ViewMode;
  onChange: (mode: ViewMode) => void;
  availableModes: ViewMode[];
}

const MODE_CONFIG: {
  mode: ViewMode;
  label: string;
  Icon: LucideIcon;
}[] = [
  { mode: "list", label: "List", Icon: AlignJustify },
  { mode: "board", label: "Board", Icon: LayoutGrid },
  { mode: "kanban", label: "Kanban", Icon: Columns },
];

export function ViewModeToggle({
  value,
  onChange,
  availableModes,
}: ViewModeToggleProps) {
  const visibleModes = MODE_CONFIG.filter((m) =>
    availableModes.includes(m.mode)
  );

  if (visibleModes.length <= 1) return null;

  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        border: "1px solid var(--border)",
        borderRadius: 6,
        overflow: "hidden",
        height: 28,
      }}
    >
      {visibleModes.map(({ mode, label, Icon }) => {
        const isActive = value === mode;
        return (
          <button
            key={mode}
            title={label}
            aria-label={label}
            aria-pressed={isActive}
            onClick={() => onChange(mode)}
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              width: 30,
              height: "100%",
              border: "none",
              borderRight: "1px solid var(--border)",
              background: isActive ? "var(--bg-hover)" : "var(--bg-surface)",
              color: isActive ? "var(--text-primary)" : "var(--text-tertiary)",
              cursor: "pointer",
              transition: "background 0.1s, color 0.1s",
            }}
            className="hover:bg-[var(--bg-hover)]"
          >
            <Icon size={13} />
          </button>
        );
      })}
    </div>
  );
}
