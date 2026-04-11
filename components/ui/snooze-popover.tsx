"use client";

import { useState, useRef, useEffect } from "react";
import { addDays, addWeeks, format } from "date-fns";
import { Clock } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Separator } from "@/components/ui/separator";

interface SnoozePopoverProps {
  onSnooze: (until: Date) => void;
  label?: string;
}

export function SnoozePopover({ onSnooze, label = "Snooze" }: SnoozePopoverProps) {
  const [open, setOpen] = useState(false);
  const [customDate, setCustomDate] = useState("");
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    if (open) {
      document.addEventListener("mousedown", handleClickOutside);
      return () => document.removeEventListener("mousedown", handleClickOutside);
    }
  }, [open]);

  const now = new Date();
  const presets = [
    { label: "Tomorrow", date: addDays(now, 1) },
    { label: "Next week", date: addWeeks(now, 1) },
    { label: "In 2 weeks", date: addWeeks(now, 2) },
  ];

  function handlePreset(date: Date) {
    onSnooze(date);
    setOpen(false);
  }

  function handleCustomConfirm() {
    if (!customDate) return;
    onSnooze(new Date(customDate));
    setCustomDate("");
    setOpen(false);
  }

  return (
    <div ref={ref} className="relative inline-block">
      <Button
        variant="outline"
        size="sm"
        className="gap-1.5 font-mono"
        onClick={() => setOpen(!open)}
      >
        <Clock className="size-3.5" />
        {label}
      </Button>

      {open && (
        <div className="absolute top-[calc(100%+6px)] right-0 w-[220px] rounded-lg bg-card border shadow-lg z-50 p-1.5">
          {presets.map((p) => (
            <button
              key={p.label}
              onClick={() => handlePreset(p.date)}
              className="flex items-center justify-between w-full px-2.5 py-1.5 rounded-md text-xs text-foreground hover:bg-accent transition-colors bg-transparent border-none cursor-pointer"
            >
              <span className="font-medium">{p.label}</span>
              <span className="font-mono text-[10px] text-muted-foreground/60">
                {format(p.date, "MMM d")}
              </span>
            </button>
          ))}

          <Separator className="my-1" />

          <div className="px-2.5 py-1.5">
            <span className="font-mono text-[9px] font-medium tracking-[0.06em] uppercase text-muted-foreground/60">
              Custom date
            </span>
            <div className="flex gap-1 mt-1">
              <Input
                type="date"
                value={customDate}
                onChange={(e) => setCustomDate(e.target.value)}
                min={format(addDays(now, 1), "yyyy-MM-dd")}
                className="flex-1 h-7 font-mono text-[11px]"
              />
              <Button
                size="sm"
                variant={customDate ? "default" : "secondary"}
                onClick={handleCustomConfirm}
                disabled={!customDate}
                className="h-7 font-mono text-[11px]"
              >
                Set
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
