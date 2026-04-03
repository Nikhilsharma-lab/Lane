# KF4 Handoff Intelligence Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build three features: AI-generated handoff brief (auto-generates at Handoff stage), dev question tracking with quality score on Radar, and Figma drift email notification.

**Architecture:** Pre-work (Task 0) runs both DB schema changes and `db:push` before any subagent starts. Then 3 subagents execute in parallel — A (handoff brief), B (dev questions + Radar score), C (Figma drift email) — with zero file overlap.

**Tech Stack:** Next.js 14 App Router · Drizzle ORM · @ai-sdk/anthropic (claude-3-5-haiku-20241022) · Resend (email) · Tailwind CSS

---

## Task 0: Pre-work — DB Schema (main agent, run first, sequential)

**Files:**
- Create: `db/schema/handoff_briefs.ts`
- Modify: `db/schema/requests.ts` (add `isDevQuestion` to comments table)
- Modify: `db/schema/index.ts`

- [ ] **Step 1: Create `db/schema/handoff_briefs.ts`**

```typescript
// db/schema/handoff_briefs.ts
import { pgTable, uuid, text, timestamp, integer, jsonb } from "drizzle-orm/pg-core";
import { requests } from "./requests";

export const requestHandoffBriefs = pgTable("request_handoff_briefs", {
  id: uuid("id").primaryKey().defaultRandom(),
  requestId: uuid("request_id")
    .notNull()
    .unique()
    .references(() => requests.id, { onDelete: "cascade" }),

  designDecisions: jsonb("design_decisions")
    .$type<{ decision: string; rationale: string }[]>()
    .notNull()
    .default([]),
  openQuestions: jsonb("open_questions")
    .$type<string[]>()
    .notNull()
    .default([]),
  buildSequence: jsonb("build_sequence")
    .$type<string[]>()
    .notNull()
    .default([]),
  figmaNotes: text("figma_notes").notNull().default(""),
  edgeCases: jsonb("edge_cases")
    .$type<string[]>()
    .notNull()
    .default([]),

  aiModel: text("ai_model").notNull(),
  tokensUsed: integer("tokens_used"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export type RequestHandoffBrief = typeof requestHandoffBriefs.$inferSelect;
export type NewRequestHandoffBrief = typeof requestHandoffBriefs.$inferInsert;
```

- [ ] **Step 2: Add `isDevQuestion` column to comments table in `db/schema/requests.ts`**

Find the comments table (around line 154). Replace:

```typescript
export const comments = pgTable("comments", {
  id: uuid("id").primaryKey().defaultRandom(),
  requestId: uuid("request_id")
    .notNull()
    .references(() => requests.id, { onDelete: "cascade" }),
  authorId: uuid("author_id").references(() => profiles.id),
  body: text("body").notNull(),
  isSystem: boolean("is_system").notNull().default(false), // true for AI-generated
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});
```

With:

```typescript
export const comments = pgTable("comments", {
  id: uuid("id").primaryKey().defaultRandom(),
  requestId: uuid("request_id")
    .notNull()
    .references(() => requests.id, { onDelete: "cascade" }),
  authorId: uuid("author_id").references(() => profiles.id),
  body: text("body").notNull(),
  isSystem: boolean("is_system").notNull().default(false),
  isDevQuestion: boolean("is_dev_question").notNull().default(false),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});
```

- [ ] **Step 3: Export new table from `db/schema/index.ts`**

Append to the end of `db/schema/index.ts`:

```typescript
export * from "./handoff_briefs";
```

- [ ] **Step 4: Push schema to Supabase**

```bash
cd ~/DesignQ2 && npm run db:push
```

Expected: No errors. Table `request_handoff_briefs` created. Column `is_dev_question` added to `comments`.

- [ ] **Step 5: Verify TypeScript compiles**

```bash
cd ~/DesignQ2 && npx tsc --noEmit
```

Expected: No errors.

- [ ] **Step 6: Commit schema**

```bash
cd ~/DesignQ2 && git add db/schema/handoff_briefs.ts db/schema/requests.ts db/schema/index.ts
git commit -m "feat: add request_handoff_briefs table and isDevQuestion column to comments"
```

---

## Subagent A: Handoff Brief

*Start after Task 0 is committed. Runs in parallel with Subagents B and C.*

---

### Task A1: AI generation function

**Files:**
- Create: `lib/ai/handoff-brief.ts`

- [ ] **Step 1: Create `lib/ai/handoff-brief.ts`**

```typescript
// lib/ai/handoff-brief.ts
import { generateObject } from "ai";
import { anthropic } from "@ai-sdk/anthropic";
import { z } from "zod";

const handoffBriefSchema = z.object({
  designDecisions: z
    .array(
      z.object({
        decision: z.string().describe("The specific design choice made"),
        rationale: z.string().describe("Why this choice was made"),
      })
    )
    .describe(
      "2-4 key design decisions made during this project. Extract from the description and comment thread. What approach was chosen, what alternatives exist, and why this direction was taken."
    ),
  openQuestions: z
    .array(z.string())
    .describe(
      "2-4 things that are NOT fully resolved that the dev should flag back to the designer. Examples: placeholder copy that needs content team, edge case behavior not fully specified, responsive behavior unclear."
    ),
  buildSequence: z
    .array(z.string())
    .describe(
      "2-3 suggested implementation steps in order. Start with the highest-risk or most foundational component. Short imperative statements, e.g. 'Build the data model first' or 'Start with the form validation logic'."
    ),
  figmaNotes: z
    .string()
    .describe(
      "One paragraph of practical Figma guidance. Which frames are the main screens, what's annotated, what components exist, what the dev should look for when they first open the file."
    ),
  edgeCases: z
    .array(z.string())
    .describe(
      "2-4 design edge cases the dev MUST handle. Be specific to this request: empty states, error states, loading states, mobile breakpoints, truncated text, missing or null data scenarios."
    ),
});

export type HandoffBriefResult = z.infer<typeof handoffBriefSchema>;

export async function generateHandoffBrief(input: {
  title: string;
  description: string;
  businessContext?: string | null;
  successMetrics?: string | null;
  figmaUrl?: string | null;
  comments: Array<{ body: string; authorName: string }>;
}): Promise<HandoffBriefResult> {
  const commentsBlock =
    input.comments.length > 0
      ? `\nCOMMENT THREAD (${input.comments.length} comments):\n${input.comments
          .map((c, i) => `${i + 1}. ${c.authorName}: ${c.body.slice(0, 300)}`)
          .join("\n")}\n`
      : "\nCOMMENT THREAD: None\n";

  const { object } = await generateObject({
    model: anthropic("claude-3-5-haiku-20241022"),
    schema: handoffBriefSchema,
    prompt: `You are a senior designer writing a handoff brief for a developer who is about to build this feature. Your job is to translate everything known about this design into a brief that helps the dev build it correctly the first time — reducing back-and-forth questions.

---
TITLE: ${input.title}

DESCRIPTION:
${input.description}

${input.businessContext ? `BUSINESS CONTEXT:\n${input.businessContext}\n` : ""}
${input.successMetrics ? `SUCCESS METRICS:\n${input.successMetrics}\n` : ""}
${input.figmaUrl ? `FIGMA: ${input.figmaUrl}\n` : ""}
---
${commentsBlock}

