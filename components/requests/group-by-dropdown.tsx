"use client";

import { ChevronDown } from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Button } from "@/components/ui/button";

export type GroupByOption =
  | "none"
  | "phase"
  | "stage"
  | "project"
  | "assignee"
  | "priority"
  | "cycle";

const GROUP_BY_OPTIONS: { value: GroupByOption; label: string }[] = [
  { value: "none", label: "None" },
  { value: "phase", label: "Phase" },
  { value: "stage", label: "Stage" },
  { value: "project", label: "Project" },
  { value: "assignee", label: "Assignee" },
  { value: "priority", label: "Priority" },
  { value: "cycle", label: "Cycle" },
];

interface GroupByDropdownProps {
  value: GroupByOption;
  onChange: (value: GroupByOption) => void;
}

export function GroupByDropdown({ value, onChange }: GroupByDropdownProps) {
  const selectedLabel =
    GROUP_BY_OPTIONS.find((o) => o.value === value)?.label ?? "None";

  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        render={<Button variant="outline" size="default" />}
        className="gap-1 font-mono text-[11px] font-medium text-muted-foreground whitespace-nowrap"
      >
        <span className="text-muted-foreground/60">Group:</span>
        <span className="text-foreground ml-0.5">{selectedLabel}</span>
        <ChevronDown size={12} className="ml-0.5 text-muted-foreground/60" />
      </DropdownMenuTrigger>

      <DropdownMenuContent align="start" sideOffset={4} className="min-w-[140px]">
        {GROUP_BY_OPTIONS.map((option) => (
          <DropdownMenuItem
            key={option.value}
            onSelect={() => onChange(option.value)}
            className={
              value === option.value
                ? "font-mono text-[11px] font-semibold text-primary bg-muted"
                : "font-mono text-[11px]"
            }
          >
            {option.label}
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
