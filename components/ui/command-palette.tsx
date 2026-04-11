"use client";

import { useEffect, useRef } from "react";
import { Command } from "cmdk";
import { useRouter } from "next/navigation";
import { useRequests } from "@/context/requests-context";
import {
  LayoutDashboard,
  Inbox,
  Hammer,
  Target,
  Lightbulb,
  RefreshCw,
  Layers,
  BarChart3,
  Users,
  Settings,
  Plus,
  StickyNote,
} from "lucide-react";

// ── Navigation items ────────────────────────────────────────────────────────

const NAV_ITEMS = [
  { label: "Requests",     href: "/dashboard",              icon: LayoutDashboard, keys: ["G", "R"] },
  { label: "Intake",       href: "/dashboard/intake",       icon: Inbox,           keys: ["G", "I"] },
  { label: "Dev Board",    href: "/dashboard/dev",          icon: Hammer,          keys: ["G", "D"] },
  { label: "Betting Board",href: "/dashboard/betting",      icon: Target,          keys: ["G", "B"] },
  { label: "Ideas",        href: "/dashboard/ideas",        icon: Lightbulb,       keys: ["G", "A"] },
  { label: "Cycles",       href: "/dashboard/cycles",       icon: RefreshCw,       keys: ["G", "C"] },
  { label: "Initiatives",  href: "/dashboard/initiatives",  icon: Layers,          keys: ["G", "L"] },
  { label: "Insights",     href: "/dashboard/insights",     icon: BarChart3,       keys: ["G", "N"] },
  { label: "Team",         href: "/dashboard/team",         icon: Users,           keys: ["G", "T"] },
  { label: "Settings",     href: "/settings",               icon: Settings,        keys: ["G", "S"] },
];

const CREATE_ITEMS = [
  { label: "New Request",  href: "/dashboard?new=1",             icon: Plus,       keys: ["N", "R"] },
  { label: "New Idea",     href: "/dashboard/ideas?new=1",       icon: Lightbulb,  keys: ["N", "I"] },
  { label: "New Sticky",   href: "/dashboard/stickies?new=1",    icon: StickyNote, keys: ["N", "S"] },
];

// ── Phase labels ────────────────────────────────────────────────────────────

const PHASE_LABELS: Record<string, string> = {
  predesign: "Predesign",
  design: "Design",
  dev: "Dev",
  track: "Track",
};

// ── Kbd badge ───────────────────────────────────────────────────────────────

function Kbd({ children }: { children: string }) {
  return (
    <kbd
      className="bg-muted border border-border text-muted-foreground/60"
      style={{
        display: "inline-flex",
        alignItems: "center",
        justifyContent: "center",
        minWidth: 18,
        height: 18,
        padding: "0 4px",
        borderRadius: 3,
        fontSize: 10,
        fontFamily: "'Geist Mono', monospace",
        fontWeight: 500,
        lineHeight: 1,
      }}
    >
      {children}
    </kbd>
  );
}

// ── Main component ──────────────────────────────────────────────────────────