Write a handoff brief that surfaces decisions already made, flags unresolved details, and helps the dev start in the right place. Be specific — avoid generic advice. Base everything on the content above.`,
  });

  return object;
}
```

- [ ] **Step 2: Verify TypeScript compiles**

```bash
cd ~/DesignQ2 && npx tsc --noEmit
```

Expected: No errors.

- [ ] **Step 3: Commit**

```bash
cd ~/DesignQ2 && git add lib/ai/handoff-brief.ts
git commit -m "feat: add generateHandoffBrief AI function"
```

---

### Task A2: API route

**Files:**
- Create: `app/api/requests/[id]/handoff-brief/route.ts`

- [ ] **Step 1: Create `app/api/requests/[id]/handoff-brief/route.ts`**

```typescript
// app/api/requests/[id]/handoff-brief/route.ts
import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { db } from "@/db";
import { requests, profiles, comments, requestHandoffBriefs } from "@/db/schema";
import { eq, and, inArray } from "drizzle-orm";
import { generateHandoffBrief } from "@/lib/ai/handoff-brief";

export async function POST(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id: requestId } = await params;

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });

  const [profile] = await db.select().from(profiles).where(eq(profiles.id, user.id));
  if (!profile) return NextResponse.json({ error: "Profile not found" }, { status: 404 });

  const [request] = await db.select().from(requests).where(eq(requests.id, requestId));
  if (!request || request.orgId !== profile.orgId) {
    return NextResponse.json({ error: "Request not found" }, { status: 404 });
  }

  // Return cached brief if already generated
  const [existing] = await db
    .select()
    .from(requestHandoffBriefs)
    .where(eq(requestHandoffBriefs.requestId, requestId));

  if (existing) return NextResponse.json({ brief: existing });

  try {
    // Fetch all non-system comments with author names
    const rawComments = await db
      .select()
      .from(comments)
      .where(and(eq(comments.requestId, requestId), eq(comments.isSystem, false)));

    const authorIds = [
      ...new Set(rawComments.map((c) => c.authorId).filter(Boolean)),
    ] as string[];

    const authorLookup: Record<string, string> = {};
    if (authorIds.length) {
      const authorProfiles = await db
        .select({ id: profiles.id, fullName: profiles.fullName })
        .from(profiles)
        .where(inArray(profiles.id, authorIds));
      for (const p of authorProfiles) {
        if (p.id) authorLookup[p.id] = p.fullName ?? "Unknown";
      }
    }

    const formattedComments = rawComments.map((c) => ({
      body: c.body,
      authorName: c.authorId ? (authorLookup[c.authorId] ?? "Unknown") : "Unknown",
    }));

    const result = await generateHandoffBrief({
      title: request.title,
      description: request.description,
      businessContext: request.businessContext,
      successMetrics: request.successMetrics,
      figmaUrl: request.figmaUrl,
      comments: formattedComments,
    });

    const inserted = await db
      .insert(requestHandoffBriefs)
      .values({
        requestId,
        designDecisions: result.designDecisions,
        openQuestions: result.openQuestions,
        buildSequence: result.buildSequence,
        figmaNotes: result.figmaNotes,
        edgeCases: result.edgeCases,
        aiModel: "claude-3-5-haiku-20241022",
      })
      .onConflictDoNothing()
      .returning();

    // Race condition: another concurrent request already inserted
    if (inserted.length === 0) {
      const [race] = await db
        .select()
        .from(requestHandoffBriefs)
        .where(eq(requestHandoffBriefs.requestId, requestId));
      return NextResponse.json({ brief: race });
    }

    return NextResponse.json({ brief: inserted[0] });
  } catch (err) {
    console.error("[handoff-brief] AI error:", err);
    return NextResponse.json({ error: "Brief generation failed" }, { status: 500 });
  }
}
```

- [ ] **Step 2: Verify TypeScript compiles**

```bash
cd ~/DesignQ2 && npx tsc --noEmit
```

Expected: No errors.

- [ ] **Step 3: Commit**

```bash
cd ~/DesignQ2 && git add app/api/requests/[id]/handoff-brief/route.ts
git commit -m "feat: add handoff-brief API route"
```

---

### Task A3: HandoffBriefPanel component

**Files:**
- Create: `components/requests/handoff-brief-panel.tsx`

- [ ] **Step 1: Create `components/requests/handoff-brief-panel.tsx`**

```typescript
// components/requests/handoff-brief-panel.tsx
"use client";

import { useEffect, useState } from "react";
import type { RequestHandoffBrief } from "@/db/schema";

type Props = {
  requestId: string;
  existingBrief: RequestHandoffBrief | null;
};

export function HandoffBriefPanel({ requestId, existingBrief }: Props) {
  const [brief, setBrief] = useState<RequestHandoffBrief | null>(existingBrief);
  const [loading, setLoading] = useState(existingBrief === null);

  useEffect(() => {
    if (existingBrief !== null) return;

    fetch(`/api/requests/${requestId}/handoff-brief`, { method: "POST" })
      .then((res) => res.json())
      .then((data) => {
        if (data.brief) setBrief(data.brief);
      })
      .catch(() => {
        // silent fail — brief is non-blocking
      })
      .finally(() => setLoading(false));
  }, [requestId, existingBrief]);

  if (loading) {
    return (
      <section className="border border-zinc-800 rounded-xl overflow-hidden">
        <div className="px-5 py-3 border-b border-zinc-800 bg-zinc-900/50">
          <span className="text-xs font-medium text-zinc-400 uppercase tracking-wide">
            AI Handoff Brief
          </span>
        </div>
        <div className="p-5 space-y-4 animate-pulse">
          <div className="h-3 bg-zinc-800 rounded w-3/4" />
          <div className="h-3 bg-zinc-800 rounded w-1/2" />
          <div className="h-3 bg-zinc-800 rounded w-5/6" />
          <div className="h-3 bg-zinc-800 rounded w-2/3" />
        </div>
      </section>
    );
  }

  if (!brief) return null;

  return (
    <section className="border border-zinc-800 rounded-xl overflow-hidden">
      <div className="px-5 py-3 border-b border-zinc-800 bg-zinc-900/50 flex items-center justify-between">
        <span className="text-xs font-medium text-zinc-400 uppercase tracking-wide">
          AI Handoff Brief
        </span>
        <span className="text-[10px] text-zinc-600 font-mono">{brief.aiModel}</span>
      </div>

      <div className="p-5 space-y-5">
        {brief.designDecisions.length > 0 && (
          <div>
            <div className="text-[10px] text-zinc-600 uppercase tracking-wide mb-2">
              Design decisions
            </div>
            <div className="space-y-2.5">
              {brief.designDecisions.map((d, i) => (
                <div key={i} className="border border-zinc-800 rounded-lg px-3 py-2.5">
                  <p className="text-xs text-zinc-200 mb-1">{d.decision}</p>
                  <p className="text-[11px] text-zinc-500">{d.rationale}</p>
                </div>
              ))}
            </div>
          </div>
        )}

        {brief.openQuestions.length > 0 && (
          <div>
            <div className="text-[10px] text-zinc-600 uppercase tracking-wide mb-2">
              Open questions — flag these back
            </div>
            <ul className="space-y-1.5">
              {brief.openQuestions.map((q, i) => (
                <li key={i} className="text-xs text-zinc-400 flex gap-2">
                  <span className="text-amber-400 shrink-0">?</span>
                  {q}
                </li>
              ))}
            </ul>
          </div>
        )}

        {brief.buildSequence.length > 0 && (
          <div>
            <div className="text-[10px] text-zinc-600 uppercase tracking-wide mb-2">
              Build sequence
            </div>
            <ol className="space-y-1.5">
              {brief.buildSequence.map((step, i) => (
                <li key={i} className="text-xs text-zinc-400 flex gap-2">
                  <span className="text-zinc-600 shrink-0 font-mono">{i + 1}.</span>
                  {step}
                </li>
              ))}
            </ol>
          </div>
        )}

        {brief.figmaNotes && (
          <div>
            <div className="text-[10px] text-zinc-600 uppercase tracking-wide mb-1.5">
              Figma notes
            </div>
            <p className="text-xs text-zinc-400 leading-relaxed">{brief.figmaNotes}</p>
          </div>
        )}

        {brief.edgeCases.length > 0 && (
          <div>
            <div className="text-[10px] text-zinc-600 uppercase tracking-wide mb-2">
              Edge cases to handle
            </div>
            <ul className="space-y-1.5">
              {brief.edgeCases.map((e, i) => (
                <li key={i} className="text-xs text-zinc-400 flex gap-2">
                  <span className="text-indigo-400 shrink-0">→</span>
                  {e}
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>
    </section>
  );
}
```

