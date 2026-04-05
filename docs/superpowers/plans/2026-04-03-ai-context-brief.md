# AI Context Brief Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Show an AI-generated 5-section brief on every design-phase request detail page, generated lazily on first open and cached in DB.

**Architecture:** Server component checks DB for an existing brief — if found, renders immediately; if not, renders a client loader component that fires `POST /api/requests/[id]/context-brief` on mount, shows a skeleton, then hydrates. The API route generates via Claude Haiku and upserts to a new `request_context_briefs` table.

**Tech Stack:** Next.js 14 App Router, Drizzle ORM, Supabase Auth, Vercel AI SDK (`generateObject`), `@ai-sdk/anthropic`, Zod, Tailwind CSS

---

## File Map

| File | Action | Responsibility |
|------|--------|---------------|
| `db/schema/context_briefs.ts` | **Create** | Drizzle table definition for `request_context_briefs` |
| `db/schema/index.ts` | **Modify** | Export the new table |
| `lib/ai/context-brief.ts` | **Create** | `generateContextBrief()` — AI call + zod schema |
| `app/api/requests/[id]/context-brief/route.ts` | **Create** | POST: auth → generate → upsert → return |
| `components/requests/context-brief-panel.tsx` | **Create** | Client component: loader skeleton + renderer |
| `app/(dashboard)/dashboard/requests/[id]/page.tsx` | **Modify** | Query brief, render `<ContextBriefPanel>` after description |

---

## Task 1: DB Schema

**Files:**
- Create: `db/schema/context_briefs.ts`

- [ ] **Step 1: Create the schema file**

```typescript
// db/schema/context_briefs.ts
import { pgTable, uuid, text, timestamp, integer, jsonb } from "drizzle-orm/pg-core";
import { requests } from "./requests";

export const requestContextBriefs = pgTable("request_context_briefs", {
  id: uuid("id").primaryKey().defaultRandom(),
  requestId: uuid("request_id")
    .notNull()
    .unique()
    .references(() => requests.id, { onDelete: "cascade" }),

  // The 5 sections
  plainSummary: text("plain_summary").notNull(),
  relatedRequests: jsonb("related_requests")
    .$type<{ id: string; title: string; reason: string }[]>()
    .notNull()
    .default([]),
  keyConstraints: jsonb("key_constraints")
    .$type<string[]>()
    .notNull()
    .default([]),
  questionsToAsk: jsonb("questions_to_ask")
    .$type<string[]>()
    .notNull()
    .default([]),
  explorationDirections: jsonb("exploration_directions")
    .$type<string[]>()
    .notNull()
    .default([]),

  // Metadata
  aiModel: text("ai_model").notNull(),
  tokensUsed: integer("tokens_used"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export type RequestContextBrief = typeof requestContextBriefs.$inferSelect;
export type NewRequestContextBrief = typeof requestContextBriefs.$inferInsert;
```

- [ ] **Step 2: Export from schema index**

In `db/schema/index.ts`, add this line at the end:

```typescript
export * from "./context_briefs";
```

- [ ] **Step 3: Type-check**

```bash
cd /Users/yashkaushal/Lane && npx tsc --noEmit
```

Expected: no errors.

- [ ] **Step 4: Generate and push migration**

```bash
npm run db:generate && npm run db:push
```

Expected: Drizzle generates a migration and Supabase applies it. Confirm the `request_context_briefs` table appears in Supabase dashboard → Table Editor.

- [ ] **Step 5: Commit**

```bash
git add db/schema/context_briefs.ts db/schema/index.ts
git commit -m "feat: add request_context_briefs schema"
```

---

## Task 2: AI Function

**Files:**
- Create: `lib/ai/context-brief.ts`

- [ ] **Step 1: Create the AI function**

