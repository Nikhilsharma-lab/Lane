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
    <div className="flex items-center border border-input rounded-md overflow-hidden">
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
            className={`size-7 rounded-none border-r border-input last:border-r-0 ${
              isActive
                ? "bg-accent text-foreground"
                : "text-muted-foreground/60"
            } hover:bg-accent`}
          >
            <Icon size={13} />
          </Button>
        );
      })}
    </div>
  );
}