- [ ] **Step 2: Verify TypeScript compiles**

```bash
cd ~/DesignQ2 && npx tsc --noEmit
```

Expected: No errors.

- [ ] **Step 3: Commit**

```bash
cd ~/DesignQ2 && git add components/requests/handoff-brief-panel.tsx
git commit -m "feat: add HandoffBriefPanel component"
```

---

### Task A4: Page integration

**Files:**
- Modify: `app/(dashboard)/dashboard/requests/[id]/page.tsx`

- [ ] **Step 1: Add import at top of page.tsx**

Find the existing import block. Add two new imports alongside the existing ones:

```typescript
import { HandoffBriefPanel } from "@/components/requests/handoff-brief-panel";
import { requestHandoffBriefs } from "@/db/schema";
```

- [ ] **Step 2: Add server-side fetch for existing handoff brief**

Find this block in the page (around line 142):

```typescript
let existingBrief: (typeof requestContextBriefs.$inferSelect) | null = null;
try {
  const [briefRow] = await db
    .select()
    .from(requestContextBriefs)
    .where(eq(requestContextBriefs.requestId, id));
  existingBrief = briefRow ?? null;
} catch {
  // brief query failed silently
}
```

Add the following block directly after it:

```typescript
let existingHandoffBrief: (typeof requestHandoffBriefs.$inferSelect) | null = null;
try {
  const [handoffBriefRow] = await db
    .select()
    .from(requestHandoffBriefs)
    .where(eq(requestHandoffBriefs.requestId, id));
  existingHandoffBrief = handoffBriefRow ?? null;
} catch {
  // handoff brief query failed silently
}
```

- [ ] **Step 3: Render HandoffBriefPanel in main content column**

Find this block in the JSX (around line 247):

```tsx
{/* AI Context Brief — design phase only */}
{request.phase === "design" && (
  <ContextBriefPanel
    requestId={request.id}
    existingBrief={existingBrief}
  />
)}
```

Add the following block directly after it:

```tsx
{/* AI Handoff Brief — shown at Handoff stage and throughout dev phase */}
{((request.phase === "design" && request.designStage === "handoff") ||
  request.phase === "dev") && (
  <HandoffBriefPanel
    requestId={request.id}
    existingBrief={existingHandoffBrief}
  />
)}
```

- [ ] **Step 4: Verify TypeScript compiles**

```bash
cd ~/DesignQ2 && npx tsc --noEmit
```

Expected: No errors.

- [ ] **Step 5: Smoke test**

```bash
cd ~/DesignQ2 && npm run dev
```

Navigate to a request in `designStage === "handoff"` (e.g. log in as `alex@acme-demo.io`, find a request at handoff stage). The brief should appear below the success metrics section with a skeleton loader, then 5 sections after generation. Repeat visit should be instant (cached).

- [ ] **Step 6: Commit**

```bash
cd ~/DesignQ2 && git add app/\(dashboard\)/dashboard/requests/\[id\]/page.tsx
git commit -m "feat: integrate HandoffBriefPanel into request detail page"
```

---

## Subagent B: Dev Questions + Quality Score

*Start after Task 0 is committed. Runs in parallel with Subagents A and C.*

---

### Task B1: Update comment route

**Files:**
- Modify: `app/api/requests/[id]/comment/route.ts`

- [ ] **Step 1: Update the route to accept `isDevQuestion`**

Replace the entire file content with:

```typescript
// app/api/requests/[id]/comment/route.ts
import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { db } from "@/db";
import { comments } from "@/db/schema";

export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id: requestId } = await params;
  const { body, isDevQuestion = false } = await req.json();

  if (!body?.trim()) return NextResponse.json({ error: "Comment cannot be empty" });

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });

  await db.insert(comments).values({
    requestId,
    authorId: user.id,
    body: body.trim(),
    isSystem: false,
    isDevQuestion: Boolean(isDevQuestion),
  });

  return NextResponse.json({ success: true });
}
```

- [ ] **Step 2: Verify TypeScript compiles**

```bash
cd ~/DesignQ2 && npx tsc --noEmit
```

Expected: No errors.

- [ ] **Step 3: Commit**

```bash
cd ~/DesignQ2 && git add app/api/requests/\[id\]/comment/route.ts
git commit -m "feat: comment route accepts isDevQuestion flag"
```

---

### Task B2: DevPhasePanel — "Ask Designer" button + question count

**Files:**
- Modify: `components/requests/dev-phase-panel.tsx`

- [ ] **Step 1: Replace the entire file**

The existing DevPhasePanel only has kanban state management. We're adding two things: a `devQuestionCount` prop shown in the header, and an "Ask Designer" button that opens a textarea and posts a tagged comment.

