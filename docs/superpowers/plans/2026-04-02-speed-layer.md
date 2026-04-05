# Speed Layer Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add Linear-speed keyboard-first UX to Lane — command palette (Cmd+K), J/K navigation, quick capture (Cmd+N), and optimistic UI on all mutations.

**Architecture:** A `RequestsContext` fetches org requests at layout level so the command palette can search them from any page without extra API calls. A `GlobalShortcutsProvider` (client component) manages keyboard listeners and renders modals at the root. Optimistic UI uses manual `useState` + rollback pattern (React 18 — no `useOptimistic`).

**Tech Stack:** Next.js 14 App Router, React 18, Tailwind CSS, `cmdk` library

---

## File Map

| File | Action | Responsibility |
|------|--------|---------------|
| `context/requests-context.tsx` | Create | Holds org request list for command palette search |
| `app/(dashboard)/layout.tsx` | Create | Fetches org requests server-side, wraps pages with providers |
| `components/ui/global-shortcuts-provider.tsx` | Create | Keyboard listeners, state for all modals, renders palette/quick-capture/cheatsheet |
| `components/ui/command-palette.tsx` | Create | Cmd+K palette using cmdk |
| `components/ui/quick-capture.tsx` | Create | Cmd+N floating request capture modal |
| `components/ui/keyboard-shortcuts.tsx` | Create | `?` keyboard cheatsheet modal |
| `hooks/use-keyboard-nav.ts` | Create | J/K list navigation hook |
| `components/requests/request-list.tsx` | Modify | Wire J/K nav + shortcut hint bar |
| `components/requests/assign-panel.tsx` | Modify | Optimistic UI on assign/unassign |
| `components/requests/validation-gate.tsx` | Modify | Optimistic UI on sign-off |
| `components/requests/predesign-panel.tsx` | Modify | Optimistic UI on advance |
| `components/requests/design-phase-panel.tsx` | Modify | Optimistic UI on advance |
| `components/requests/dev-phase-panel.tsx` | Modify | Optimistic UI on kanban moves |
| `components/requests/track-phase-panel.tsx` | Modify | Optimistic UI on impact save |
| `components/ideas/idea-card.tsx` | Modify | Optimistic UI on vote |

---

## Task 1: Install cmdk + Create RequestsContext

**Files:**
- Create: `context/requests-context.tsx`

- [ ] **Step 1: Install cmdk**

```bash
cd /Users/yashkaushal/Lane
npm install cmdk
```

Expected output: `added 1 package`

- [ ] **Step 2: Create the requests context**

Create `context/requests-context.tsx`:

```tsx
"use client";

import { createContext, useContext } from "react";
import type { Request } from "@/db/schema";

const RequestsContext = createContext<Request[]>([]);

export function RequestsProvider({
  requests,
  children,
}: {
  requests: Request[];
  children: React.ReactNode;
}) {
  return (
    <RequestsContext.Provider value={requests}>
      {children}
    </RequestsContext.Provider>
  );
}

export function useRequests(): Request[] {
  return useContext(RequestsContext);
}
```

- [ ] **Step 3: Verify types**

```bash
npx tsc --noEmit
```

Expected: no output (clean).

- [ ] **Step 4: Commit**

```bash
git add context/requests-context.tsx package.json package-lock.json
git commit -m "feat: add RequestsContext + install cmdk"
```

---

## Task 2: Create Dashboard Layout

**Files:**
- Create: `app/(dashboard)/layout.tsx`

The layout is a **server component** that fetches org requests and wraps all dashboard pages with providers. Individual pages already handle auth redirects — the layout just silently returns an empty array if the user is not logged in.

- [ ] **Step 1: Create the layout file**

Create `app/(dashboard)/layout.tsx`:

```tsx
import { createClient } from "@/lib/supabase/server";
import { db } from "@/db";
import { profiles, requests } from "@/db/schema";
import { eq } from "drizzle-orm";
import { RequestsProvider } from "@/context/requests-context";
import { GlobalShortcutsProvider } from "@/components/ui/global-shortcuts-provider";
import type { Request } from "@/db/schema";

export default async function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  let orgRequests: Request[] = [];

  try {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (user) {
      const [profile] = await db
        .select()
        .from(profiles)
        .where(eq(profiles.id, user.id));

      if (profile) {
        orgRequests = await db
          .select()
          .from(requests)
          .where(eq(requests.orgId, profile.orgId));
      }
    }
  } catch {
    // Silently fail — pages handle auth redirects themselves
  }

  return (
    <RequestsProvider requests={orgRequests}>
      <GlobalShortcutsProvider>{children}</GlobalShortcutsProvider>
    </RequestsProvider>
  );
}
```

