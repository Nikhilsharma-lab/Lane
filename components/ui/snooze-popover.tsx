"use client";

import { useState, useRef, useEffect } from "react";
import { addDays, addWeeks, format } from "date-fns";
import { Clock } from "lucide-react";

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
    <div ref={ref} style={{ position: "relative", display: "inline-block" }}>
      <button
        onClick={() => setOpen(!open)}
        className="bg-muted text-muted-foreground border border-border"
        style={{
          display: "inline-flex",
          alignItems: "center",
          gap: 5,
          height: 30,
          padding: "0 10px",
          borderRadius: 5,
          fontSize: 12,
          fontFamily: "'Geist Mono', monospace",
          fontWeight: 500,
          cursor: "pointer",
          transition: "background 0.1s",
        }}
      >
        <Clock size={13} />
        {label}
      </button>

      {open && (
        <div
          className="bg-card border border-border"
          style={{
            position: "absolute",
            top: "calc(100% + 6px)",
            right: 0,
            width: 220,
            borderRadius: 8,
            boxShadow: "0 8px 24px rgba(0,0,0,0.08)",
            zIndex: 50,
            padding: 6,
          }}
        >
          {presets.map((p) => (
            <button
              key={p.label}
              onClick={() => handlePreset(p.date)}
              className="text-foreground hover:bg-accent"
              style={{
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
                width: "100%",
                padding: "7px 10px",
                borderRadius: 5,
                fontSize: 12,
                fontFamily: "'Geist', sans-serif",
                background: "transparent",
                border: "none",
                cursor: "pointer",
                transition: "background 0.1s",
              }}
            >
              <span style={{ fontWeight: 500 }}>{p.label}</span>
              <span
                className="text-muted-foreground/60"
                style={{
                  fontFamily: "'Geist Mono', monospace",
                  fontSize: 10,
                }}
              >
                {format(p.date, "MMM d")}
              </span>
            </button>
          ))}

          <div
            className="border-t border-border"
            style={{
              margin: "4px 0",
            }}
          />

          <div style={{ padding: "4px 10px 6px" }}>
            <span
              className="text-muted-foreground/60"
              style={{
                fontFamily: "'Geist Mono', monospace",
                fontSize: 9,
                fontWeight: 500,
                textTransform: "uppercase",
                letterSpacing: "0.06em",
              }}
            >
              CUSTOM DATE
            </span>
            <div style={{ display: "flex", gap: 4, marginTop: 4 }}>
              <input
                type="date"
                value={customDate}
                onChange={(e) => setCustomDate(e.target.value)}
                min={format(addDays(now, 1), "yyyy-MM-dd")}
                className="bg-muted border border-border text-foreground"
                style={{
                  flex: 1,
                  height: 28,
                  padding: "0 6px",
                  borderRadius: 4,
                  fontSize: 11,
                  fontFamily: "'Geist Mono', monospace",
                  outline: "none",
                }}
              />
              <button
                onClick={handleCustomConfirm}
                disabled={!customDate}
                className={customDate ? "bg-primary text-white" : "bg-accent text-muted-foreground"}
                style={{
                  height: 28,
                  padding: "0 8px",
                  borderRadius: 4,
                  fontSize: 11,
                  fontFamily: "'Geist Mono', monospace",
                  fontWeight: 600,
                  border: "none",
                  cursor: customDate ? "pointer" : "default",
                }}
              >
                Set
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