```typescript
// components/requests/dev-phase-panel.tsx
"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

const STATES = [
  { key: "todo",        label: "To Do",       desc: "Waiting for dev to pick up" },
  { key: "in_progress", label: "In Progress", desc: "Dev actively building" },
  { key: "in_review",   label: "In Review",   desc: "Code review in progress" },
  { key: "qa",          label: "QA",          desc: "Quality assurance testing" },
  { key: "done",        label: "Done",        desc: "Shipped to production" },
] as const;

type KState = (typeof STATES)[number]["key"];

interface Props {
  requestId: string;
  kanbanState: KState;
  figmaUrl: string | null;
  figmaLockedAt: string | null;
  devQuestionCount: number;
}

export function DevPhasePanel({
  requestId,
  kanbanState,
  figmaUrl,
  figmaLockedAt,
  devQuestionCount,
}: Props) {
  const router = useRouter();
  const [optimisticKanban, setOptimisticKanban] = useState<KState>(kanbanState);
  const [shipping, setShipping] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Ask Designer state
  const [askOpen, setAskOpen] = useState(false);
  const [askBody, setAskBody] = useState("");
  const [askSubmitting, setAskSubmitting] = useState(false);

  const currentIdx = STATES.findIndex((s) => s.key === kanbanState);
  const optimisticIdx = STATES.findIndex((s) => s.key === optimisticKanban);
  const current = STATES[currentIdx];
  const isDone = optimisticKanban === "done";

  async function moveState(newState: KState) {
    const previousState = optimisticKanban;
    setOptimisticKanban(newState);
    setError(null);
    try {
      const res = await fetch(`/api/requests/${requestId}/kanban`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ state: newState }),
      });
      const data = await res.json();
      if (!res.ok) {
        setOptimisticKanban(previousState);
        setError(data.error ?? "Failed to move");
      } else {
        router.refresh();
      }
    } catch {
      setOptimisticKanban(previousState);
      setError("Network error");
    }
  }

  async function shipToTrack() {
    setShipping(true);
    setError(null);
    try {
      const res = await fetch(`/api/requests/${requestId}/advance-phase`, { method: "POST" });
      const data = await res.json();
      if (!res.ok) setError(data.error ?? "Failed to ship");
      else router.refresh();
    } catch {
      setError("Network error");
    } finally {
      setShipping(false);
    }
  }

  async function submitQuestion() {
    if (!askBody.trim()) return;
    setAskSubmitting(true);
    try {
      await fetch(`/api/requests/${requestId}/comment`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ body: askBody.trim(), isDevQuestion: true }),
      });
      setAskBody("");
      setAskOpen(false);
      router.refresh();
    } catch {
      // silent fail
    } finally {
      setAskSubmitting(false);
    }
  }

  return (
    <div className="border border-zinc-800 rounded-xl overflow-hidden">
      {/* Header */}
      <div className="px-5 py-3 border-b border-zinc-800 bg-zinc-900/50 flex items-center justify-between">
        <span className="text-xs font-medium text-zinc-400 uppercase tracking-wide">
          Phase 3 — Dev
        </span>
        <div className="flex items-center gap-2">
          {devQuestionCount > 0 && (
            <span className="text-[10px] font-mono bg-amber-500/10 text-amber-400 border border-amber-500/20 rounded px-1.5 py-0.5">
              {devQuestionCount} dev {devQuestionCount === 1 ? "question" : "questions"}
            </span>
          )}
          <span className="text-xs text-zinc-600">Dev leads</span>
        </div>
      </div>

      {/* Figma lock badge */}
      {figmaUrl && (
        <div className="px-5 py-2.5 border-b border-zinc-800/50 flex items-center gap-2">
          <span className="text-[10px] text-zinc-600 uppercase tracking-wide">Figma</span>
          <a
            href={figmaUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="text-xs text-indigo-400 hover:text-indigo-300 transition-colors truncate"
          >
            Open design
          </a>
          {figmaLockedAt && (
            <span className="text-[10px] text-zinc-700 ml-auto shrink-0">
              locked {new Date(figmaLockedAt).toLocaleDateString("en-US", { month: "short", day: "numeric" })}
            </span>
          )}
        </div>
      )}

      {/* Kanban stepper */}
      <div className="px-5 py-4 border-b border-zinc-800/50">
        <div className="flex items-start">
          {STATES.map((s, i) => {
            const isPast = i < optimisticIdx;
            const isCur = s.key === optimisticKanban;
            return (
              <div key={s.key} className="flex items-center flex-1">
                <div className="flex flex-col items-center flex-1">
                  <div
                    className={`w-6 h-6 rounded-full flex items-center justify-center text-[10px] font-mono border transition-colors ${
                      isPast
                        ? "bg-green-500/15 border-green-500/30 text-green-400"
                        : isCur
                        ? "bg-indigo-500/15 border-indigo-500/30 text-indigo-400"
                        : "bg-zinc-800/40 border-zinc-700/40 text-zinc-600"
                    }`}
                  >
                    {isPast ? "✓" : i + 1}
                  </div>
                  <span
                    className={`text-[9px] mt-1 font-medium uppercase tracking-wide text-center leading-tight ${
                      isCur ? "text-indigo-400" : isPast ? "text-green-500/80" : "text-zinc-600"
                    }`}
                  >
                    {s.label}
                  </span>
                </div>
                {i < STATES.length - 1 && (
                  <div className={`h-px w-full mb-5 mx-0.5 ${i < optimisticIdx ? "bg-green-500/20" : "bg-zinc-800"}`} />
                )}
              </div>
            );
          })}
        </div>
      </div>

      {/* Current state + actions */}
      <div className="px-5 py-4 space-y-3">
        {current && (
          <div>
            <p className="text-xs font-semibold text-zinc-200 mb-0.5">{current.label}</p>
            <p className="text-xs text-zinc-500">{current.desc}</p>
          </div>
        )}

        {!isDone && (
          <div className="flex gap-2">
            {optimisticIdx > 0 && (
              <button
                onClick={() => moveState(STATES[optimisticIdx - 1].key)}
                className="text-xs text-zinc-500 hover:text-zinc-300 border border-zinc-800 hover:border-zinc-700 px-3 py-1.5 rounded-lg transition-colors"
              >
                ← {STATES[optimisticIdx - 1].label}
              </button>
            )}
            <button
              onClick={() => moveState(STATES[optimisticIdx + 1].key)}
              className="text-xs bg-zinc-800 hover:bg-zinc-700 text-zinc-200 px-3 py-1.5 rounded-lg border border-zinc-700 transition-colors"
            >
              Move to {STATES[optimisticIdx + 1].label}
            </button>
          </div>
        )}

        {isDone && (
          <div className="space-y-3">
            <div className="bg-green-500/5 border border-green-500/15 rounded-lg px-3 py-2 flex items-center gap-2">
              <span className="text-green-400 text-xs">✓</span>
              <p className="text-[11px] text-green-400/80">Dev complete — ready to ship to Track</p>
            </div>
            <button
              onClick={shipToTrack}
              disabled={shipping}
              className="text-xs bg-zinc-800 hover:bg-zinc-700 text-zinc-200 px-3 py-1.5 rounded-lg border border-zinc-700 transition-colors disabled:opacity-40 disabled:cursor-not-allowed flex items-center gap-2"
            >
              {shipping && (
                <span className="w-3 h-3 border border-zinc-400 border-t-transparent rounded-full animate-spin" />
              )}
              Ship to Track
            </button>
          </div>
        )}

        {/* Ask Designer */}
        <div className="pt-1 border-t border-zinc-800/50">
          {!askOpen ? (
            <button
              onClick={() => setAskOpen(true)}
              className="text-xs text-zinc-500 hover:text-zinc-300 border border-zinc-800 hover:border-zinc-700 px-3 py-1.5 rounded-lg transition-colors w-full text-left"
            >
              Ask designer a question
            </button>
          ) : (
            <div className="space-y-2">
              <textarea
                value={askBody}
                onChange={(e) => setAskBody(e.target.value)}
                placeholder="What do you need clarification on?"
                rows={3}
                className="w-full text-xs bg-zinc-900 border border-zinc-700 rounded-lg px-3 py-2 text-zinc-200 placeholder:text-zinc-600 resize-none focus:outline-none focus:border-zinc-500"
              />
              <div className="flex gap-2">
                <button
                  onClick={submitQuestion}
                  disabled={askSubmitting || !askBody.trim()}
                  className="text-xs bg-amber-500/10 hover:bg-amber-500/20 text-amber-400 border border-amber-500/20 px-3 py-1.5 rounded-lg transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
                >
                  {askSubmitting ? "Sending…" : "Ask designer"}
                </button>
                <button
                  onClick={() => { setAskOpen(false); setAskBody(""); }}
                  className="text-xs text-zinc-600 hover:text-zinc-400 px-3 py-1.5 rounded-lg transition-colors"
                >
                  Cancel
                </button>
              </div>
            </div>
          )}
        </div>

        {error && (
          <p className="text-xs text-red-400 bg-red-500/10 border border-red-500/20 rounded-lg px-3 py-2">
            {error}
          </p>
        )}
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Update the page to pass `devQuestionCount` to DevPhasePanel**

In `app/(dashboard)/dashboard/requests/[id]/page.tsx`, find the DevPhasePanel JSX (around line 434):

```tsx
) : request.phase === "dev" ? (
  <div className="mb-2">
    <DevPhasePanel
      requestId={request.id}
      kanbanState={(request.kanbanState ?? "todo") as "todo" | "in_progress" | "in_review" | "qa" | "done"}
      figmaUrl={request.figmaUrl}
      figmaLockedAt={toISO(request.figmaLockedAt)}
    />
  </div>
```

Replace with:

```tsx
) : request.phase === "dev" ? (
  <div className="mb-2">
    <DevPhasePanel
      requestId={request.id}
      kanbanState={(request.kanbanState ?? "todo") as "todo" | "in_progress" | "in_review" | "qa" | "done"}
      figmaUrl={request.figmaUrl}
      figmaLockedAt={toISO(request.figmaLockedAt)}
      devQuestionCount={requestComments.filter((c) => c.isDevQuestion).length}
    />
  </div>
```

- [ ] **Step 3: Verify TypeScript compiles**

```bash
cd ~/DesignQ2 && npx tsc --noEmit
```

Expected: No errors.

- [ ] **Step 4: Smoke test**

```bash
cd ~/DesignQ2 && npm run dev
```

Navigate to a request in dev phase. The sidebar should show "Ask designer a question" button at the bottom of the Dev panel. Click it, type a question, submit. Check the Activity section — question comment should appear. The dev questions badge should appear in the panel header (requires page refresh since it's server-rendered).

- [ ] **Step 5: Commit**

```bash
cd ~/DesignQ2 && git add components/requests/dev-phase-panel.tsx app/\(dashboard\)/dashboard/requests/\[id\]/page.tsx
git commit -m "feat: add Ask Designer button and dev question count to dev phase panel"
```

---

### Task B3: Avg dev questions in lib/radar.ts

**Files:**
- Modify: `lib/radar.ts`

- [ ] **Step 1: Add `computeAvgDevQuestions` function to `lib/radar.ts`**

Append to the end of `lib/radar.ts`:

```typescript
/**
 * Compute avg dev questions per handoff for each designer over the last 30 days.
 * devQuestions: flat list of { requestId } entries from comments where isDevQuestion=true.
 * allAssignments: lead assignments (requestId + assigneeId).
 * Returns designerId → avg (rounded to 1 decimal).
 */
export function computeAvgDevQuestions(
  designers: RadarDesigner[],
  allRequests: Request[],
  allAssignments: Array<{ requestId: string; assigneeId: string }>,
  devQuestions: Array<{ requestId: string }>
): Record<string, number> {
  const now = Date.now();
  const thirtyDaysMs = 30 * 86_400_000;

  // requestId → designerId (lead assignment)
  const designerByRequest = new Map<string, string>();
  for (const a of allAssignments) {
    designerByRequest.set(a.requestId, a.assigneeId);
  }

  // requestId → dev question count
  const questionsByRequest = new Map<string, number>();
  for (const q of devQuestions) {
    questionsByRequest.set(q.requestId, (questionsByRequest.get(q.requestId) ?? 0) + 1);
  }

  const result: Record<string, number> = {};
  for (const designer of designers) {
    // Their requests that entered dev or track phase within last 30 days
    const devReqs = allRequests.filter(
      (r) =>
        (r.phase === "dev" || r.phase === "track") &&
        designerByRequest.get(r.id) === designer.id &&
        now - new Date(r.updatedAt).getTime() <= thirtyDaysMs
    );

    if (devReqs.length === 0) {
      result[designer.id] = 0;
      continue;
    }

    const totalQuestions = devReqs.reduce(
      (sum, r) => sum + (questionsByRequest.get(r.id) ?? 0),
      0
    );
    result[designer.id] = Math.round((totalQuestions / devReqs.length) * 10) / 10;
  }

  return result;
}
```

- [ ] **Step 2: Verify TypeScript compiles**

```bash
cd ~/DesignQ2 && npx tsc --noEmit
```

Expected: No errors.

- [ ] **Step 3: Commit**

```bash
cd ~/DesignQ2 && git add lib/radar.ts
git commit -m "feat: add computeAvgDevQuestions to radar lib"
```

---

### Task B4: Radar page — fetch dev questions and compute avg

**Files:**
- Modify: `app/(dashboard)/dashboard/radar/page.tsx`

- [ ] **Step 1: Add import for `comments` and `computeAvgDevQuestions`**

Find the existing imports in `app/(dashboard)/dashboard/radar/page.tsx`. Add `comments` to the `@/db/schema` import and `computeAvgDevQuestions` to the `@/lib/radar` import.

Replace:
```typescript
import {
  profiles,
  requests,
  assignments,
  figmaUpdates,
  requestStages,
} from "@/db/schema";
```

With:
```typescript
import {
  profiles,
  requests,
  assignments,
  figmaUpdates,
  requestStages,
  comments,
} from "@/db/schema";
```

Replace:
```typescript
import {
  buildDesignerRows,
  getPhaseHeatMap,
  getRiskItems,
  getShippedThisWeek,
  makeCanAction,
} from "@/lib/radar";
```

With:
```typescript
import {
  buildDesignerRows,
  getPhaseHeatMap,
  getRiskItems,
  getShippedThisWeek,
  makeCanAction,
  computeAvgDevQuestions,
} from "@/lib/radar";
```

- [ ] **Step 2: Add `eq` to the drizzle-orm import**

Find:
```typescript
import { eq, inArray, and } from "drizzle-orm";
```

This should already have `eq`. If not, add it.

- [ ] **Step 3: Fetch dev questions in Batch 2**

Find the Batch 2 parallel queries (around line 51). Add a dev questions query alongside the existing ones:

Replace:
```typescript
const [allAssignments, driftUpdates, allStages] = orgReqIds.length
  ? await Promise.all([
      db
        .select({
          requestId: assignments.requestId,
          assigneeId: assignments.assigneeId,
        })
        .from(assignments)
        .where(and(inArray(assignments.requestId, orgReqIds), eq(assignments.role, "lead"))),
      db
        .select({
          requestId: figmaUpdates.requestId,
          postHandoff: figmaUpdates.postHandoff,
          devReviewed: figmaUpdates.devReviewed,
        })
        .from(figmaUpdates)
        .where(
          and(
            inArray(figmaUpdates.requestId, orgReqIds),
            eq(figmaUpdates.postHandoff, true),
            eq(figmaUpdates.devReviewed, false)
          )
        ),
      db
        .select({
          requestId: requestStages.requestId,
          stage: requestStages.stage,
          enteredAt: requestStages.enteredAt,
        })
        .from(requestStages)
```

With (add a 4th parallel query — keep the rest of the existing Batch 2 code intact):

Find the closing `)` of the Promise.all and add the dev questions query. The full Batch 2 block should become:

```typescript
const [allAssignments, driftUpdates, allStages, devQuestions] = orgReqIds.length
  ? await Promise.all([
      db
        .select({
          requestId: assignments.requestId,
          assigneeId: assignments.assigneeId,
        })
        .from(assignments)
        .where(and(inArray(assignments.requestId, orgReqIds), eq(assignments.role, "lead"))),
      db
        .select({
          requestId: figmaUpdates.requestId,
          postHandoff: figmaUpdates.postHandoff,
          devReviewed: figmaUpdates.devReviewed,
        })
        .from(figmaUpdates)
        .where(
          and(
            inArray(figmaUpdates.requestId, orgReqIds),
            eq(figmaUpdates.postHandoff, true),
            eq(figmaUpdates.devReviewed, false)
          )
        ),
      db
        .select({
          requestId: requestStages.requestId,
          stage: requestStages.stage,
          enteredAt: requestStages.enteredAt,
        })
        .from(requestStages)
        .where(inArray(requestStages.requestId, orgReqIds)),
      db
        .select({ requestId: comments.requestId })
        .from(comments)
        .where(
          and(
            inArray(comments.requestId, orgReqIds),
            eq(comments.isDevQuestion, true)
          )
        ),
    ])
  : [[], [], [], []];
```

**Note:** Read the full Batch 2 block in the file first, then make this edit precisely. The existing third query (requestStages) ends with `.where(inArray(requestStages.requestId, orgReqIds))`. Make sure that's preserved.

- [ ] **Step 4: Compute avg dev questions and pass to DesignerStatus**

Find where `designerRows` is built (it calls `buildDesignerRows`). After that line, add:

```typescript
const avgDevQuestionsMap = computeAvgDevQuestions(
  designerRows,
  allRequests,
  allAssignments,
  devQuestions,
);
```

Then find where `<DesignerStatus` is rendered in the JSX and add the new prop:

```tsx
<DesignerStatus
  designers={designerRows}
  canActionMap={canActionMap}
  avgDevQuestionsMap={avgDevQuestionsMap}
/>
```

- [ ] **Step 5: Verify TypeScript compiles**

```bash
cd ~/DesignQ2 && npx tsc --noEmit
```

Expected: TS errors about `avgDevQuestionsMap` prop not existing on DesignerStatus — these will be fixed in Task B5. If there are other errors, fix them now.

- [ ] **Step 6: Commit**

```bash
cd ~/DesignQ2 && git add app/\(dashboard\)/dashboard/radar/page.tsx
git commit -m "feat: fetch dev questions in radar page and compute avg per designer"
```

---

### Task B5: DesignerStatus component — show avg score

**Files:**
- Modify: `components/radar/designer-status.tsx`

- [ ] **Step 1: Add `avgDevQuestionsMap` prop to both components**

In `components/radar/designer-status.tsx`, update the `DesignerCard` component to show the avg score, and update `DesignerStatus` to accept and forward the map.

Replace the entire file:

```typescript
// components/radar/designer-status.tsx
"use client";

import { useState } from "react";
import type { RadarDesigner } from "@/lib/radar";

function formatStaleness(ms: number | null): string {
  if (ms === null) return "";
  const mins = Math.floor(ms / 60_000);
  const hours = Math.floor(ms / 3_600_000);
  const days = Math.floor(ms / 86_400_000);
  if (mins < 5) return "just now";
  if (hours < 1) return `${mins}m ago`;
  if (hours < 24) return `${hours}h ago`;
  return `${days}d ago`;
}

const STATUS_DOT: Record<string, string> = {
  "in-flow": "🟢",
  idle: "🟡",
  stuck: "🔴",
  blocked: "🔴",
  "no-work": "⚪",
};

function avgQualityColor(avg: number): string {
  if (avg <= 1) return "text-green-400";
  if (avg <= 3) return "text-yellow-400";
  return "text-red-400";
}

type ActionState = "idle" | "loading" | "done";

function DesignerCard({
  designer,
  canAct,
  avgDevQuestions,
}: {
  designer: RadarDesigner;
  canAct: boolean;
  avgDevQuestions: number;
}) {
  const [nudge, setNudge] = useState<ActionState>("idle");
  const [risk, setRisk] = useState<ActionState>("idle");

  async function handleNudge() {
    if (!designer.mostStalledRequestId || nudge !== "idle") return;
    setNudge("loading");
    try {
      const res = await fetch(`/api/requests/${designer.mostStalledRequestId}/nudge`, {
        method: "POST",
      });
      setNudge(res.ok ? "done" : "idle");
    } catch {
      setNudge("idle");
    }
  }

  async function handleMarkAtRisk() {
    if (!designer.mostStalledRequestId || risk !== "idle") return;
    setRisk("loading");
    try {
      const res = await fetch(`/api/requests/${designer.mostStalledRequestId}/toggle-blocked`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ currentStatus: designer.mostStalledRequestStatus }),
      });
      setRisk(res.ok ? "done" : "idle");
    } catch {
      setRisk("idle");
    }
  }

  const alreadyBlocked = designer.mostStalledRequestStatus === "blocked";

  return (
    <div className="flex items-start justify-between border border-zinc-800 rounded-xl px-5 py-3">
      <div className="flex-1 min-w-0">
        <p className="text-sm text-white">
          {STATUS_DOT[designer.status] ?? "⚪"} {designer.fullName}
        </p>
        <p className="text-xs text-zinc-500 mt-0.5">
          {designer.activeCount} active
          {designer.lastMovedMs !== null &&
            ` · last moved ${formatStaleness(designer.lastMovedMs)}`}
          {designer.status === "blocked" && designer.blockedTitle &&
            ` · BLOCKED · ${designer.blockedTitle}`}
        </p>
        {avgDevQuestions > 0 && (
          <p className={`text-[10px] mt-1 ${avgQualityColor(avgDevQuestions)}`}>
            {avgDevQuestions} avg dev {avgDevQuestions === 1 ? "question" : "questions"}/handoff (30d)
          </p>
        )}
      </div>
      {canAct && designer.mostStalledRequestId && (
        <div className="flex items-center gap-2 shrink-0 ml-4">
          <button
            onClick={handleNudge}
            disabled={nudge !== "idle"}
            className="text-xs text-zinc-400 border border-zinc-700 rounded px-2 py-1 hover:border-zinc-500 hover:text-zinc-200 disabled:opacity-50 transition-colors"
          >
            {nudge === "loading" ? "…" : nudge === "done" ? "Sent ✓" : "Nudge"}
          </button>
          <button
            onClick={handleMarkAtRisk}
            disabled={risk !== "idle" || alreadyBlocked}
            className="text-xs text-zinc-400 border border-zinc-700 rounded px-2 py-1 hover:border-zinc-500 hover:text-zinc-200 disabled:opacity-50 transition-colors"
          >
            {alreadyBlocked
              ? "Already blocked"
              : risk === "loading"
              ? "…"
              : risk === "done"
              ? "Marked ✓"
              : "Mark at-risk"}
          </button>
        </div>
      )}
    </div>
  );
}

