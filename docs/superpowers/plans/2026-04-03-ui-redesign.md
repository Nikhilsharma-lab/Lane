# UI Redesign — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the dark zinc theme with the warm cream design system and restructure the layout into a fixed 4-zone shell (icon rail + global pane + main canvas + right detail dock).

**Architecture:** The dashboard layout (`app/(dashboard)/layout.tsx`) becomes the shell host — it renders the icon rail, global pane, and detail dock around `{children}`. The detail dock is a client component that reads `?dock=<requestId>` from the URL and finds the request from `RequestsContext`. No additional API calls needed — the context already holds all org requests.

**Tech Stack:** Next.js 14 App Router, Tailwind CSS v4, Drizzle ORM, Supabase, Lucide React, Satoshi (Fontshare CDN), Geist Mono (already in stack)

**Design reference:** `DESIGN.md` and `docs/superpowers/specs/2026-04-03-ui-redesign-design.md`

---

## File Map

| Action | File | Responsibility |
|--------|------|----------------|
| Modify | `app/globals.css` | CSS custom property tokens, Satoshi import |
| Modify | `app/layout.tsx` | Add Satoshi font `<link>` in `<head>` |
| Create | `components/shell/icon-rail.tsx` | 48px left nav rail with Lucide icons |
| Create | `components/shell/global-pane.tsx` | 256px always-visible left pane (stats, my work) |
| Create | `components/shell/detail-dock.tsx` | 400px right dock, slides in on `?dock=<id>` |
| Modify | `app/(dashboard)/layout.tsx` | Mount shell around children, pass userId to pane |
| Modify | `app/(dashboard)/dashboard/page.tsx` | Remove inline header nav, simplify to just RequestList |
| Modify | `components/requests/request-list.tsx` | Warm styling, row click pushes `?dock=<id>` |

---

## Task 1: CSS Design Tokens & Satoshi Font

**Files:**
- Modify: `app/globals.css`
- Modify: `app/layout.tsx`

- [ ] **Step 1: Replace globals.css**

```css
/* app/globals.css */
@tailwind base;
@tailwind components;
@tailwind utilities;

@import url('https://api.fontshare.com/v2/css?f[]=satoshi@300,400,500,600,700&display=swap');

html {
  scroll-behavior: smooth;
}

:root {
  /* Backgrounds */
  --bg-base: #F8F6F1;
  --bg-surface: #FFFFFF;
  --bg-subtle: #F0EDE6;
  --bg-hover: #EAE6DE;

  /* Text */
  --text-primary: #1C1917;
  --text-secondary: #78716C;
  --text-tertiary: #A8A29E;

  /* Borders */
  --border: #E7E2DA;
  --border-strong: #D4CFC7;

  /* Accent */
  --accent: #2E5339;
  --accent-subtle: #EAF2EC;
  --accent-text: #FFFFFF;

  /* Status */
  --status-requested: #A8A29E;
  --status-in-progress: #7DA5C4;
  --status-in-review: #D4A84B;
  --status-approved: #86A87A;
  --status-handed-off: #A394C7;

  /* Spacing */
  --space-1: 4px;
  --space-2: 8px;
  --space-3: 12px;
  --space-4: 16px;
  --space-6: 24px;
  --space-8: 32px;
  --space-12: 48px;
  --space-16: 64px;

  /* Radius */
  --radius-sm: 4px;
  --radius-md: 6px;
  --radius-lg: 8px;
  --radius-xl: 12px;

  /* Layout */
  --rail-width: 48px;
  --pane-width: 256px;
  --dock-width: 400px;
}

body {
  background-color: var(--bg-base);
  color: var(--text-primary);
  font-family: 'Satoshi', sans-serif;
}
```

- [ ] **Step 2: Add Satoshi preconnect to root layout**

```tsx
// app/layout.tsx
import type { Metadata } from 'next'
import './globals.css'

export const metadata: Metadata = {
  title: 'Lane',
  description: 'Multi-persona DesignOps platform',
}

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <html lang="en">
      <head>
        <link rel="preconnect" href="https://api.fontshare.com" />
      </head>
      <body>{children}</body>
    </html>
  )
}
```

- [ ] **Step 3: Verify TypeScript compiles**