```typescript
// lib/ai/context-brief.ts
import { generateObject } from "ai";
import { anthropic } from "@ai-sdk/anthropic";
import { z } from "zod";

const contextBriefSchema = z.object({
  plainSummary: z
    .string()
    .describe(
      "2-3 sentences in plain language. Restate what the PM is asking for, stripping jargon. State the real user problem the design needs to solve."
    ),
  relatedRequests: z
    .array(
      z.object({
        id: z.string(),
        title: z.string(),
        reason: z
          .string()
          .describe("One sentence on why this past request is similar or relevant"),
      })
    )
    .describe(
      "Up to 3 past requests from the same org that solved a similar problem. Only include if genuinely similar — not just same product area."
    ),
  keyConstraints: z
    .array(z.string())
    .describe(
      "2-5 factual constraints the designer must work within. Extract from business context, deadline, and shaping notes. Examples: 'Must ship within 2 weeks', 'Cannot change the payment API', 'iOS only — no Android in this cycle'."
    ),
  questionsToAsk: z
    .array(z.string())
    .describe(
      "3-5 specific, actionable questions the designer should clarify with the PM before opening Figma. Generate from actual gaps in the request — not generic checklist questions."
    ),
  explorationDirections: z
    .array(z.string())
    .describe(
      "2-3 directional angles for the designer to explore. Not prescriptive — starting points for thinking, not final answers."
    ),
});

export type ContextBriefResult = z.infer<typeof contextBriefSchema>;

export async function generateContextBrief(input: {
  title: string;
  description: string;
  businessContext?: string | null;
  successMetrics?: string | null;
  deadlineAt?: string | null;
  requestType?: string | null;
  pastRequests: Array<{ id: string; title: string; description: string }>;
}): Promise<ContextBriefResult> {
  const pastBlock =
    input.pastRequests.length > 0
      ? `\nPAST REQUESTS IN THIS ORG (for related work detection):\n${input.pastRequests
          .map((r, i) => `${i + 1}. [${r.id}] "${r.title}" — ${r.description.slice(0, 120)}`)
          .join("\n")}\n`
      : "";

  const { object } = await generateObject({
    model: anthropic("claude-3-5-haiku-20241022"),
    schema: contextBriefSchema,
    prompt: `You are a senior design strategist preparing a context brief for a designer who is about to start working on a request. Your job is to translate the PM's language into what the designer actually needs to know.

---
TITLE: ${input.title}

DESCRIPTION:
${input.description}

${input.businessContext ? `BUSINESS CONTEXT:\n${input.businessContext}\n` : ""}
${input.successMetrics ? `SUCCESS METRICS:\n${input.successMetrics}\n` : ""}
${input.deadlineAt ? `DEADLINE: ${input.deadlineAt}\n` : ""}
${input.requestType ? `REQUEST TYPE: ${input.requestType}\n` : ""}
---
${pastBlock}
Produce a context brief that helps the designer start with confidence, not confusion. For relatedRequests, only include IDs from the provided list — never fabricate IDs.`,
  });

  return object;
}
```

- [ ] **Step 2: Type-check**