export function DesignerStatus({
  designers,
  canActionMap,
  avgDevQuestionsMap,
}: {
  designers: RadarDesigner[];
  canActionMap: Record<string, boolean>;
  avgDevQuestionsMap: Record<string, number>;
}) {
  if (designers.length === 0) {
    return (
      <p className="text-sm text-zinc-600 border border-zinc-800/50 rounded-xl px-5 py-4">
        No designers in this org yet.
      </p>
    );
  }
  return (
    <div className="space-y-2">
      {designers.map((d) => (
        <DesignerCard
          key={d.id}
          designer={d}
          canAct={canActionMap[d.id] ?? false}
          avgDevQuestions={avgDevQuestionsMap[d.id] ?? 0}
        />
      ))}
    </div>
  );
}
```

- [ ] **Step 2: Verify TypeScript compiles**

```bash
cd ~/DesignQ2 && npx tsc --noEmit
```

Expected: No errors.

- [ ] **Step 3: Smoke test**

```bash
cd ~/DesignQ2 && npm run dev
```

Navigate to `/dashboard/radar`. Each designer card should still render. If any designer has dev questions (seeded data should have some), their card shows the avg in green/yellow/red below the active count line.

- [ ] **Step 4: Commit**

```bash
cd ~/DesignQ2 && git add components/radar/designer-status.tsx
git commit -m "feat: show avg dev questions per handoff on Radar designer cards"
```

---

## Subagent C: Figma Drift Email

*Start after Task 0 is committed. Runs in parallel with Subagents A and B.*

---

### Task C1: Figma drift email template

**Files:**
- Modify: `lib/email/templates.ts`

- [ ] **Step 1: Add `figmaDriftEmail` to `lib/email/templates.ts`**

Append to the end of `lib/email/templates.ts` (after the last export):

```typescript
export function figmaDriftEmail({
  recipientName,
  requestTitle,
  requestId,
  designerName,
  changeDescription,
}: {
  recipientName: string;
  requestTitle: string;
  requestId: string;
  designerName: string;
  changeDescription: string;
}): string {
  return layout(`
    <p style="margin:0 0 20px 0;font-size:20px;font-weight:600;color:#ffffff;">Design updated post-handoff</p>
    <p style="margin:0 0 24px 0;font-size:14px;color:#a1a1aa;line-height:1.6;">
      <strong style="color:#e4e4e7;">${designerName}</strong> updated the Figma file after handoff.
      Dev review required before continuing.
    </p>
    ${label("Request")}
    ${value(requestTitle)}
    ${label("What changed")}
    ${value(changeDescription)}
    <div style="background:#1c1c1f;border:1px solid #f59e0b22;border-radius:8px;padding:12px 16px;margin-bottom:20px;">
      <p style="margin:0;font-size:12px;color:#f59e0b;">⚠️ Review the Figma changes before continuing dev work</p>
    </div>
    ${button("Review in DesignQ", `${APP_URL}/dashboard/requests/${requestId}`)}
  `);
}
```

- [ ] **Step 2: Verify TypeScript compiles**

```bash
cd ~/DesignQ2 && npx tsc --noEmit
```

Expected: No errors.

- [ ] **Step 3: Commit**

```bash
cd ~/DesignQ2 && git add lib/email/templates.ts
git commit -m "feat: add figmaDriftEmail template"
```

---

### Task C2: sendFigmaDriftEmail helper

**Files:**
- Modify: `lib/email/index.ts`

- [ ] **Step 1: Add `sendFigmaDriftEmail` to `lib/email/index.ts`**

Append to the end of `lib/email/index.ts`:

```typescript
export async function sendFigmaDriftEmail({
  to,
  recipientName,
  requestTitle,
  requestId,
  designerName,
  changeDescription,
}: {
  to: string;
  recipientName: string;
  requestTitle: string;
  requestId: string;
  designerName: string;
  changeDescription: string;
}): Promise<void> {
  const { figmaDriftEmail } = await import("./templates");
  await sendEmail({
    to,
    subject: `Figma updated post-handoff — ${requestTitle}`,
    html: figmaDriftEmail({ recipientName, requestTitle, requestId, designerName, changeDescription }),
  });
}
```

- [ ] **Step 2: Verify TypeScript compiles**

```bash
cd ~/DesignQ2 && npx tsc --noEmit
```

Expected: No errors.

- [ ] **Step 3: Commit**

```bash
cd ~/DesignQ2 && git add lib/email/index.ts
git commit -m "feat: add sendFigmaDriftEmail helper"
```

---

### Task C3: Figma updates POST route + email trigger

The existing `app/api/requests/[id]/figma-updates/route.ts` only has a GET handler. We need a POST handler so designers can manually log a Figma update. The email fires from this handler when the request is in dev phase.

**Files:**
- Modify: `app/api/requests/[id]/figma-updates/route.ts`

- [ ] **Step 1: Add POST handler to the figma-updates route**

The file currently contains only a GET export. Append a POST export to the same file:

```typescript
// POST /api/requests/[id]/figma-updates — designer logs a Figma update
export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id: requestId } = await params;
  const { changeDescription } = await req.json();

  if (!changeDescription?.trim()) {
    return NextResponse.json({ error: "Change description required" }, { status: 400 });
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });

  const [profile] = await db.select().from(profiles).where(eq(profiles.id, user.id));
  if (!profile) return NextResponse.json({ error: "Profile not found" }, { status: 404 });

  const [request] = await db.select().from(requests).where(eq(requests.id, requestId));
  if (!request || request.orgId !== profile.orgId) {
    return NextResponse.json({ error: "Request not found" }, { status: 404 });
  }

  const isPostHandoff = request.phase === "dev";

  const [inserted] = await db
    .insert(figmaUpdates)
    .values({
      requestId,
      figmaFileUrl: request.figmaUrl ?? "",
      updatedById: user.id,
      changeDescription: changeDescription.trim(),
      requestPhase: (request.phase === "dev" ? "dev" : "design") as "dev" | "design",
      postHandoff: isPostHandoff,
    })
    .returning();

  // Send email to dev owner if this is a post-handoff update
  if (isPostHandoff && request.devOwnerId) {
    try {
      const [devOwner] = await db
        .select({ fullName: profiles.fullName, email: profiles.email })
        .from(profiles)
        .where(eq(profiles.id, request.devOwnerId));

      if (devOwner?.email) {
        const { sendFigmaDriftEmail } = await import("@/lib/email");
        await sendFigmaDriftEmail({
          to: devOwner.email,
          recipientName: devOwner.fullName ?? "Dev",
          requestTitle: request.title,
          requestId,
          designerName: profile.fullName ?? "Designer",
          changeDescription: changeDescription.trim(),
        });
      }
    } catch (err) {
      // Email failure is non-blocking
      console.error("[figma-updates] Email error:", err);
    }
  }

  return NextResponse.json({ update: inserted });
}
```

Also add the missing imports to the top of the file. The existing file imports `NextResponse, createClient, db, requests, profiles, figmaUpdates, eq, desc`. Check what's missing for the POST handler: we need `profiles` (already there) and to add `insert` capability. Check if `figmaUpdates` is already imported — it should be from `@/db/schema`. Add any missing ones.

The full updated top of the file should have these imports:

```typescript
import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { db } from "@/db";
import { requests, profiles, figmaUpdates } from "@/db/schema";
import { eq, desc } from "drizzle-orm";
```

These should already be present from the GET handler. If the POST needs additional imports (like `and`, `inArray`), add them.

- [ ] **Step 2: Check `profiles` has an `email` field**

Run:
```bash
cd ~/DesignQ2 && grep -n "email" db/schema/users.ts | head -5
```

Expected: a line like `email: text("email").notNull()`. If the field is named differently (e.g. `emailAddress`), update the POST handler to match.

- [ ] **Step 3: Verify TypeScript compiles**

```bash
cd ~/DesignQ2 && npx tsc --noEmit
```

Expected: No errors. If there are schema field errors (e.g. `requestPhase` not valid), check the `figma_updates` schema definition in `db/schema/figma_updates.ts` and adjust the field names to match exactly.

- [ ] **Step 4: Smoke test**

```bash
cd ~/DesignQ2 && npm run dev
```

Use curl or a REST client to test the POST:

```bash
# First get a valid session cookie by logging in, then:
curl -X POST http://localhost:3000/api/requests/<dev-phase-request-id>/figma-updates \
  -H "Content-Type: application/json" \
  -d '{"changeDescription": "Updated button colors"}' \
  -b "<your-session-cookie>"