export function CommandPalette({ onClose }: { onClose: () => void }) {
  const requests = useRequests();
  const router = useRouter();
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  function navigate(href: string) {
    router.push(href);
    onClose();
  }

  const limitedRequests = requests.slice(0, 10);

  return (
    // Backdrop
    <div
      className="fixed inset-0 z-50 bg-foreground/40 backdrop-blur-sm flex items-start justify-center pt-[18vh]"
      onClick={onClose}
    >
      {/* Palette */}
      <div
        className="w-full max-w-xl mx-4"
        onClick={(e) => e.stopPropagation()}
      >
        <Command
          className="bg-card border border-border rounded-xl shadow-2xl overflow-hidden"
          loop
        >
          <Command.Input
            ref={inputRef}
            placeholder="Search requests, pages..."
            className="w-full bg-transparent px-4 py-3.5 text-sm text-foreground placeholder:text-muted-foreground/60 outline-none border-b border-border"
          />

          <Command.List className="max-h-80 overflow-y-auto py-2">
            <Command.Empty className="px-4 py-8 text-sm text-muted-foreground/60 text-center">
              No results
            </Command.Empty>

            {/* Navigation */}
            <Command.Group>
              <div className="text-[10px] text-muted-foreground/60 uppercase tracking-wide px-4 pt-2 pb-1">
                Navigation
              </div>
              {NAV_ITEMS.map((item) => {
                const Icon = item.icon;
                return (
                  <Command.Item
                    key={item.href}
                    value={`go to ${item.label}`}
                    onSelect={() => navigate(item.href)}
                    className="flex items-center gap-3 px-4 py-2.5 text-sm text-foreground cursor-pointer aria-selected:bg-accent rounded-lg mx-2"
                  >
                    <Icon size={14} className="text-muted-foreground/60 shrink-0" />
                    <span className="flex-1">{item.label}</span>
                    <span className="flex items-center gap-1 shrink-0">
                      <Kbd>{item.keys[0]}</Kbd>
                      <span className="text-muted-foreground/60 text-[9px]">then</span>
                      <Kbd>{item.keys[1]}</Kbd>
                    </span>
                  </Command.Item>
                );
              })}
            </Command.Group>

            {/* Creation */}
            <Command.Group>
              <div className="text-[10px] text-muted-foreground/60 uppercase tracking-wide px-4 pt-3 pb-1">
                Create
              </div>
              {CREATE_ITEMS.map((item) => {
                const Icon = item.icon;
                return (
                  <Command.Item
                    key={item.href}
                    value={`create ${item.label}`}
                    onSelect={() => navigate(item.href)}
                    className="flex items-center gap-3 px-4 py-2.5 text-sm text-foreground cursor-pointer aria-selected:bg-accent rounded-lg mx-2"
                  >
                    <Icon size={14} className="text-muted-foreground/60 shrink-0" />
                    <span className="flex-1">{item.label}</span>
                    <span className="flex items-center gap-1 shrink-0">
                      <Kbd>{item.keys[0]}</Kbd>
                      <span className="text-muted-foreground/60 text-[9px]">then</span>
                      <Kbd>{item.keys[1]}</Kbd>
                    </span>
                  </Command.Item>
                );
              })}
            </Command.Group>

            {/* Requests */}
            {limitedRequests.length > 0 && (
              <Command.Group>
                <div className="text-[10px] text-muted-foreground/60 uppercase tracking-wide px-4 pt-3 pb-1">
                  Requests
                </div>
                {limitedRequests.map((r) => (
                  <Command.Item
                    key={r.id}
                    value={r.title}
                    onSelect={() => navigate(`/dashboard/requests/${r.id}`)}
                    className="flex items-center gap-3 px-4 py-2.5 text-sm text-foreground cursor-pointer aria-selected:bg-accent rounded-lg mx-2"
                  >
                    <span className="flex-1 truncate">{r.title}</span>
                    {r.phase && (
                      <span className="text-[10px] text-muted-foreground/60 shrink-0">
                        {PHASE_LABELS[r.phase] ?? r.phase}
                      </span>
                    )}
                  </Command.Item>
                ))}
              </Command.Group>
            )}
          </Command.List>

          <div className="border-t border-border px-4 py-2 flex items-center gap-3">
            <span className="text-[10px] text-muted-foreground/60">↑↓ navigate</span>
            <span className="text-[10px] text-muted-foreground/60">↵ open</span>
            <span className="text-[10px] text-muted-foreground/60">Esc close</span>
            <span className="text-[10px] text-muted-foreground/60 ml-auto">
              <Kbd>G</Kbd> <span className="mx-0.5">+</span> <Kbd>key</Kbd> go to
            </span>
            <span className="text-[10px] text-muted-foreground/60">
              <Kbd>N</Kbd> <span className="mx-0.5">+</span> <Kbd>key</Kbd> create
            </span>
          </div>
        </Command>
      </div>
    </div>
  );
}