- [ ] **Step 2: Verify types (GlobalShortcutsProvider doesn't exist yet — expect one error)**

```bash
npx tsc --noEmit 2>&1 | head -5
```

Expected: error about `GlobalShortcutsProvider` not found — this is fine, we build it next.

- [ ] **Step 3: Commit**

```bash
git add app/\(dashboard\)/layout.tsx
git commit -m "feat: add dashboard layout with RequestsProvider"
```

---

## Task 3: Create GlobalShortcutsProvider

**Files:**
- Create: `components/ui/global-shortcuts-provider.tsx`

This is the root client component that:
1. Registers `keydown` listeners for Cmd+K, Cmd+N, and `?`
2. Manages open/closed state for all three modals
3. Renders `CommandPalette`, `QuickCapture`, and `KeyboardShortcuts` at the root

- [ ] **Step 1: Create the provider**

Create `components/ui/global-shortcuts-provider.tsx`:

```tsx
"use client";

import { useState, useEffect, createContext, useContext, useCallback } from "react";
import dynamic from "next/dynamic";

// Lazy-load modals so they don't bloat the initial bundle
const CommandPalette = dynamic(
  () => import("./command-palette").then((m) => m.CommandPalette),
  { ssr: false }
);
const QuickCapture = dynamic(
  () => import("./quick-capture").then((m) => m.QuickCapture),
  { ssr: false }
);
const KeyboardShortcuts = dynamic(
  () => import("./keyboard-shortcuts").then((m) => m.KeyboardShortcuts),
  { ssr: false }
);

interface ShortcutsCtx {
  openPalette: () => void;
  openQuickCapture: () => void;
  openCheatsheet: () => void;
}

const ShortcutsContext = createContext<ShortcutsCtx>({
  openPalette: () => {},
  openQuickCapture: () => {},
  openCheatsheet: () => {},
});

export function useShortcuts() {
  return useContext(ShortcutsContext);
}

export function GlobalShortcutsProvider({
  children,
}: {
  children: React.ReactNode;
}) {
  const [paletteOpen, setPaletteOpen] = useState(false);
  const [quickCaptureOpen, setQuickCaptureOpen] = useState(false);
  const [cheatsheetOpen, setCheatsheetOpen] = useState(false);

  const handleKeyDown = useCallback((e: KeyboardEvent) => {
    const tag = (e.target as HTMLElement).tagName;
    const isInput =
      tag === "INPUT" ||
      tag === "TEXTAREA" ||
      (e.target as HTMLElement).isContentEditable;

    // Cmd+K / Ctrl+K — command palette
    if ((e.metaKey || e.ctrlKey) && e.key === "k") {
      e.preventDefault();
      setPaletteOpen((v) => !v);
      return;
    }

    // Cmd+N / Ctrl+N — quick capture
    if ((e.metaKey || e.ctrlKey) && e.key === "n") {
      e.preventDefault();
      setQuickCaptureOpen((v) => !v);
      return;
    }

    // ? — cheatsheet (not when typing in an input)
    if (!isInput && e.key === "?") {
      e.preventDefault();
      setCheatsheetOpen((v) => !v);
    }
  }, []);

  useEffect(() => {
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [handleKeyDown]);

  return (
    <ShortcutsContext.Provider
      value={{
        openPalette: () => setPaletteOpen(true),
        openQuickCapture: () => setQuickCaptureOpen(true),
        openCheatsheet: () => setCheatsheetOpen(true),
      }}
    >
      {children}

      {paletteOpen && (
        <CommandPalette onClose={() => setPaletteOpen(false)} />
      )}
      {quickCaptureOpen && (
        <QuickCapture onClose={() => setQuickCaptureOpen(false)} />
      )}
      {cheatsheetOpen && (
        <KeyboardShortcuts onClose={() => setCheatsheetOpen(false)} />
      )}
    </ShortcutsContext.Provider>
  );
}
```

- [ ] **Step 2: Verify types**

```bash
npx tsc --noEmit
```

Expected: errors for missing `CommandPalette`, `QuickCapture`, `KeyboardShortcuts` — fine, we build those next.

- [ ] **Step 3: Commit**

```bash
git add components/ui/global-shortcuts-provider.tsx
git commit -m "feat: add GlobalShortcutsProvider with Cmd+K, Cmd+N, ? listeners"
```

---

## Task 4: Create Command Palette

**Files:**
- Create: `components/ui/command-palette.tsx`

Uses `cmdk` for fuzzy search + keyboard navigation. Reads org requests from `RequestsContext` (no extra API call). Full-screen overlay, closes on Esc or backdrop click.

- [ ] **Step 1: Create the palette**

Create `components/ui/command-palette.tsx`:

```tsx
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
    // Autofocus happens via cmdk — but focus the input explicitly as fallback
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
```

- [ ] **Step 2: Verify types**

```bash
npx tsc --noEmit
```

Expected: clean or only errors for still-missing files (`QuickCapture`, `KeyboardShortcuts`).

- [ ] **Step 3: Manual test**

Run `npm run dev`, open the app, press Cmd+K. The palette should open. Type a request title — it should filter. Arrow keys navigate, Enter opens the request, Esc closes.

- [ ] **Step 4: Commit**

```bash
git add components/ui/command-palette.tsx
git commit -m "feat: add command palette (Cmd+K) with cmdk"
```

---

## Task 5: Create Quick Capture (Cmd+N)

**Files:**
- Create: `components/ui/quick-capture.tsx`

Floating modal. Title required, business goal optional, priority selector. Submits to existing `POST /api/requests` route. Closes instantly on submit with `router.refresh()`.

- [ ] **Step 1: Check the existing POST /api/requests route accepts these fields**

```bash
head -40 /Users/yashkaushal/Lane/app/api/requests/route.ts
```

Confirm it accepts `{ title, description, priority }` in the body. If the field names differ, adjust the `body` in the component below accordingly.

- [ ] **Step 2: Create the quick capture modal**

Create `components/ui/quick-capture.tsx`:

```tsx
"use client";

import { useState, useRef, useEffect } from "react";
import { useRouter } from "next/navigation";

type Priority = "p0" | "p1" | "p2" | "p3";

const PRIORITY_LABELS: Record<Priority, string> = {
  p0: "P0",
  p1: "P1",
  p2: "P2",
  p3: "P3",
};

export function QuickCapture({ onClose }: { onClose: () => void }) {
  const router = useRouter();
  const [title, setTitle] = useState("");
  const [businessGoal, setBusinessGoal] = useState("");
  const [priority, setPriority] = useState<Priority>("p2");
  const [saving, setSaving] = useState(false);
  const titleRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    titleRef.current?.focus();
  }, []);

  async function submit() {
    const trimmed = title.trim();
    if (!trimmed) return;

    setSaving(true);
    try {
      await fetch("/api/requests", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: trimmed,
          description: businessGoal.trim() || trimmed,
          priority,
        }),
      });
      router.refresh();
      onClose();
    } finally {
      setSaving(false);
    }
  }

  function onTitleKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === "Escape") { onClose(); return; }
    if (e.key === "Enter") submit();
  }

  function onGoalKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === "Escape") { onClose(); return; }
    if (e.key === "Enter") submit();
  }

  return (
    <div
      className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-start justify-center pt-[22vh]"
      onClick={onClose}
    >
      <div
        className="w-full max-w-md mx-4 bg-zinc-900 border border-zinc-700 rounded-xl shadow-2xl p-5"
        onClick={(e) => e.stopPropagation()}
      >
        <p className="text-[10px] text-zinc-600 uppercase tracking-wide mb-4">
          Quick capture
        </p>

        <input
          ref={titleRef}
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          onKeyDown={onTitleKeyDown}
          placeholder="What needs to be designed?"
          className="w-full bg-transparent text-white text-sm placeholder-zinc-700 outline-none pb-3 mb-3 border-b border-zinc-800 focus:border-zinc-600 transition-colors"
        />

        <input
          value={businessGoal}
          onChange={(e) => setBusinessGoal(e.target.value)}
          onKeyDown={onGoalKeyDown}
          placeholder="Business goal (optional)"
          className="w-full bg-transparent text-zinc-400 text-sm placeholder-zinc-700 outline-none pb-3 mb-4 border-b border-zinc-800 focus:border-zinc-600 transition-colors"
        />

        <div className="flex items-center justify-between">
          {/* Priority selector */}
          <div className="flex items-center gap-1">
            {(["p0", "p1", "p2", "p3"] as Priority[]).map((p) => (
              <button
                key={p}
                onClick={() => setPriority(p)}
                className={`text-[10px] px-2 py-0.5 rounded border font-mono transition-colors ${
                  priority === p
                    ? "bg-zinc-700 border-zinc-600 text-white"
                    : "border-zinc-800 text-zinc-600 hover:text-zinc-400"
                }`}
              >
                {PRIORITY_LABELS[p]}
              </button>
            ))}
          </div>

          {/* Actions */}
          <div className="flex items-center gap-2">
            <button
              onClick={onClose}
              className="text-xs text-zinc-600 hover:text-zinc-400 transition-colors"
            >
              Cancel
            </button>
            <button
              onClick={submit}
              disabled={!title.trim() || saving}
              className="bg-white text-zinc-900 text-xs px-3 py-1.5 rounded-lg font-medium disabled:opacity-40 transition-opacity"
            >
              {saving ? "Saving…" : "Capture ↵"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
```

- [ ] **Step 3: Verify types**

```bash
npx tsc --noEmit
```

Expected: clean (or only `KeyboardShortcuts` error remaining).

- [ ] **Step 4: Manual test**

Press Cmd+N. Modal opens. Type a title, press Enter. The modal closes and the new request appears in the dashboard list. Press Cmd+N again, press Esc — modal closes without saving.

- [ ] **Step 5: Commit**

```bash
git add components/ui/quick-capture.tsx
git commit -m "feat: add quick capture modal (Cmd+N)"
```

---

## Task 6: Create Keyboard Shortcut Cheatsheet

**Files:**
- Create: `components/ui/keyboard-shortcuts.tsx`

Static modal. Triggered by `?`. Lists all shortcuts grouped by context.

- [ ] **Step 1: Create the cheatsheet**

Create `components/ui/keyboard-shortcuts.tsx`:

```tsx
"use client";

import { useEffect } from "react";

const SHORTCUTS = [
  {
    section: "Global",
    items: [
      { key: "⌘K", label: "Command palette" },
      { key: "⌘N", label: "Quick capture" },
      { key: "?", label: "This cheatsheet" },
    ],
  },
  {
    section: "Request List",
    items: [
      { key: "J / K", label: "Navigate requests" },
      { key: "Enter", label: "Open request" },
      { key: "Esc", label: "Close / go back" },
      { key: "/", label: "Focus search" },
    ],
  },
  {
    section: "Request Detail",
    items: [
      { key: "⌘↵", label: "Advance to next stage" },
      { key: "⌘B", label: "Mark blocked / unblock" },
    ],
  },
];

export function KeyboardShortcuts({ onClose }: { onClose: () => void }) {
  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape" || e.key === "?") onClose();
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [onClose]);

  return (
    <div
      className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-center justify-center"
      onClick={onClose}
    >
      <div
        className="w-full max-w-sm mx-4 bg-zinc-900 border border-zinc-700 rounded-xl shadow-2xl p-5"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between mb-5">
          <p className="text-sm font-medium text-zinc-300">Keyboard shortcuts</p>
          <kbd className="text-[10px] text-zinc-600 border border-zinc-700 rounded px-1.5 py-0.5 font-mono bg-zinc-800">
            Esc
          </kbd>
        </div>

        <div className="space-y-5">
          {SHORTCUTS.map((section) => (
            <div key={section.section}>
              <p className="text-[10px] text-zinc-600 uppercase tracking-wide mb-2">
                {section.section}
              </p>
              <div className="space-y-2">
                {section.items.map((item) => (
                  <div
                    key={item.key}
                    className="flex items-center justify-between"
                  >
                    <span className="text-sm text-zinc-400">{item.label}</span>
                    <kbd className="text-[10px] text-zinc-500 border border-zinc-700 rounded px-1.5 py-0.5 font-mono bg-zinc-800">
                      {item.key}
                    </kbd>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Verify types — should now be clean**

```bash
npx tsc --noEmit
```

Expected: no output (all three modal files now exist).

- [ ] **Step 3: Manual test**

Press `?` anywhere in the app. Cheatsheet opens. Press Esc — it closes. Press Cmd+K, Cmd+N — both still work. All three modals coexist correctly.

- [ ] **Step 4: Commit**

```bash
git add components/ui/keyboard-shortcuts.tsx
git commit -m "feat: add keyboard shortcut cheatsheet (? key)"
```

---

## Task 7: J/K Navigation Hook

**Files:**
- Create: `hooks/use-keyboard-nav.ts`
- Modify: `components/requests/request-list.tsx`

The hook tracks which item index is focused. The list uses it to highlight the focused item and handle Enter/Esc.

- [ ] **Step 1: Create the hook**

Create `hooks/use-keyboard-nav.ts`:

```ts
import { useState, useEffect, useCallback } from "react";

export function useKeyboardNav(count: number) {
  const [focused, setFocused] = useState(-1);

  const handleKeyDown = useCallback(
    (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement).tagName;
      const isInput =
        tag === "INPUT" ||
        tag === "TEXTAREA" ||
        (e.target as HTMLElement).isContentEditable;

      if (isInput) return;

      if (e.key === "j" || e.key === "J") {
        e.preventDefault();
        setFocused((prev) => (prev < count - 1 ? prev + 1 : prev));
        return;
      }
      if (e.key === "k" || e.key === "K") {
        e.preventDefault();
        setFocused((prev) => (prev > 0 ? prev - 1 : prev));
      }
    },
    [count]
  );

  useEffect(() => {
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [handleKeyDown]);

  // Reset focus when list content changes (filter, sort)
  useEffect(() => {
    setFocused(-1);
  }, [count]);

  return { focused, setFocused };
}
```

- [ ] **Step 2: Add J/K navigation to RequestList**

In `components/requests/request-list.tsx`, add these changes:

**Add import at top:**
```tsx
import { useRef, useEffect } from "react";
import { useRouter } from "next/navigation";
import { useKeyboardNav } from "@/hooks/use-keyboard-nav";
```

**Inside `RequestList` component, after existing state declarations, add:**
```tsx
const router = useRouter();

// Flatten visible requests across all phases for J/K indexing
const flatVisible = PHASES.flatMap((phase) => grouped.get(phase.key) ?? []);
const { focused, setFocused } = useKeyboardNav(flatVisible.length);

// Handle Enter (open) and Esc (back) at list level
useEffect(() => {
  function onKeyDown(e: KeyboardEvent) {
    const tag = (e.target as HTMLElement).tagName;
    const isInput =
      tag === "INPUT" ||
      tag === "TEXTAREA" ||
      (e.target as HTMLElement).isContentEditable;
    if (isInput) return;

    if (e.key === "Enter" && focused >= 0) {
      e.preventDefault();
      router.push(`/dashboard/requests/${flatVisible[focused].id}`);
    }
    if (e.key === "/" ) {
      e.preventDefault();
      searchRef.current?.focus();
    }
  }
  window.addEventListener("keydown", onKeyDown);
  return () => window.removeEventListener("keydown", onKeyDown);
}, [focused, flatVisible, router]);
```

**Add a ref for the search input (add after existing state):**
```tsx
const searchRef = useRef<HTMLInputElement>(null);
```

**Wire the ref to the search input (find the search input element and add `ref`):**
```tsx
<input
  ref={searchRef}
  type="text"
  value={search}
  onChange={(e) => setSearch(e.target.value)}
  placeholder="Search requests…"
  className="w-full bg-zinc-900 border border-zinc-800 rounded-lg px-3 py-2 text-sm text-white placeholder-zinc-700 focus:outline-none focus:border-zinc-600 transition-colors"
/>
```

**Compute global flat index for each request card.** In the `{list.map((r) => { ... })}` block, you need to know the flat index. Add this before the map:

```tsx
// Inside the PHASES.map block, before list.map:
const phaseStartIndex = PHASES.slice(0, PHASES.indexOf(phase)).reduce(
  (sum, p) => sum + (grouped.get(p.key)?.length ?? 0),
  0
);
```

**In each request `Link`, replace the className and add focus highlight:**

Find:
```tsx
<Link
  key={r.id}
  href={`/dashboard/requests/${r.id}`}
  className="block border border-zinc-800 rounded-xl px-5 py-3.5 hover:border-zinc-700 transition-colors"
>
```

Replace with (note: `itemIndex` is `phaseStartIndex + list.indexOf(r)` — computed in the map):
```tsx
{list.map((r, listIdx) => {
  const itemIndex = phaseStartIndex + listIdx;
  const isFocused = focused === itemIndex;
  // ... rest of card render
  return (
    <Link
      key={r.id}
      href={`/dashboard/requests/${r.id}`}
      onClick={() => setFocused(itemIndex)}
      className={`block border rounded-xl px-5 py-3.5 transition-colors ${
        isFocused
          ? "border-l-2 border-l-indigo-500 border-zinc-700 bg-zinc-900"
          : "border-zinc-800 hover:border-zinc-700"
      }`}
    >
```

**Add shortcut hint bar below the phase groups (before the empty state):**
```tsx
{/* Keyboard hint bar */}
<div className="hidden md:flex items-center gap-4 pt-4 pb-2">
  <span className="text-[10px] text-zinc-700">J/K navigate</span>
  <span className="text-[10px] text-zinc-700">↵ open</span>
  <span className="text-[10px] text-zinc-700">/ search</span>
  <span className="text-[10px] text-zinc-700">? shortcuts</span>
</div>
```

- [ ] **Step 3: Verify types**

```bash
npx tsc --noEmit
```

Expected: clean.

- [ ] **Step 4: Manual test**

Open the dashboard. Press J — first request gets an indigo left border. Press J again — moves to second. Press K — moves back. Press Enter — opens the request. Press `/` — search input focuses.

- [ ] **Step 5: Commit**

```bash
git add hooks/use-keyboard-nav.ts components/requests/request-list.tsx
git commit -m "feat: add J/K keyboard navigation to request list"
```

---

## Task 8: Optimistic UI — AssignPanel

**Files:**
- Modify: `components/requests/assign-panel.tsx`

Replace the `assigning` spinner with instant optimistic state update + rollback on error. The pattern used here is the same for all subsequent optimistic UI tasks.

- [ ] **Step 1: Replace assign with optimistic version**

In `components/requests/assign-panel.tsx`, find the `assign` function and replace it:

```tsx
async function assign(memberId: string) {
  // Optimistic: immediately show the member as assigned
  const member = members.find((m) => m.id === memberId);
  if (!member) return;
  const tempAssignment: Assignment = { id: `temp-${memberId}`, assigneeId: memberId, role: selectedRole };
  setCurrentAssignments((prev) => [...prev, tempAssignment]);
  setShowPicker(false);

  const res = await fetch(`/api/requests/${requestId}/assign`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ assigneeId: memberId, role: selectedRole }),
  });

  if (!res.ok) {
    // Rollback
    setCurrentAssignments((prev) => prev.filter((a) => a.id !== `temp-${memberId}`));
    return;
  }

  setRecommendation(null);
  await load();
  router.refresh();
}
```

- [ ] **Step 2: Replace unassign with optimistic version**

Find the `unassign` function and replace it:

```tsx
async function unassign(memberId: string) {
  // Optimistic: immediately remove from list
  const previous = currentAssignments;
  setCurrentAssignments((prev) => prev.filter((a) => a.assigneeId !== memberId));

  const res = await fetch(`/api/requests/${requestId}/assign`, {
    method: "DELETE",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ assigneeId: memberId }),
  });

  if (!res.ok) {
    // Rollback
    setCurrentAssignments(previous);
    return;
  }

  await load();
  router.refresh();
}
```

- [ ] **Step 3: Remove the assigning spinner**

Find and remove the `assigning` state and all references to it:

Remove:
```tsx
const [assigning, setAssigning] = useState<string | null>(null);
```

Remove from the unassign button:
```tsx
disabled={assigning === m.id}
```

Remove from the member list button:
```tsx
disabled={assigning === m.id}
```

Remove the spinner in the member list:
```tsx
{assigning === m.id && (
  <span className="w-3 h-3 border-2 border-zinc-600 border-t-zinc-300 rounded-full animate-spin inline-block mt-0.5" />
)}
```

- [ ] **Step 4: Verify types**

```bash
npx tsc --noEmit
```

Expected: clean.

- [ ] **Step 5: Manual test**

Click assign on a request. The member appears immediately without a loading spinner. Unassign — disappears immediately. No visual delay.

- [ ] **Step 6: Commit**

```bash
git add components/requests/assign-panel.tsx
git commit -m "feat: optimistic UI on assign/unassign"
```

---

## Task 9: Optimistic UI — ValidationGate

**Files:**
- Modify: `components/requests/validation-gate.tsx`

On sign-off submit: show the sign-off immediately as "approved/rejected" in the UI before the server responds.

- [ ] **Step 1: Read the full submit function**

```bash
grep -n "submit\|setSubmitting\|submitting" /Users/yashkaushal/Lane/components/requests/validation-gate.tsx
```

- [ ] **Step 2: Add optimistic signoff state**

In `validation-gate.tsx`, after the `const [signoffs, setSignoffs] = useState<Signoff[]>([]);` line, add:

```tsx
const [optimisticSignoffs, setOptimisticSignoffs] = useState<Signoff[]>([]);