```

Expected: `{ "update": { "id": "...", "postHandoff": true, ... } }`

Navigate to the request in dev phase — the Figma History section should show the new update with the amber post-handoff badge.

- [ ] **Step 5: Commit**

```bash
cd ~/DesignQ2 && git add app/api/requests/\[id\]/figma-updates/route.ts
git commit -m "feat: add POST handler to figma-updates route with drift email notification"
```

---

### Task C4: "Log Figma update" UI in FigmaHistory

**Files:**
- Modify: `components/requests/figma-history.tsx`

Read `components/requests/figma-history.tsx` first to understand the current structure.

The existing component fetches updates via GET on mount and shows them. We need to add a "Log update" form visible to designers (anyone who's not in dev phase role) when the request is in dev phase.

- [ ] **Step 1: Add props and log-update form**

Add a `canLogUpdate` prop to FigmaHistory. When `true`, show a "Log Figma update" button above the update list that expands into a textarea + submit.

Find the `Props` interface in `figma-history.tsx` and add:

```typescript
canLogUpdate?: boolean;
```

Find where `FigmaHistory` is called in `app/(dashboard)/dashboard/requests/[id]/page.tsx`:

```tsx
<FigmaHistory requestId={request.id} phase={request.phase as string} />
```

Replace with:

```tsx
<FigmaHistory
  requestId={request.id}
  phase={request.phase as string}
  canLogUpdate={
    request.phase === "dev" &&
    (profile.role === "designer" || profile.role === "lead")
  }