```bash
cd /Users/yashkaushal/Lane
npx tsc --noEmit
```

Expected: no errors.

- [ ] **Step 4: Commit**

```bash
git add app/globals.css app/layout.tsx
git commit -m "feat: add warm cream design tokens and Satoshi font"
```

---

## Task 2: Icon Rail Component

**Files:**
- Create: `components/shell/icon-rail.tsx`

- [ ] **Step 1: Create the component**

```tsx
// components/shell/icon-rail.tsx
"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  LayoutGrid,
  FileText,
  Lightbulb,
  Users,
  Activity,
  Settings,
} from "lucide-react";

const NAV = [
  { href: "/dashboard", icon: FileText, label: "Requests" },
  { href: "/dashboard/ideas", icon: Lightbulb, label: "Ideas" },
  { href: "/dashboard/team", icon: Users, label: "Team" },
  { href: "/dashboard/radar", icon: Activity, label: "Radar" },
  { href: "/dashboard/insights", icon: LayoutGrid, label: "Insights" },
];

export function IconRail() {
  const pathname = usePathname();

  return (
    <aside
      className="flex flex-col items-center py-4 gap-3 shrink-0"
      style={{
        width: "var(--rail-width)",
        background: "var(--bg-subtle)",
        borderRight: "1px solid var(--border)",
        height: "100vh",
        position: "sticky",
        top: 0,
      }}
    >
      {/* Logo mark */}
      <div
        className="flex items-center justify-center rounded-md mb-1 shrink-0"
        style={{
          width: 28,
          height: 28,
          background: "var(--accent)",
        }}
      >
        <span style={{ color: "white", fontSize: 11, fontWeight: 700, letterSpacing: "-0.02em" }}>
          DQ
        </span>
      </div>

      <div style={{ width: 24, height: 1, background: "var(--border)" }} />

      {/* Nav icons */}
      {NAV.map(({ href, icon: Icon, label }) => {
        const isActive = pathname === href || (href !== "/dashboard" && pathname.startsWith(href));
        return (
          <Link
            key={href}
            href={href}
            title={label}
            className="flex items-center justify-center rounded-md transition-colors"
            style={{
              width: 32,
              height: 32,
              background: isActive ? "var(--accent)" : "transparent",
              color: isActive ? "white" : "var(--text-tertiary)",
            }}
          >
            <Icon size={16} />
          </Link>
        );
      })}

      <div style={{ flex: 1 }} />

      {/* Settings at bottom */}
      <Link
        href="/settings"
        title="Settings"
        className="flex items-center justify-center rounded-md transition-colors"
        style={{
          width: 32,
          height: 32,
          color: "var(--text-tertiary)",
        }}
      >
        <Settings size={16} />
      </Link>
    </aside>
  );
}
```

- [ ] **Step 2: Verify TypeScript**

```bash
npx tsc --noEmit
```

Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add components/shell/icon-rail.tsx
git commit -m "feat: add icon rail component (48px left nav)"
```

---

## Task 3: Global Pane Component

**Files:**
- Create: `components/shell/global-pane.tsx`

The global pane receives `userId` as a prop to identify "My Work" requests. It reads all requests from `RequestsContext` — no extra DB call.

- [ ] **Step 1: Create the component**

```tsx
// components/shell/global-pane.tsx
"use client";

import { useRequests } from "@/context/requests-context";

interface Props {
  userId: string;
}

function formatRelative(date: Date | string): string {
  const diff = Date.now() - new Date(date).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  return `${Math.floor(hrs / 24)}d ago`;
}

const PHASE_LABELS: Record<string, string> = {
  predesign: "Predesign",
  design: "Design",
  dev: "Dev",
  track: "Track",
};

