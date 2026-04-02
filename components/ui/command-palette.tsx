"use client";

import { useEffect, useRef } from "react";
import { Command } from "cmdk";
import { useRouter } from "next/navigation";
import { useRequests } from "@/context/requests-context";

const PAGES = [
  { label: "Requests", href: "/dashboard" },
  { label: "Insights", href: "/dashboard/insights" },
  { label: "Ideas", href: "/dashboard/ideas" },
  { label: "Team", href: "/dashboard/team" },
];

const PHASE_LABELS: Record<string, string> = {
  predesign: "Predesign",
  design: "Design",
  dev: "Dev",
  track: "Track",
};

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

  return (
    // Backdrop
    <div
      className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-start justify-center pt-[18vh]"
      onClick={onClose}
    >
      {/* Palette */}
      <div
        className="w-full max-w-xl mx-4"
        onClick={(e) => e.stopPropagation()}
      >
        <Command
          className="bg-zinc-900 border border-zinc-700 rounded-xl shadow-2xl overflow-hidden"
          loop
        >
          <Command.Input
            ref={inputRef}
            placeholder="Search requests, pages…"
            className="w-full bg-transparent px-4 py-3.5 text-sm text-white placeholder-zinc-600 outline-none border-b border-zinc-800"
          />

          <Command.List className="max-h-80 overflow-y-auto py-2">
            <Command.Empty className="px-4 py-8 text-sm text-zinc-600 text-center">
              No results
            </Command.Empty>

            {/* Pages */}
            <Command.Group>
              <div className="text-[10px] text-zinc-600 uppercase tracking-wide px-4 pt-2 pb-1">
                Pages
              </div>
              {PAGES.map((p) => (
                <Command.Item
                  key={p.href}
                  value={`page ${p.label}`}
                  onSelect={() => navigate(p.href)}
                  className="flex items-center gap-3 px-4 py-2.5 text-sm text-zinc-300 cursor-pointer aria-selected:bg-zinc-800 rounded-lg mx-2"
                >
                  <span className="text-zinc-600 text-xs">⇒</span>
                  {p.label}
                </Command.Item>
              ))}
            </Command.Group>

            {/* Requests */}
            {requests.length > 0 && (
              <Command.Group>
                <div className="text-[10px] text-zinc-600 uppercase tracking-wide px-4 pt-3 pb-1">
                  Requests
                </div>
                {requests.map((r) => (
                  <Command.Item
                    key={r.id}
                    value={r.title}
                    onSelect={() => navigate(`/dashboard/requests/${r.id}`)}
                    className="flex items-center gap-3 px-4 py-2.5 text-sm text-zinc-300 cursor-pointer aria-selected:bg-zinc-800 rounded-lg mx-2"
                  >
                    <span className="flex-1 truncate">{r.title}</span>
                    {r.phase && (
                      <span className="text-[10px] text-zinc-600 shrink-0">
                        {PHASE_LABELS[r.phase] ?? r.phase}
                      </span>
                    )}
                  </Command.Item>
                ))}
              </Command.Group>
            )}

            {/* Create */}
            <Command.Group>
              <div className="text-[10px] text-zinc-600 uppercase tracking-wide px-4 pt-3 pb-1">
                Create
              </div>
              <Command.Item
                value="create new request"
                onSelect={() => navigate("/dashboard")}
                className="flex items-center gap-3 px-4 py-2.5 text-sm text-zinc-300 cursor-pointer aria-selected:bg-zinc-800 rounded-lg mx-2"
              >
                + New request
              </Command.Item>
              <Command.Item
                value="create new idea"
                onSelect={() => navigate("/dashboard/ideas")}
                className="flex items-center gap-3 px-4 py-2.5 text-sm text-zinc-300 cursor-pointer aria-selected:bg-zinc-800 rounded-lg mx-2"
              >
                + New idea
              </Command.Item>
            </Command.Group>
          </Command.List>

          <div className="border-t border-zinc-800 px-4 py-2 flex items-center gap-3">
            <span className="text-[10px] text-zinc-700">↑↓ navigate</span>
            <span className="text-[10px] text-zinc-700">↵ open</span>
            <span className="text-[10px] text-zinc-700">Esc close</span>
          </div>
        </Command>
      </div>
    </div>
  );
}