/>
```

- [ ] **Step 2: Add log-update UI to `components/requests/figma-history.tsx`**

Inside the component (after reading the file to understand its structure), add:

1. State at the top of the component:
```typescript
const [logOpen, setLogOpen] = useState(false);
const [logBody, setLogBody] = useState("");
const [logSubmitting, setLogSubmitting] = useState(false);
```

2. A submit function:
```typescript
async function submitUpdate() {
  if (!logBody.trim()) return;
  setLogSubmitting(true);
  try {
    await fetch(`/api/requests/${requestId}/figma-updates`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ changeDescription: logBody.trim() }),
    });
    setLogBody("");
    setLogOpen(false);
    // Re-fetch updates
    fetch(`/api/requests/${requestId}/figma-updates`)
      .then((r) => r.json())
      .then((data) => { if (data.updates) setUpdates(data.updates); });
  } catch {
    // silent fail
  } finally {
    setLogSubmitting(false);
  }
}
```

3. JSX for the log form — add before the updates list, only when `canLogUpdate`:
```tsx
{canLogUpdate && (
  <div className="mb-3">
    {!logOpen ? (
      <button
        onClick={() => setLogOpen(true)}
        className="text-xs text-zinc-500 hover:text-zinc-300 border border-zinc-800 hover:border-zinc-700 px-3 py-1.5 rounded-lg transition-colors"
      >
        + Log Figma update
      </button>
    ) : (
      <div className="space-y-2 border border-zinc-800 rounded-lg p-3">
        <textarea
          value={logBody}
          onChange={(e) => setLogBody(e.target.value)}
          placeholder="What changed in Figma? (e.g. Updated button colors, changed spacing on mobile)"
          rows={2}
          className="w-full text-xs bg-zinc-900 border border-zinc-700 rounded-lg px-3 py-2 text-zinc-200 placeholder:text-zinc-600 resize-none focus:outline-none focus:border-zinc-500"
        />
        <div className="flex gap-2">
          <button
            onClick={submitUpdate}
            disabled={logSubmitting || !logBody.trim()}
            className="text-xs bg-zinc-800 hover:bg-zinc-700 text-zinc-200 border border-zinc-700 px-3 py-1.5 rounded-lg transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
          >
            {logSubmitting ? "Logging…" : "Log update"}
          </button>
          <button
            onClick={() => { setLogOpen(false); setLogBody(""); }}
            className="text-xs text-zinc-600 hover:text-zinc-400 px-3 py-1.5 rounded-lg transition-colors"
          >
            Cancel
          </button>
        </div>
      </div>
    )}
  </div>
)}
```

- [ ] **Step 3: Verify TypeScript compiles**

```bash
cd ~/DesignQ2 && npx tsc --noEmit
```

Expected: No errors.

- [ ] **Step 4: Smoke test**

```bash
cd ~/DesignQ2 && npm run dev
```

Log in as a designer (`alex@acme-demo.io`). Navigate to a request in dev phase. The Figma section should show a "+ Log Figma update" button. Click it, enter a description, submit. The update should appear in the list immediately with the amber post-handoff badge.

- [ ] **Step 5: Commit**

```bash
cd ~/DesignQ2 && git add components/requests/figma-history.tsx app/\(dashboard\)/dashboard/requests/\[id\]/page.tsx
git commit -m "feat: add Log Figma Update UI with post-handoff email trigger"
```

---

## Post-merge verification

After all three subagents complete and branches are merged:

- [ ] Run `npx tsc --noEmit` — no errors
- [ ] Run `npm run build` — builds cleanly
- [ ] Smoke test: Open a request at `designStage === "handoff"` — HandoffBriefPanel appears and generates
- [ ] Smoke test: Advance request to dev phase — HandoffBriefPanel shows instantly (cached), "Ask designer a question" button visible
- [ ] Smoke test: Submit an "Ask designer" question — appears in Activity feed, dev questions badge shows in panel header
- [ ] Smoke test: Navigate to `/dashboard/radar` — designer cards render, avg dev questions score shown for any designer with dev-phase handoffs
- [ ] Smoke test: Log in as designer on a dev-phase request — "+ Log Figma update" button visible in Figma section, submit creates update with amber badge