```bash
cd /Users/yashkaushal/Lane && npx tsc --noEmit
```

Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add lib/ai/context-brief.ts
git commit -m "feat: add generateContextBrief AI function"
```

---

## Task 3: API Route

**Files:**
- Create: `app/api/requests/[id]/context-brief/route.ts`

- [ ] **Step 1: Create the route directory and file**

```bash
mkdir -p /Users/yashkaushal/Lane/app/api/requests/\[id\]/context-brief
```

- [ ] **Step 2: Write the POST handler**

```typescript
// app/api/requests/[id]/context-brief/route.ts
import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { db } from "@/db";
import { requests, profiles, requestContextBriefs } from "@/db/schema";
import { eq, ne, and } from "drizzle-orm";
import { generateContextBrief } from "@/lib/ai/context-brief";

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

  // Return existing brief if already generated
  const [existing] = await db
    .select()
    .from(requestContextBriefs)
    .where(eq(requestContextBriefs.requestId, requestId));

  if (existing) {
    return NextResponse.json({ brief: existing });
  }

  try {
    // Fetch last 20 org requests (excluding this one) for related work detection
    const pastRequests = await db
      .select({ id: requests.id, title: requests.title, description: requests.description })
      .from(requests)
      .where(and(eq(requests.orgId, profile.orgId), ne(requests.id, requestId)))
      .orderBy(requests.createdAt)
      .limit(20);

    const result = await generateContextBrief({
      title: request.title,
      description: request.description,
      businessContext: request.businessContext,
      successMetrics: request.successMetrics,
      deadlineAt: request.deadlineAt?.toISOString() ?? null,
      requestType: request.requestType,
      pastRequests,
    });

    const [saved] = await db
      .insert(requestContextBriefs)
      .values({
        requestId,
        plainSummary: result.plainSummary,
        relatedRequests: result.relatedRequests,
        keyConstraints: result.keyConstraints,
        questionsToAsk: result.questionsToAsk,
        explorationDirections: result.explorationDirections,
        aiModel: "claude-3-5-haiku-20241022",
      })
      .returning();

    return NextResponse.json({ brief: saved });
  } catch (err) {
    console.error("[context-brief] AI error:", err);
    return NextResponse.json({ error: "Brief generation failed" }, { status: 500 });
  }
}
```

- [ ] **Step 3: Type-check**

```bash
cd /Users/yashkaushal/Lane && npx tsc --noEmit
```

Expected: no errors.

- [ ] **Step 4: Commit**

```bash
git add "app/api/requests/[id]/context-brief/route.ts"
git commit -m "feat: add context-brief API route"
```

---

## Task 4: Client Component

**Files:**
- Create: `components/requests/context-brief-panel.tsx`

- [ ] **Step 1: Create the component**

```typescript
// components/requests/context-brief-panel.tsx
"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import type { RequestContextBrief } from "@/db/schema";

type Props = {
  requestId: string;
  existingBrief: RequestContextBrief | null;
};