// Keep optimistic in sync with server state
useEffect(() => {
  setOptimisticSignoffs(signoffs);
}, [signoffs]);
```

- [ ] **Step 3: Update submit to be optimistic**

Find the submit function (look for the `setSubmitting(true)` call). Replace the function body to add optimistic update before the fetch:

```tsx
async function submitSignoff(decision: Decision) {
  if (!mySignerRole) return;

  // Optimistic: immediately show this role as signed
  const tempSignoff: Signoff = {
    id: `temp-${mySignerRole}`,
    signerRole: mySignerRole,
    decision,
    conditions: conditions || null,
    comments: commentText || null,
    signedAt: new Date().toISOString(),
  };
  setOptimisticSignoffs((prev) => {
    const without = prev.filter((s) => s.signerRole !== mySignerRole);
    return [...without, tempSignoff];
  });
  setActiveDecision(null);

  const res = await fetch(`/api/requests/${requestId}/validate`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ decision, conditions, comments: commentText }),
  });

  if (!res.ok) {
    // Rollback
    setOptimisticSignoffs(signoffs);
    setError("Failed to submit sign-off — please try again");
    return;
  }

  await loadSignoffs();
  router.refresh();
}
```

- [ ] **Step 4: Use optimisticSignoffs in the render**

In the JSX, replace all references to `signoffs` (when checking which roles have signed) with `optimisticSignoffs`.

Find the line that maps roles to their sign-off status (likely `ROLES.map(...)` with a `.find` on `signoffs`) and change `signoffs` to `optimisticSignoffs`.

- [ ] **Step 5: Remove the submitting spinner**

Find and remove:
```tsx
const [submitting, setSubmitting] = useState(false);
```
And any button that uses `disabled={submitting}` — remove the `disabled` prop.

- [ ] **Step 6: Verify types**

```bash
npx tsc --noEmit
```

Expected: clean.

- [ ] **Step 7: Commit**

```bash
git add components/requests/validation-gate.tsx
git commit -m "feat: optimistic UI on validation gate sign-off"
```

---

## Task 10: Optimistic UI — PredesignPanel, DesignPhasePanel, DevPhasePanel, TrackPhasePanel

**Files:**
- Modify: `components/requests/predesign-panel.tsx`
- Modify: `components/requests/design-phase-panel.tsx`
- Modify: `components/requests/dev-phase-panel.tsx`
- Modify: `components/requests/track-phase-panel.tsx`

All four panels advance stages using the same `advance-phase` or `kanban` route. The optimistic pattern is identical: update local display state, fire the fetch, rollback on error.

### PredesignPanel

- [ ] **Step 1: Add optimistic stage state to PredesignPanel**

In `components/requests/predesign-panel.tsx`, add after the existing state:

```tsx
const [optimisticStage, setOptimisticStage] = useState(currentStage);
```

- [ ] **Step 2: Replace the advance function**

Find the advance function (the one that calls `/advance-phase` or similar) and replace:

```tsx
async function advance() {
  if (!nextStage) return;

  // Optimistic: jump to next stage visually
  const previousStage = optimisticStage;
  setOptimisticStage(nextStage.key);
  setError(null);

  const res = await fetch(`/api/requests/${requestId}/advance-phase`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ action: "advance" }),
  });

  if (!res.ok) {
    const data = await res.json().catch(() => ({}));
    setOptimisticStage(previousStage);
    setError(data.error ?? "Failed to advance — please try again");
    return;
  }

  router.refresh();
}
```

- [ ] **Step 3: Replace `currentStage` with `optimisticStage` in render**

In the JSX, replace the `currentStage` variable used for display (badge, progress bar, stage descriptions) with `optimisticStage`. Keep using `currentStage` for gate logic (`getGateStatus`).

- [ ] **Step 4: Remove the `advancing` spinner**

Find and remove:
```tsx
const [advancing, setAdvancing] = useState(false);
```
Remove `disabled={advancing}` from the advance button and any spinner rendered while advancing.

### DevPhasePanel — Kanban moves

- [ ] **Step 5: Add optimistic kanban state to DevPhasePanel**

In `components/requests/dev-phase-panel.tsx`, find the kanban state and add:

```tsx
const [optimisticKanban, setOptimisticKanban] = useState(kanbanState);
```

- [ ] **Step 6: Replace the kanban move function**

Find the function that calls `PATCH /api/requests/[id]/kanban` and replace:

```tsx
async function moveKanban(newState: typeof kanbanState) {
  const previous = optimisticKanban;
  setOptimisticKanban(newState);

  const res = await fetch(`/api/requests/${requestId}/kanban`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ state: newState }),
  });

  if (!res.ok) {
    setOptimisticKanban(previous);
    return;
  }

  router.refresh();
}
```

- [ ] **Step 7: Use `optimisticKanban` in the kanban stepper render**

Replace `kanbanState` with `optimisticKanban` in the JSX that renders the active step.

### DesignPhasePanel and TrackPhasePanel

- [ ] **Step 8: Apply the same pattern to DesignPhasePanel**

In `components/requests/design-phase-panel.tsx`, add `const [optimisticStage, setOptimisticStage] = useState(designStage)` and update the advance function to set optimistic state before fetching, rollback on error.

- [ ] **Step 9: Apply the same pattern to TrackPhasePanel**

In `components/requests/track-phase-panel.tsx`, the save action writes impact data. Add optimistic display of the saved value before the fetch, rollback on error.

- [ ] **Step 10: Verify types across all four files**

```bash
npx tsc --noEmit
```

Expected: clean.

- [ ] **Step 11: Commit**

```bash
git add components/requests/predesign-panel.tsx components/requests/design-phase-panel.tsx components/requests/dev-phase-panel.tsx components/requests/track-phase-panel.tsx
git commit -m "feat: optimistic UI on all phase advance + kanban moves"
```

---

## Task 11: Optimistic UI — IdeaCard Vote

**Files:**
- Modify: `components/ideas/idea-card.tsx`

Voting on ideas should feel instant. Optimistically update the vote count and selected state.

- [ ] **Step 1: Read the current vote handler**

```bash
grep -n "vote\|fetch\|optimistic" /Users/yashkaushal/Lane/components/ideas/idea-card.tsx | head -20
```

- [ ] **Step 2: Add optimistic vote state**

In `idea-card.tsx`, find the vote count and user vote state. Add optimistic state that mirrors them:

```tsx
const [optimisticVotes, setOptimisticVotes] = useState({
  upvotes: idea.upvotes ?? 0,
  downvotes: idea.downvotes ?? 0,
  myVote: myVote, // whatever the current prop/state is called
});
```

- [ ] **Step 3: Replace the vote handler**

Find the function that calls `POST /api/ideas/[id]/vote` and replace with:

```tsx
async function handleVote(type: "upvote" | "downvote") {
  const previous = optimisticVotes;

  // Optimistic: toggle the vote count immediately
  setOptimisticVotes((prev) => {
    const isToggle = prev.myVote === type;
    return {
      upvotes:
        type === "upvote"
          ? isToggle ? prev.upvotes - 1 : prev.upvotes + 1
          : prev.myVote === "upvote" ? prev.upvotes - 1 : prev.upvotes,
      downvotes:
        type === "downvote"
          ? isToggle ? prev.downvotes - 1 : prev.downvotes + 1
          : prev.myVote === "downvote" ? prev.downvotes - 1 : prev.downvotes,
      myVote: isToggle ? null : type,
    };
  });

  const res = await fetch(`/api/ideas/${idea.id}/vote`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ voteType: type }),
  });

  if (!res.ok) {
    setOptimisticVotes(previous); // rollback
  }
}
```

- [ ] **Step 4: Use `optimisticVotes` in the render**

Replace the upvote/downvote counts and selected state in the JSX with `optimisticVotes.upvotes`, `optimisticVotes.downvotes`, and `optimisticVotes.myVote`.

- [ ] **Step 5: Verify types**

```bash
npx tsc --noEmit
```

Expected: clean.

- [ ] **Step 6: Commit**

```bash
git add components/ideas/idea-card.tsx
git commit -m "feat: optimistic UI on idea votes"
```

---

## Task 12: Keyboard Hints on Action Buttons

**Files:**
- Modify: `components/requests/predesign-panel.tsx`
- Modify: `components/requests/design-phase-panel.tsx`
- Modify: `components/requests/dev-phase-panel.tsx`

Add `<kbd>` shortcut hints next to primary action buttons. Desktop only (`hidden md:inline`).

- [ ] **Step 1: Add Cmd+Enter hint to the advance button in PredesignPanel**

Find the "Advance to [next stage]" button in `predesign-panel.tsx`. Replace its children with:

```tsx
<button
  onClick={advance}
  disabled={!canAdvance}
  className="... existing classes ..."
