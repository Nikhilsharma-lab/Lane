"use client";

import { AlignJustify, LayoutGrid, Columns, type LucideIcon } from "lucide-react";
import { Button } from "@/components/ui/button";

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
    <div className="flex items-center border border-border rounded-md overflow-hidden h-7">
      {visibleModes.map(({ mode, label, Icon }) => {
        const isActive = value === mode;
        return (
          <Button
            key={mode}
            variant="ghost"
            size="icon"
            title={label}
            aria-label={label}
            aria-pressed={isActive}
            onClick={() => onChange(mode)}
            className={`w-[30px] h-full rounded-none border-r border-border ${
              isActive
                ? "bg-accent text-foreground"
                : "bg-card text-muted-foreground/60"
            } hover:bg-accent`}
          >
            <Icon size={13} />
          </Button>
        );
      })}
    </div>
  );
}