export function ContextBriefPanel({ requestId, existingBrief }: Props) {
  const [brief, setBrief] = useState<RequestContextBrief | null>(existingBrief);
  const [loading, setLoading] = useState(existingBrief === null);

  useEffect(() => {
    if (existingBrief !== null) return; // already have it, skip

    fetch(`/api/requests/${requestId}/context-brief`, { method: "POST" })
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
            AI Context Brief
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

  if (!brief) return null; // silent fail

  return (
    <section className="border border-zinc-800 rounded-xl overflow-hidden">
      <div className="px-5 py-3 border-b border-zinc-800 bg-zinc-900/50 flex items-center justify-between">
        <span className="text-xs font-medium text-zinc-400 uppercase tracking-wide">
          AI Context Brief
        </span>
        <span className="text-[10px] text-zinc-600 font-mono">{brief.aiModel}</span>
      </div>

      <div className="p-5 space-y-5">
        {/* What this actually means */}
        <div>
          <div className="text-[10px] text-zinc-600 uppercase tracking-wide mb-1.5">
            What this actually means
          </div>
          <p className="text-sm text-zinc-300 leading-relaxed">{brief.plainSummary}</p>
        </div>

        {/* Related past work */}
        {brief.relatedRequests.length > 0 && (
          <div>
            <div className="text-[10px] text-zinc-600 uppercase tracking-wide mb-2">
              Related past work
            </div>
            <div className="space-y-1.5">
              {brief.relatedRequests.map((r) => (
                <Link
                  key={r.id}
                  href={`/dashboard/requests/${r.id}`}
                  className="block text-xs border border-zinc-800 rounded-lg px-3 py-2 hover:border-zinc-700 transition-colors"
                >
                  <span className="text-zinc-300">{r.title}</span>
                  <span className="text-zinc-600 ml-2">{r.reason}</span>
                </Link>
              ))}
            </div>
          </div>
        )}

        {/* Key constraints */}
        {brief.keyConstraints.length > 0 && (
          <div>
            <div className="text-[10px] text-zinc-600 uppercase tracking-wide mb-2">
              Key constraints
            </div>
            <ul className="space-y-1.5">
              {brief.keyConstraints.map((c, i) => (
                <li key={i} className="text-xs text-zinc-400 flex gap-2">
                  <span className="text-orange-400 shrink-0">—</span>
                  {c}
                </li>
              ))}
            </ul>
          </div>
        )}

        {/* Questions to ask */}
        {brief.questionsToAsk.length > 0 && (
          <div>
            <div className="text-[10px] text-zinc-600 uppercase tracking-wide mb-2">
              Questions to ask before starting
            </div>
            <ul className="space-y-1.5">
              {brief.questionsToAsk.map((q, i) => (
                <li key={i} className="text-xs text-zinc-400 flex gap-2">
                  <span className="text-indigo-400 shrink-0">?</span>
                  {q}
                </li>
              ))}
            </ul>
          </div>
        )}

        {/* Exploration directions */}
        {brief.explorationDirections.length > 0 && (
          <div>
            <div className="text-[10px] text-zinc-600 uppercase tracking-wide mb-2">
              Exploration directions
            </div>
            <ul className="space-y-1.5">
              {brief.explorationDirections.map((d, i) => (
                <li key={i} className="text-xs text-zinc-400 flex gap-2">
                  <span className="text-emerald-400 shrink-0">→</span>
                  {d}
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

- [ ] **Step 2: Type-check**

```bash
cd /Users/yashkaushal/Lane && npx tsc --noEmit
```

Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add components/requests/context-brief-panel.tsx
git commit -m "feat: add ContextBriefPanel component"
```

---

## Task 5: Page Integration

**Files:**
- Modify: `app/(dashboard)/dashboard/requests/[id]/page.tsx`

- [ ] **Step 1: Add import at top of file**

In `app/(dashboard)/dashboard/requests/[id]/page.tsx`, add this import alongside the existing component imports (around line 8–19):

```typescript
import { ContextBriefPanel } from "@/components/requests/context-brief-panel";
```

- [ ] **Step 2: Add DB query for existing brief**

After the existing `aiAnalysis` query block (around line 125–134), add:

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

Also add `requestContextBriefs` to the import from `@/db/schema` at the top of the file (line 5):

```typescript
import { profiles, requests, comments, requestStages, requestAiAnalysis, requestContextBriefs } from "@/db/schema";
```

- [ ] **Step 3: Render the component**

In the main content column, find the `{request.successMetrics && ...}` block (around line 220–225) and insert the brief panel immediately after it:

```typescript
            {/* AI Context Brief — design phase only */}
            {request.phase === "design" && (
              <ContextBriefPanel
                requestId={request.id}
                existingBrief={existingBrief}
              />
            )}
```

- [ ] **Step 4: Type-check**

```bash
cd /Users/yashkaushal/Lane && npx tsc --noEmit
```

Expected: no errors.

- [ ] **Step 5: Build check**

```bash
npm run build
```

Expected: build succeeds with no type errors or missing module errors.

- [ ] **Step 6: Manual test — first open (brief not yet generated)**

```bash
npm run dev
```

1. Open a request that is in `phase = design` (or temporarily change one in Supabase dashboard to `phase = design`)
2. Confirm the "AI Context Brief" section appears after the description with a loading skeleton
3. After ~2 seconds, confirm all 5 sections appear with real content
4. Refresh the page — confirm the brief loads instantly (no skeleton, served from DB)

- [ ] **Step 7: Manual test — non-design phase**

Open a request in `phase = predesign`. Confirm no AI Context Brief section appears.

- [ ] **Step 8: Commit**

```bash
git add "app/(dashboard)/dashboard/requests/[id]/page.tsx"
git commit -m "feat: integrate AI Context Brief into request detail page"
```

---

## Done

All 5 tasks complete. The AI Context Brief feature is live:

- First open: skeleton → AI generates → 5 sections render
- Subsequent opens: instant (served from `request_context_briefs` table)
- Non-design phases: section is hidden
- AI failures: silent — page continues to work normally