>
  Advance to {nextStage.label}
  <kbd className="hidden md:inline ml-2 text-[10px] border border-zinc-600 rounded px-1 py-0.5 font-mono opacity-60">
    ⌘↵
  </kbd>
</button>
```

Also wire `Cmd+Enter` in the panel's keydown listener:

```tsx
useEffect(() => {
  function onKeyDown(e: KeyboardEvent) {
    if ((e.metaKey || e.ctrlKey) && e.key === "Enter") {
      e.preventDefault();
      if (canAdvance) advance();
    }
  }
  window.addEventListener("keydown", onKeyDown);
  return () => window.removeEventListener("keydown", onKeyDown);
}, [canAdvance]); // eslint-disable-line react-hooks/exhaustive-deps
```

- [ ] **Step 2: Apply same Cmd+Enter hint + listener to DesignPhasePanel advance button**

Same pattern as Step 1 — add `<kbd>⌘↵</kbd>` hint and the keydown listener.

- [ ] **Step 3: Add hint to the command palette trigger in the header**

In `app/(dashboard)/dashboard/page.tsx` (and team/insights/ideas pages), add a search icon button that calls `openPalette()` from `useShortcuts()`:

```tsx
// In the header <div className="flex items-center gap-3">
import { useShortcuts } from "@/components/ui/global-shortcuts-provider";