export function GlobalPane({ userId }: Props) {
  const requests = useRequests();

  const active = requests.filter(
    (r) => !["completed", "shipped"].includes(r.status)
  );

  const overdue = requests.filter((r) => {
    if (!r.deadlineAt) return false;
    return new Date(r.deadlineAt) < new Date() && !["completed", "shipped"].includes(r.status);
  });

  // My work: requests where createdById matches userId (assignments not in context — use createdById as proxy)
  const mine = requests.filter((r) => r.createdById === userId).slice(0, 5);

  const recent = [...requests]
    .sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime())
    .slice(0, 4);

  return (
    <aside
      className="flex flex-col gap-4 py-5 px-3 shrink-0 overflow-y-auto"
      style={{
        width: "var(--pane-width)",
        background: "var(--bg-subtle)",
        borderRight: "1px solid var(--border)",
        height: "100vh",
        position: "sticky",
        top: 0,
      }}
    >
      {/* Stats */}
      <div>
        <p
          className="mb-2"
          style={{
            fontFamily: "'Geist Mono', monospace",
            fontSize: 9,
            fontWeight: 500,
            letterSpacing: "0.07em",
            textTransform: "uppercase",
            color: "var(--text-tertiary)",
          }}
        >
          Overview
        </p>
        <div className="flex gap-2">
          <div
            className="flex-1 rounded-lg p-3"
            style={{ background: "var(--bg-surface)", border: "1px solid var(--border)" }}
          >
            <p style={{ fontSize: 22, fontWeight: 700, color: "var(--text-primary)", lineHeight: 1 }}>
              {active.length}
            </p>
            <p style={{ fontSize: 10, color: "var(--text-tertiary)", marginTop: 3 }}>Active</p>
          </div>
          <div
            className="flex-1 rounded-lg p-3"
            style={{ background: "var(--bg-surface)", border: "1px solid var(--border)" }}
          >
            <p
              style={{
                fontSize: 22,
                fontWeight: 700,
                color: overdue.length > 0 ? "#B45309" : "var(--text-primary)",
                lineHeight: 1,
              }}
            >
              {overdue.length}
            </p>
            <p style={{ fontSize: 10, color: "var(--text-tertiary)", marginTop: 3 }}>Overdue</p>
          </div>
        </div>
      </div>

      {/* My Work */}
      {mine.length > 0 && (
        <div>
          <p
            className="mb-2"
            style={{
              fontFamily: "'Geist Mono', monospace",
              fontSize: 9,
              fontWeight: 500,
              letterSpacing: "0.07em",
              textTransform: "uppercase",
              color: "var(--text-tertiary)",
            }}
          >
            My Work
          </p>
          <div className="flex flex-col gap-1.5">
            {mine.map((r) => (
              <div
                key={r.id}
                className="rounded-md px-2.5 py-2"
                style={{ background: "var(--bg-surface)", border: "1px solid var(--border)" }}
              >
                <p
                  style={{
                    fontFamily: "'Geist Mono', monospace",
                    fontSize: 9,
                    color: "var(--text-tertiary)",
                    marginBottom: 2,
                  }}
                >
                  #{r.id.slice(0, 6).toUpperCase()}
                </p>
                <p
                  style={{
                    fontSize: 11,
                    color: "var(--text-primary)",
                    fontWeight: 500,
                    lineHeight: 1.3,
                    overflow: "hidden",
                    display: "-webkit-box",
                    WebkitLineClamp: 2,
                    WebkitBoxOrient: "vertical",
                  }}
                >
                  {r.title}
                </p>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Recent Activity */}
      <div>
        <p
          className="mb-2"
          style={{
            fontFamily: "'Geist Mono', monospace",
            fontSize: 9,
            fontWeight: 500,
            letterSpacing: "0.07em",
            textTransform: "uppercase",
            color: "var(--text-tertiary)",
          }}
        >
          Recent
        </p>
        <div className="flex flex-col gap-1.5">
          {recent.map((r) => (
            <div key={r.id} className="flex flex-col gap-0.5">
              <p style={{ fontSize: 11, color: "var(--text-secondary)", fontWeight: 500, lineHeight: 1.3 }}>
                {r.title.length > 32 ? r.title.slice(0, 32) + "…" : r.title}
              </p>
              <p
                style={{
                  fontFamily: "'Geist Mono', monospace",
                  fontSize: 9,
                  color: "var(--text-tertiary)",
                }}
              >
                {PHASE_LABELS[r.phase ?? "predesign"]} · {formatRelative(r.updatedAt)}
              </p>
            </div>
          ))}
        </div>
      </div>
    </aside>
  );
}
```

- [ ] **Step 2: Verify TypeScript**

```bash
npx tsc --noEmit
```

Expected: no errors. If `createdById` doesn't exist on the `Request` type, replace with any available user-identifying field (check `db/schema/requests.ts` for the actual column name — common alternatives: `pmId`, `createdBy`, `requesterId`).

- [ ] **Step 3: Commit**

```bash
git add components/shell/global-pane.tsx
git commit -m "feat: add global pane component (256px left pane with stats + my work)"
```

---

## Task 4: Detail Dock Component

**Files:**
- Create: `components/shell/detail-dock.tsx`

The dock reads `?dock=<id>` from the URL via `useSearchParams()`, finds the request in `RequestsContext`, and renders request details. It slides in from the right — the flex layout naturally pushes the main canvas inward.

- [ ] **Step 1: Create the component**

```tsx
// components/shell/detail-dock.tsx
"use client";

import { useSearchParams, useRouter, usePathname } from "next/navigation";
import { useRequests } from "@/context/requests-context";
import { X, ExternalLink } from "lucide-react";

const PHASE_LABELS: Record<string, string> = {
  predesign: "Predesign",
  design: "Design",
  dev: "Dev",
  track: "Track",
};

const STAGE_LABELS: Record<string, string> = {
  intake: "Intake", context: "Context", shape: "Shape", bet: "Betting",
  explore: "Explore", validate: "Validate", handoff: "Handoff",
  todo: "To Do", in_progress: "In Progress", in_review: "In Review", qa: "QA", done: "Done",
  measuring: "Measuring", complete: "Complete",
};

const STATUS_COLORS: Record<string, { bg: string; color: string }> = {
  draft:       { bg: "#F0EDE6", color: "#78716C" },
  submitted:   { bg: "#EAF2EC", color: "#2E5339" },
  triaged:     { bg: "#E0ECF8", color: "#1E6091" },
  assigned:    { bg: "#EAF2EC", color: "#2E5339" },
  in_progress: { bg: "#DBEAFE", color: "#1D4ED8" },
  in_review:   { bg: "#FEF3C7", color: "#B45309" },
  blocked:     { bg: "#FEE2E2", color: "#DC2626" },
  completed:   { bg: "#EAF2EC", color: "#2E5339" },
  shipped:     { bg: "#EAF2EC", color: "#166534" },
};

const PRIORITY_LABELS: Record<string, string> = {
  p0: "P0 · Critical", p1: "P1 · High", p2: "P2 · Medium", p3: "P3 · Low",
};

function formatDate(d: Date | string | null): string {
  if (!d) return "—";
  return new Date(d).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}

export function DetailDock() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const pathname = usePathname();
  const requests = useRequests();

  const dockId = searchParams.get("dock");
  const request = dockId ? requests.find((r) => r.id === dockId) : null;

  if (!request) return null;

  function close() {
    const params = new URLSearchParams(searchParams.toString());
    params.delete("dock");
    const qs = params.toString();
    router.push(qs ? `${pathname}?${qs}` : pathname);
  }

  const phaseLabel = PHASE_LABELS[request.phase ?? "predesign"] ?? request.phase;
  const stageKey =
    request.phase === "predesign" ? (request.predesignStage ?? "intake") :
    request.phase === "design" ? (request.designStage ?? "explore") :
    request.phase === "dev" ? (request.kanbanState ?? "todo") :
    (request.trackStage ?? "measuring");
  const stageLabel = STAGE_LABELS[stageKey] ?? stageKey;
  const statusStyle = STATUS_COLORS[request.status] ?? { bg: "#F0EDE6", color: "#78716C" };

  return (
    <aside
      className="flex flex-col shrink-0 overflow-y-auto"
      style={{
        width: "var(--dock-width)",
        background: "var(--bg-surface)",
        borderLeft: "1px solid var(--border)",
        height: "100vh",
        position: "sticky",
        top: 0,
        animation: "dockSlideIn 200ms ease-out",
      }}
    >
      <style>{`
        @keyframes dockSlideIn {
          from { transform: translateX(40px); opacity: 0; }
          to   { transform: translateX(0);   opacity: 1; }
        }
      `}</style>

      {/* Header */}
      <div
        className="flex items-start justify-between px-5 py-4"
        style={{ borderBottom: "1px solid var(--border)" }}
      >
        <div className="flex flex-col gap-1.5 min-w-0">
          <p
            style={{
              fontFamily: "'Geist Mono', monospace",
              fontSize: 10,
              color: "var(--text-tertiary)",
              letterSpacing: "0.04em",
            }}
          >
            #{request.id.slice(0, 6).toUpperCase()}
          </p>
          <h2
            style={{
              fontSize: 15,
              fontWeight: 600,
              color: "var(--text-primary)",
              lineHeight: 1.3,
            }}
          >
            {request.title}
          </h2>
          <div className="flex items-center gap-2 flex-wrap mt-1">
            <span
              className="rounded"
              style={{
                fontFamily: "'Geist Mono', monospace",
                fontSize: 9,
                fontWeight: 600,
                letterSpacing: "0.06em",
                textTransform: "uppercase",
                padding: "2px 6px",
                background: statusStyle.bg,
                color: statusStyle.color,
              }}
            >
              {request.status.replace(/_/g, " ")}
            </span>
            <span
              style={{
                fontFamily: "'Geist Mono', monospace",
                fontSize: 9,
                color: "var(--text-tertiary)",
                letterSpacing: "0.04em",
                textTransform: "uppercase",
              }}
            >
              {phaseLabel} · {stageLabel}
            </span>
          </div>
        </div>
        <button
          onClick={close}
          className="shrink-0 rounded flex items-center justify-center transition-colors"
          style={{
            width: 28,
            height: 28,
            color: "var(--text-tertiary)",
            background: "transparent",
            border: "none",
            cursor: "pointer",
          }}
        >
          <X size={14} />
        </button>
      </div>

      {/* Body */}
      <div className="flex flex-col gap-5 px-5 py-5">

        {/* Description */}
        {request.description && (
          <div>
            <p
              style={{
                fontFamily: "'Geist Mono', monospace",
                fontSize: 9,
                fontWeight: 500,
                letterSpacing: "0.07em",
                textTransform: "uppercase",
                color: "var(--text-tertiary)",
                marginBottom: 6,
              }}
            >
              Problem
            </p>
            <p style={{ fontSize: 13, color: "var(--text-secondary)", lineHeight: 1.6 }}>
              {request.description}
            </p>
          </div>
        )}

        {/* Meta grid */}
        <div className="grid grid-cols-2 gap-3">
          <div>
            <p
              style={{
                fontFamily: "'Geist Mono', monospace",
                fontSize: 9,
                fontWeight: 500,
                letterSpacing: "0.07em",
                textTransform: "uppercase",
                color: "var(--text-tertiary)",
                marginBottom: 3,
              }}
            >
              Priority
            </p>
            <p style={{ fontSize: 12, color: "var(--text-secondary)", fontWeight: 500 }}>
              {request.priority ? PRIORITY_LABELS[request.priority] : "—"}
            </p>
          </div>
          <div>
            <p
              style={{
                fontFamily: "'Geist Mono', monospace",
                fontSize: 9,
                fontWeight: 500,
                letterSpacing: "0.07em",
                textTransform: "uppercase",
                color: "var(--text-tertiary)",
                marginBottom: 3,
              }}
            >
              Due
            </p>
            <p style={{ fontSize: 12, color: "var(--text-secondary)", fontWeight: 500 }}>
              {formatDate(request.deadlineAt ?? null)}
            </p>
          </div>
          <div>
            <p
              style={{
                fontFamily: "'Geist Mono', monospace",
                fontSize: 9,
                fontWeight: 500,
                letterSpacing: "0.07em",
                textTransform: "uppercase",
                color: "var(--text-tertiary)",
                marginBottom: 3,
              }}
            >
              Created
            </p>
            <p style={{ fontSize: 12, color: "var(--text-secondary)", fontWeight: 500 }}>
              {formatDate(request.createdAt)}
            </p>
          </div>
          <div>
            <p
              style={{
                fontFamily: "'Geist Mono', monospace",
                fontSize: 9,
                fontWeight: 500,
                letterSpacing: "0.07em",
                textTransform: "uppercase",
                color: "var(--text-tertiary)",
                marginBottom: 3,
              }}
            >
              Type
            </p>
            <p style={{ fontSize: 12, color: "var(--text-secondary)", fontWeight: 500 }}>
              {request.requestType ?? "—"}
            </p>
          </div>
        </div>

        {/* Full detail link */}
        <a
          href={`/dashboard/requests/${request.id}`}
          className="flex items-center gap-2 rounded-lg px-4 py-2.5 transition-colors"
          style={{
            background: "var(--accent)",
            color: "white",
            fontSize: 13,
            fontWeight: 600,
            textDecoration: "none",
          }}
        >
          <ExternalLink size={13} />
          Open full detail
        </a>
      </div>
    </aside>
  );
}
```

- [ ] **Step 2: Verify TypeScript**

```bash
npx tsc --noEmit
```

Expected: no errors. If `request.requestType` doesn't exist on the type, remove that field from the meta grid.

- [ ] **Step 3: Commit**

```bash
git add components/shell/detail-dock.tsx
git commit -m "feat: add detail dock component (400px right panel with slide animation)"
```

---

## Task 5: Wire Shell into Dashboard Layout

**Files:**
- Modify: `app/(dashboard)/layout.tsx`

The layout becomes the shell host. It fetches `userId` and passes it to `GlobalPane`. The dock and rail are client components that mount inside the server layout. Note: `DetailDock` uses `useSearchParams()` so it must be wrapped in `<Suspense>`.

- [ ] **Step 1: Replace dashboard layout**

```tsx
// app/(dashboard)/layout.tsx
import { Suspense } from "react";
import { createClient } from "@/lib/supabase/server";
import { db } from "@/db";
import { profiles, requests } from "@/db/schema";
import { eq } from "drizzle-orm";
import { RequestsProvider } from "@/context/requests-context";
import { GlobalShortcutsProvider } from "@/components/ui/global-shortcuts-provider";
import { IconRail } from "@/components/shell/icon-rail";
import { GlobalPane } from "@/components/shell/global-pane";
import { DetailDock } from "@/components/shell/detail-dock";
import type { Request } from "@/db/schema";

export default async function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  let orgRequests: Request[] = [];
  let userId = "";

  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();

    if (user) {
      userId = user.id;
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
    // Pages handle auth redirects themselves
  }

  return (
    <RequestsProvider requests={orgRequests}>
      <GlobalShortcutsProvider>
        <div style={{ display: "flex", minHeight: "100vh", background: "var(--bg-base)" }}>
          <IconRail />
          <GlobalPane userId={userId} />
          <main style={{ flex: 1, minWidth: 0, overflowY: "auto" }}>
            {children}
          </main>
          <Suspense>
            <DetailDock />
          </Suspense>
        </div>
      </GlobalShortcutsProvider>
    </RequestsProvider>
  );
}
```

- [ ] **Step 2: Verify TypeScript**

```bash
npx tsc --noEmit
```

Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add app/(dashboard)/layout.tsx
git commit -m "feat: mount 4-zone shell in dashboard layout (rail + pane + main + dock)"
```

---

## Task 6: Remove Old Inline Nav from Dashboard Page

**Files:**
- Modify: `app/(dashboard)/dashboard/page.tsx`

The shell now provides navigation. Remove the inline `<header>` and simplify the page to just the request list inside a padded container.

- [ ] **Step 1: Replace the dashboard page return value**

Find the `return (` block (currently line 78) and replace everything from `return (` to the closing `);` with:

```tsx
  return (
    <div style={{ padding: "var(--space-6)" }}>
      <RealtimeDashboard orgId={profile.orgId} />
      <RequestList
        requests={allRequests}
        myRequestIds={myRequestIds}
        assigneesByRequest={assigneesByRequest}
        projects={activeProjects}
        projectMap={projectMap}
      />
    </div>
  );
```

Keep all the data-fetching code above it unchanged.

- [ ] **Step 2: Verify TypeScript**

```bash
npx tsc --noEmit
```

Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add app/(dashboard)/dashboard/page.tsx
git commit -m "feat: remove inline header nav from dashboard page (shell handles it)"
```

---

## Task 7: Warm Request List Styling + Dock Trigger

**Files:**
- Modify: `components/requests/request-list.tsx`

Replace all dark zinc colors with CSS custom property values. Change row click behavior from navigating to the full detail page to pushing `?dock=<id>` to open the dock. Also update the toolbar styling.

- [ ] **Step 1: Update the `Initials` helper component (around line 146)**

```tsx
function Initials({ name }: { name: string }) {
  const init = name.split(" ").map((w) => w[0]).slice(0, 2).join("").toUpperCase();
  return (
    <div
      className="flex items-center justify-center shrink-0"
      style={{
        width: 20,
        height: 20,
        borderRadius: "50%",
        background: "var(--bg-hover)",
        border: "1px solid var(--border)",
        fontSize: 9,
        fontWeight: 600,
        color: "var(--text-secondary)",
      }}
    >
      {init}
    </div>
  );
}
```

- [ ] **Step 2: Update keyboard handler — Enter now opens dock (line ~216)**

Replace:
```tsx
router.push(`/dashboard/requests/${flatVisible[focused].id}`);
```
With:
```tsx
const params = new URLSearchParams(window.location.search);
params.set("dock", flatVisible[focused].id);
router.push(`?${params.toString()}`);
```

- [ ] **Step 3: Update the toolbar (find the `{/* Toolbar */}` block, around line 242)**

Replace the toolbar `<div>` with:
```tsx
{/* Toolbar */}
<div className="flex items-center justify-between mb-6">
  <div className="flex items-center gap-4">
    <div>
      <h1 style={{ fontSize: 18, fontWeight: 600, color: "var(--text-primary)" }}>
        Requests
      </h1>
      <p style={{ fontSize: 12, color: "var(--text-tertiary)", marginTop: 2 }}>
        {visible.length} total
      </p>
    </div>
    {hasMine && (
      <div
        className="flex items-center gap-1 rounded-lg p-1"
        style={{ background: "var(--bg-surface)", border: "1px solid var(--border)" }}
      >
        <button
          onClick={() => setFilter("all")}
          className="rounded"
          style={{
            fontSize: 12,
            padding: "4px 10px",
            background: filter === "all" ? "var(--bg-hover)" : "transparent",
            color: filter === "all" ? "var(--text-primary)" : "var(--text-tertiary)",
            border: "none",
            cursor: "pointer",
            fontFamily: "inherit",
          }}
        >
          All
        </button>
        <button
          onClick={() => setFilter("mine")}
          className="rounded"
          style={{
            fontSize: 12,
            padding: "4px 10px",
            background: filter === "mine" ? "var(--bg-hover)" : "transparent",
            color: filter === "mine" ? "var(--text-primary)" : "var(--text-tertiary)",
            border: "none",
            cursor: "pointer",
            fontFamily: "inherit",
          }}
        >
          Mine
        </button>
      </div>
    )}
  </div>
  <button
    onClick={() => setShowForm(true)}
    className="rounded-md flex items-center gap-2"
    style={{
      background: "var(--accent)",
      color: "var(--accent-text)",
      fontSize: 13,
      fontWeight: 600,
      padding: "7px 14px",
      border: "none",
      cursor: "pointer",
      fontFamily: "inherit",
    }}
  >
    + New request
  </button>
</div>
```

- [ ] **Step 4: Update request row cards**

Find where each request row is rendered (look for `<Link href={...dashboard/requests...}>`). Replace the `<Link>` wrapper with a `<div>` that pushes the dock URL, and update all dark colors.

The row pattern should become:

```tsx
<div
  key={r.id}
  onClick={() => {
    const params = new URLSearchParams(window.location.search);
    params.set("dock", r.id);
    router.push(`?${params.toString()}`);
  }}
  className="cursor-pointer rounded-lg px-4 py-3 transition-colors"
  style={{
    background: "var(--bg-surface)",
    border: "1px solid var(--border)",
    marginBottom: 6,
  }}
  onMouseEnter={(e) => (e.currentTarget.style.background = "var(--bg-hover)")}
  onMouseLeave={(e) => (e.currentTarget.style.background = "var(--bg-surface)")}
>
  {/* Top row: ID + title */}
  <div className="flex items-start justify-between gap-3 mb-2">
    <div className="flex items-center gap-2 min-w-0">
      <span
        style={{
          fontFamily: "'Geist Mono', monospace",
          fontSize: 9,
          color: "var(--text-tertiary)",
          letterSpacing: "0.03em",
          shrink: 0,
        }}
      >
        #{r.id.slice(0, 6).toUpperCase()}
      </span>
      <span
        style={{
          fontSize: 13,
          fontWeight: 600,
          color: "var(--text-primary)",
          overflow: "hidden",
          textOverflow: "ellipsis",
          whiteSpace: "nowrap",
        }}
      >
        {r.title}
      </span>
    </div>
    {/* Priority badge */}
    {r.priority && (
      <span
        className="shrink-0 rounded"
        style={{
          fontSize: 10,
          fontWeight: 600,
          padding: "2px 6px",
          background: r.priority === "p0" ? "#FEE2E2" : r.priority === "p1" ? "#FFEDD5" : r.priority === "p2" ? "#FEF9C3" : "var(--bg-hover)",
          color: r.priority === "p0" ? "#DC2626" : r.priority === "p1" ? "#C2410C" : r.priority === "p2" ? "#A16207" : "var(--text-secondary)",
        }}
      >
        {r.priority.toUpperCase()}
      </span>
    )}
  </div>

  {/* Bottom row: phase·stage + deadline + assignees */}
  <div className="flex items-center gap-3">
    <span
      style={{
        fontFamily: "'Geist Mono', monospace",
        fontSize: 9,
        color: "var(--text-tertiary)",
        letterSpacing: "0.04em",
        textTransform: "uppercase",
      }}
    >
      {phaseLabel} · {stageLabel}
    </span>
    {deadlineSt && (
      <span
        className="rounded"
        style={{
          fontSize: 10,
          fontWeight: 500,
          padding: "1px 5px",
          background: "#FEF3C7",
          color: "#B45309",
        }}
      >
        {deadlineSt.label}
      </span>
    )}
    {isStalled(r) && (
      <span style={{ fontSize: 10, color: "#B45309" }}>stalled</span>
    )}
  </div>
</div>
```

Note: `phaseLabel` and `stageLabel` come from calling `getEffectivePhaseAndStage(r)` and then looking up in `PHASES`. Reuse the existing helper logic already in the file.

- [ ] **Step 5: Verify TypeScript**

```bash
npx tsc --noEmit
```

Expected: no errors.

- [ ] **Step 6: Start dev server and visually verify**

```bash
npm run dev
```

Open http://localhost:3000/dashboard and verify:
- Warm ivory background visible
- Icon rail on far left (48px, DQ logo, nav icons)
- Global pane visible (256px, stats, my work)
- Request list shows cards with warm styling and Geist Mono IDs
- Clicking a request card opens the detail dock on the right (pushes canvas)
- Closing dock (×) removes it

- [ ] **Step 7: Commit**

```bash
git add components/requests/request-list.tsx
git commit -m "feat: warm request list styling + dock trigger on row click"
```

---

## Self-Review

**Spec coverage check:**
- ✅ CSS token system → Task 1
- ✅ Satoshi font loading → Task 1
- ✅ Shell layout (4 zones) → Task 5
- ✅ Icon rail (48px) → Task 2
- ✅ Global pane (256px, stats + my work + recent) → Task 3
- ✅ Right detail dock (400px, slide in, push canvas) → Task 4
- ✅ Dock opens on request click (`?dock=<id>`) → Task 7
- ✅ Dock close button removes dock → Task 4
- ✅ Request list warm styling → Task 7
- ✅ REQ-ID in Geist Mono → Tasks 3, 4, 7
- ✅ Phase·stage label in Geist Mono → Tasks 4, 7
- ✅ Dashboard page nav cleanup → Task 6

**Placeholder scan:** No TBDs or TODOs. All code blocks are complete.

**Type consistency:** `request.predesignStage`, `request.designStage`, `request.kanbanState`, `request.trackStage`, `request.deadlineAt` — all used consistently across Tasks 3, 4, and 7. `request.createdById` is used in GlobalPane for "My Work" — if this field name differs in the schema, Task 3 Step 2 calls this out explicitly.