// Inside the component (must be a client component — or extract to a small HeaderSearch client component)
const { openPalette } = useShortcuts();

<button
  onClick={openPalette}
  className="hidden md:flex items-center gap-1.5 text-xs text-zinc-600 hover:text-zinc-400 border border-zinc-800 hover:border-zinc-700 rounded-lg px-2.5 py-1.5 transition-colors"
>
  <span>Search</span>
  <kbd className="text-[10px] border border-zinc-700 rounded px-1 font-mono bg-zinc-900">⌘K</kbd>
</button>
```

**Note:** The header is inside a server component. Extract a small `HeaderSearch` client component that imports `useShortcuts` and renders the button. Import it into the server page component.

Create `components/ui/header-search.tsx`:

```tsx
"use client";
import { useShortcuts } from "./global-shortcuts-provider";

export function HeaderSearch() {
  const { openPalette } = useShortcuts();
  return (
    <button
      onClick={openPalette}
      className="hidden md:flex items-center gap-1.5 text-xs text-zinc-600 hover:text-zinc-400 border border-zinc-800 hover:border-zinc-700 rounded-lg px-2.5 py-1.5 transition-colors"
    >
      <span>Search</span>
      <kbd className="text-[10px] border border-zinc-700 rounded px-1 font-mono bg-zinc-900">⌘K</kbd>
    </button>
  );
}
```

Then add `<HeaderSearch />` to the header in `dashboard/page.tsx`, `team/page.tsx`, `insights/page.tsx`, and `ideas/page.tsx`.

- [ ] **Step 4: Verify types**

```bash
npx tsc --noEmit
```

Expected: clean.

- [ ] **Step 5: Final manual test checklist**

- [ ] Cmd+K opens palette from dashboard, insights, ideas, and team pages
- [ ] Typing in palette filters requests by title
- [ ] Arrow keys navigate palette items, Enter navigates
- [ ] Cmd+N opens quick capture from any page
- [ ] Submitting quick capture creates a request that appears in the list
- [ ] `?` opens cheatsheet, Esc closes it
- [ ] J/K navigates request list, Enter opens, `/` focuses search
- [ ] Assigning a designer is instant (no spinner)
- [ ] Kanban moves are instant (no spinner)
- [ ] Voting on ideas is instant with correct count update
- [ ] Cmd+Enter advances predesign stage

- [ ] **Step 6: Final commit**

```bash
git add components/ui/header-search.tsx components/requests/predesign-panel.tsx components/requests/design-phase-panel.tsx app/\(dashboard\)/dashboard/page.tsx app/\(dashboard\)/dashboard/team/page.tsx app/\(dashboard\)/dashboard/insights/page.tsx app/\(dashboard\)/dashboard/ideas/page.tsx
git commit -m "feat: keyboard hints on action buttons + HeaderSearch component"
```

---

## Done

All 12 tasks complete = Speed Layer fully built.

**Verify the full build before shipping:**

```bash
npm run build
```

Expected: clean build, no TypeScript errors, no missing module errors.

```bash
git log --oneline -10
```

Should show 10+ commits, each adding one piece of the speed layer.
