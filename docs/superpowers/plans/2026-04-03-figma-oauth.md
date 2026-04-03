# Figma OAuth Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the manual-webhook Figma sync with OAuth so any DesignQ customer can connect Figma in one click, with version history fetched on-demand when a request is opened.

**Architecture:** A `figma_connections` table (one row per org) stores the OAuth access token. Three new API routes handle connect / callback / disconnect. On the request detail page (server component), if a connection exists and the request has a Figma URL, we call `lib/figma/sync.ts` to fetch new Figma file versions and insert them into the existing `figma_updates` table — which FigmaHistory already renders.

**Tech Stack:** Next.js 14 App Router, Drizzle ORM + Supabase PostgreSQL, Figma OAuth API (`https://api.figma.com/v1/oauth/token`), existing `figma_updates` table + `FigmaHistory` component

---

## File Map

| Action | File |
|--------|------|
| Create | `db/schema/figma_connections.ts` |
| Modify | `db/schema/index.ts` — add export |
| Create | `app/api/figma/oauth/connect/route.ts` |
| Create | `app/api/figma/oauth/callback/route.ts` |
| Create | `app/api/figma/oauth/disconnect/route.ts` |
| Create | `lib/figma/sync.ts` |
| Modify | `app/(dashboard)/dashboard/requests/[id]/page.tsx` — check connection, run sync, pass `isConnected` |
| Create | `components/requests/figma-connect-prompt.tsx` |
| Modify | `components/requests/figma-history.tsx` — accept `isConnected` prop |
| Create | `app/(settings)/settings/integrations/page.tsx` |
| Modify | `components/settings/settings-sidebar.tsx` — add Integrations nav link |
| Delete | `app/api/figma/webhook/route.ts` |

---

## Task 1: DB Schema — figma_connections table

**Files:**
- Create: `db/schema/figma_connections.ts`
- Modify: `db/schema/index.ts`

- [ ] **Step 1: Create the schema file**

```typescript
// db/schema/figma_connections.ts
import { pgTable, uuid, text, timestamp } from "drizzle-orm/pg-core";
import { organizations, profiles } from "./users";

export const figmaConnections = pgTable("figma_connections", {
  id: uuid("id").primaryKey().defaultRandom(),
  orgId: uuid("org_id")
    .notNull()
    .unique()
    .references(() => organizations.id, { onDelete: "cascade" }),
  accessToken: text("access_token").notNull(),
  refreshToken: text("refresh_token"),
  scopes: text("scopes"),
  connectedById: uuid("connected_by_id")
    .references(() => profiles.id, { onDelete: "set null" }),
  expiresAt: timestamp("expires_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

export type FigmaConnection = typeof figmaConnections.$inferSelect;
export type NewFigmaConnection = typeof figmaConnections.$inferInsert;
```

- [ ] **Step 2: Export from schema index**

In `db/schema/index.ts`, add this line after the existing exports:

```typescript
export * from "./figma_connections";
```

- [ ] **Step 3: Generate and push migration**

```bash
npm run db:generate
npm run db:push
```

Expected: new `figma_connections` table in Supabase.

- [ ] **Step 4: Commit**

```bash
git add db/schema/figma_connections.ts db/schema/index.ts
git commit -m "feat: add figma_connections schema (one row per org)"
```

---

## Task 2: OAuth Connect Route

**Files:**
- Create: `app/api/figma/oauth/connect/route.ts`

- [ ] **Step 1: Create the route**

```typescript
// app/api/figma/oauth/connect/route.ts
import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { randomUUID } from "crypto";

export async function GET() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.redirect("/login");

  const state = randomUUID();

  const params = new URLSearchParams({
    client_id: process.env.FIGMA_CLIENT_ID!,
    redirect_uri: `${process.env.NEXT_PUBLIC_APP_URL}/api/figma/oauth/callback`,
    scope: "file_read",
    state,
    response_type: "code",
  });

  const response = NextResponse.redirect(
    `https://www.figma.com/oauth?${params.toString()}`
  );

  response.cookies.set("figma_oauth_state", state, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    maxAge: 600, // 10 minutes
    path: "/",
  });

  return response;
}
```

- [ ] **Step 2: Add env vars to `.env.local`**

```
FIGMA_CLIENT_ID=<from figma.com/developers>
FIGMA_CLIENT_SECRET=<from figma.com/developers>
```

These must also be added to Vercel before deploying.

- [ ] **Step 3: Commit**

```bash
git add app/api/figma/oauth/connect/route.ts
git commit -m "feat: add Figma OAuth connect route"
```

---

## Task 3: OAuth Callback Route

**Files:**
- Create: `app/api/figma/oauth/callback/route.ts`

- [ ] **Step 1: Create the route**

```typescript
// app/api/figma/oauth/callback/route.ts
import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { db } from "@/db";
import { profiles, figmaConnections } from "@/db/schema";
import { eq } from "drizzle-orm";

export async function GET(req: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.redirect(new URL("/login", req.url));

  const { searchParams } = new URL(req.url);
  const code = searchParams.get("code");
  const state = searchParams.get("state");
  const storedState = req.cookies.get("figma_oauth_state")?.value;

  const clearState = (res: NextResponse) => {
    res.cookies.delete("figma_oauth_state");
    return res;
  };

  if (!code || !state || state !== storedState) {
    return clearState(
      NextResponse.redirect(new URL("/settings/integrations?error=oauth_failed", req.url))
    );
  }

  const [profile] = await db.select().from(profiles).where(eq(profiles.id, user.id));
  if (!profile) return NextResponse.redirect(new URL("/login", req.url));

  const tokenRes = await fetch("https://api.figma.com/v1/oauth/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: process.env.FIGMA_CLIENT_ID!,
      client_secret: process.env.FIGMA_CLIENT_SECRET!,
      redirect_uri: `${process.env.NEXT_PUBLIC_APP_URL}/api/figma/oauth/callback`,
      code,
      grant_type: "authorization_code",
    }),
  });

  if (!tokenRes.ok) {
    return clearState(
      NextResponse.redirect(new URL("/settings/integrations?error=token_exchange_failed", req.url))
    );
  }

  const tokenData = await tokenRes.json() as {
    access_token: string;
    refresh_token?: string;
    expires_in?: number;
    scope?: string;
  };

  const expiresAt = tokenData.expires_in
    ? new Date(Date.now() + tokenData.expires_in * 1000)
    : null;

  await db
    .insert(figmaConnections)
    .values({
      orgId: profile.orgId,
      accessToken: tokenData.access_token,
      refreshToken: tokenData.refresh_token ?? null,
      scopes: tokenData.scope ?? "file_read",
      connectedById: user.id,
      expiresAt,
    })
    .onConflictDoUpdate({
      target: figmaConnections.orgId,
      set: {
        accessToken: tokenData.access_token,
        refreshToken: tokenData.refresh_token ?? null,
        scopes: tokenData.scope ?? "file_read",
        connectedById: user.id,
        expiresAt,
        updatedAt: new Date(),
      },
    });

  return clearState(
    NextResponse.redirect(new URL("/settings/integrations?connected=true", req.url))
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add app/api/figma/oauth/callback/route.ts
git commit -m "feat: add Figma OAuth callback — exchange code, upsert token"
```

---

## Task 4: Disconnect Route

**Files:**
- Create: `app/api/figma/oauth/disconnect/route.ts`

- [ ] **Step 1: Create the route**

```typescript
// app/api/figma/oauth/disconnect/route.ts
import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { db } from "@/db";
import { profiles, figmaConnections } from "@/db/schema";
import { eq } from "drizzle-orm";

export async function POST(req: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const [profile] = await db.select().from(profiles).where(eq(profiles.id, user.id));
  if (!profile) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  await db.delete(figmaConnections).where(eq(figmaConnections.orgId, profile.orgId));

  return NextResponse.redirect(new URL("/settings/integrations", req.url));
}
```

- [ ] **Step 2: Commit**

```bash
git add app/api/figma/oauth/disconnect/route.ts
git commit -m "feat: add Figma OAuth disconnect route"
```

---

## Task 5: On-Demand Sync Logic

**Files:**
- Create: `lib/figma/sync.ts`

This file fetches Figma file versions and inserts new ones into `figma_updates`, deduped by `figmaVersionId`. All Figma API errors are caught silently — the caller (request detail page) always succeeds.

- [ ] **Step 1: Create sync.ts**

```typescript
// lib/figma/sync.ts
import { db } from "@/db";
import { figmaUpdates } from "@/db/schema";
import { eq } from "drizzle-orm";
import { extractFileIdFromUrl } from "./webhook-handler";

interface FigmaVersion {
  id: string;
  created_at: string;
  label: string | null;
  description: string | null;
  user?: { handle?: string };
}

interface SyncOptions {
  requestId: string;
  figmaUrl: string;
  accessToken: string;
  requestPhase: "design" | "dev" | null;
  postHandoff: boolean;
}

export async function syncFigmaVersions(opts: SyncOptions): Promise<void> {
  const { requestId, figmaUrl, accessToken, requestPhase, postHandoff } = opts;

  const fileKey = extractFileIdFromUrl(figmaUrl);
  if (!fileKey) return;

  let versions: FigmaVersion[];
  try {
    const res = await fetch(`https://api.figma.com/v1/files/${fileKey}/versions`, {
      headers: { Authorization: `Bearer ${accessToken}` },
      next: { revalidate: 0 }, // always fresh
    });
    if (!res.ok) return;
    const data = await res.json() as { versions?: FigmaVersion[] };
    versions = data.versions ?? [];
  } catch {
    return;
  }

  // Fetch existing version IDs for this request to dedup
  const existing = await db
    .select({ figmaVersionId: figmaUpdates.figmaVersionId })
    .from(figmaUpdates)
    .where(eq(figmaUpdates.requestId, requestId));

  const existingVersionIds = new Set(
    existing.map((r) => r.figmaVersionId).filter(Boolean)
  );

  const newVersions = versions.filter((v) => !existingVersionIds.has(v.id));
  if (!newVersions.length) return;

  for (const version of newVersions) {
    await db.insert(figmaUpdates).values({
      requestId,
      figmaFileId: fileKey,
      figmaFileUrl: `https://www.figma.com/design/${fileKey}`,
      figmaVersionId: version.id,
      figmaUserHandle: version.user?.handle ?? null,
      updatedAt: new Date(version.created_at),
      changeDescription: version.label
        ? `${version.label}${version.description ? ` — ${version.description}` : ""}`
        : (version.description ?? "File updated"),
      requestPhase,
      postHandoff,
      devReviewed: false,
    });
  }
}
```

- [ ] **Step 2: Commit**

```bash
git add lib/figma/sync.ts
git commit -m "feat: add on-demand Figma version sync"
```

---

## Task 6: Wire Sync into Request Detail Page

**Files:**
- Modify: `app/(dashboard)/dashboard/requests/[id]/page.tsx`

Add connection check + sync call after the existing auth block. Pass `isConnected` to `FigmaHistory`.

- [ ] **Step 1: Add imports**

In `app/(dashboard)/dashboard/requests/[id]/page.tsx`, add to the existing import from `@/db/schema`:

```typescript
import { profiles, requests, comments, requestStages, requestAiAnalysis, requestContextBriefs, projects, figmaConnections } from "@/db/schema";
```

Also add the sync import at the top:

```typescript
import { syncFigmaVersions } from "@/lib/figma/sync";
```

- [ ] **Step 2: Add connection check + sync after the existing `profile` query**

Find this block in the server component (around line 69–73):

```typescript
const [profile] = await db.select().from(profiles).where(eq(profiles.id, user.id));
if (!profile) redirect("/login");

const [request] = await db.select().from(requests).where(eq(requests.id, id));
if (!request || request.orgId !== profile.orgId) notFound();
```

Add after `notFound()`:

```typescript
// Figma connection check
let isConnected = false;
let figmaAccessToken: string | null = null;
try {
  const [conn] = await db
    .select()
    .from(figmaConnections)
    .where(eq(figmaConnections.orgId, profile.orgId));
  if (conn) {
    isConnected = true;
    figmaAccessToken = conn.accessToken;
  }
} catch {
  // silent
}

// On-demand Figma sync
if (
  isConnected &&
  figmaAccessToken &&
  request.figmaUrl &&
  (request.phase === "design" || request.phase === "dev" || request.phase === "track")
) {
  const requestPhase =
    request.phase === "design" ? "design"
    : request.phase === "dev" ? "dev"
    : null;
  const postHandoff =
    request.phase === "dev" ||
    request.phase === "track" ||
    !!request.figmaLockedAt;

  try {
    await syncFigmaVersions({
      requestId: request.id,
      figmaUrl: request.figmaUrl,
      accessToken: figmaAccessToken,
      requestPhase: requestPhase as "design" | "dev" | null,
      postHandoff,
    });
  } catch {
    // silent — page always loads
  }
}
```

- [ ] **Step 3: Pass isConnected to FigmaHistory**

Find this existing line in the JSX (around line 265–266):

```tsx
{request.figmaUrl && (request.phase === "design" || request.phase === "dev" || request.phase === "track") && (
  <FigmaHistory requestId={request.id} phase={request.phase as string} />
)}
```

Replace with:

```tsx
{(request.phase === "design" || request.phase === "dev" || request.phase === "track") && (
  <FigmaHistory requestId={request.id} phase={request.phase as string} isConnected={isConnected} figmaUrl={request.figmaUrl} />
)}
```

- [ ] **Step 4: Commit**

```bash
git add app/(dashboard)/dashboard/requests/[id]/page.tsx
git commit -m "feat: check Figma connection and run on-demand sync on request detail"
```

---

## Task 7: FigmaConnectPrompt Component

**Files:**
- Create: `components/requests/figma-connect-prompt.tsx`

- [ ] **Step 1: Create the component**

```tsx
// components/requests/figma-connect-prompt.tsx
export function FigmaConnectPrompt() {
  return (
    <div className="border border-zinc-800 rounded-lg px-4 py-3 bg-zinc-900/50">
      <p className="text-sm text-zinc-300 mb-0.5">Connect Figma to track design updates</p>
      <p className="text-xs text-zinc-500 mb-3">See version history and post-handoff alerts</p>
      <a
        href="/api/figma/oauth/connect"
        className="inline-flex items-center gap-1.5 text-xs bg-indigo-500/10 hover:bg-indigo-500/20 border border-indigo-500/20 text-indigo-400 px-3 py-1.5 rounded-lg transition-colors"
      >
        Connect Figma →
      </a>
    </div>
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add components/requests/figma-connect-prompt.tsx
git commit -m "feat: add FigmaConnectPrompt inline banner"
```

---

## Task 8: Update FigmaHistory to Accept isConnected

**Files:**
- Modify: `components/requests/figma-history.tsx`

- [ ] **Step 1: Update the Props interface**

Find:

```typescript
interface Props {
  requestId: string;
  phase: string;
}
```

Replace with:

```typescript
interface Props {
  requestId: string;
  phase: string;
  isConnected: boolean;
  figmaUrl: string | null;
}
```

- [ ] **Step 2: Import FigmaConnectPrompt and add early return**

Add at the top of the file (after `"use client";`):

```typescript
import { FigmaConnectPrompt } from "./figma-connect-prompt";
```

In the `FigmaHistory` function body, find the destructured props:

```typescript
export function FigmaHistory({ requestId, phase }: Props) {
```

Replace with:

```typescript
export function FigmaHistory({ requestId, phase, isConnected, figmaUrl }: Props) {
```

Update the `useEffect` to skip the fetch when not connected (avoids a wasted API call):

```typescript
useEffect(() => {
  if (isConnected) fetchUpdates();
  else setLoading(false);
}, [fetchUpdates, isConnected]);
```

Then add an early return just after the hooks (after the `useEffect` line, before the `const unreviewedPostHandoff` line):

```typescript
if (!isConnected && figmaUrl) {
  return <FigmaConnectPrompt />;
}

if (!figmaUrl) return null;
```

- [ ] **Step 3: Commit**

```bash
git add components/requests/figma-history.tsx components/requests/figma-connect-prompt.tsx
git commit -m "feat: show connect prompt in FigmaHistory when Figma not connected"
```

---

## Task 9: Settings Integrations Page

**Files:**
- Create: `app/(settings)/settings/integrations/page.tsx`

- [ ] **Step 1: Create the page**

```tsx
// app/(settings)/settings/integrations/page.tsx
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { db } from "@/db";
import { profiles, figmaConnections } from "@/db/schema";
import { eq } from "drizzle-orm";

export default async function IntegrationsPage({
  searchParams,
}: {
  searchParams: Promise<{ connected?: string; error?: string }>;
}) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const [profile] = await db.select().from(profiles).where(eq(profiles.id, user.id));
  if (!profile) redirect("/login");

  const [connection] = await db
    .select()
    .from(figmaConnections)
    .where(eq(figmaConnections.orgId, profile.orgId));

  const { connected, error } = await searchParams;

  let connectorName: string | null = null;
  if (connection?.connectedById) {
    const [connector] = await db
      .select({ fullName: profiles.fullName })
      .from(profiles)
      .where(eq(profiles.id, connection.connectedById));
    connectorName = connector?.fullName ?? null;
  }

  return (
    <div>
      <h1 className="text-xl font-semibold mb-1">Integrations</h1>
      <p className="text-sm text-zinc-500 mb-8">Connect your tools to DesignQ</p>

      {connected === "true" && (
        <div className="mb-6 bg-green-500/5 border border-green-500/20 rounded-lg px-4 py-3">
          <p className="text-sm text-green-400">Figma connected successfully</p>
        </div>
      )}
      {error && (
        <div className="mb-6 bg-red-500/5 border border-red-500/20 rounded-lg px-4 py-3">
          <p className="text-sm text-red-400">Connection failed — please try again</p>
        </div>
      )}

      <div className="space-y-3">
        {/* Figma — functional */}
        <div className="border border-zinc-800 rounded-xl p-5">
          <div className="flex items-start justify-between gap-4">
            <div>
              <h2 className="text-sm font-medium mb-0.5">Figma</h2>
              <p className="text-xs text-zinc-500 mb-1.5">
                Track design file updates and post-handoff changes
              </p>
              {connection && (
                <p className="text-xs text-zinc-600">
                  <span className="inline-block w-1.5 h-1.5 rounded-full bg-green-500 mr-1.5 align-middle" />
                  Connected{connectorName ? ` by ${connectorName}` : ""}{" · "}
                  {new Date(connection.createdAt).toLocaleDateString("en-US", {
                    month: "short",
                    day: "numeric",
                  })}
                </p>
              )}
            </div>
            {connection ? (
              <form action="/api/figma/oauth/disconnect" method="POST">
                <button
                  type="submit"
                  className="text-xs text-zinc-500 hover:text-red-400 border border-zinc-800 hover:border-red-500/20 px-3 py-1.5 rounded-lg transition-colors"
                >
                  Disconnect
                </button>
              </form>
            ) : (
              <a
                href="/api/figma/oauth/connect"
                className="text-xs bg-indigo-500/10 hover:bg-indigo-500/20 border border-indigo-500/20 text-indigo-400 px-3 py-1.5 rounded-lg transition-colors"
              >
                Connect Figma
              </a>
            )}
          </div>
        </div>

        {/* Slack — coming soon */}
        <div className="border border-zinc-800/50 rounded-xl p-5 opacity-50">
          <div className="flex items-start justify-between gap-4">
            <div>
              <div className="flex items-center gap-2 mb-0.5">
                <h2 className="text-sm font-medium">Slack</h2>
                <span className="text-[10px] bg-zinc-800 text-zinc-500 px-1.5 py-0.5 rounded">
                  Coming soon
                </span>
              </div>
              <p className="text-xs text-zinc-500">
                Get notifications in Slack for sign-offs, handoffs, and alerts
              </p>
            </div>
          </div>
        </div>

        {/* Linear — coming soon */}
        <div className="border border-zinc-800/50 rounded-xl p-5 opacity-50">
          <div className="flex items-start justify-between gap-4">
            <div>
              <div className="flex items-center gap-2 mb-0.5">
                <h2 className="text-sm font-medium">Linear</h2>
                <span className="text-[10px] bg-zinc-800 text-zinc-500 px-1.5 py-0.5 rounded">
                  Coming soon
                </span>
              </div>
              <p className="text-xs text-zinc-500">
                Auto-create Linear issues on handoff and sync status back
              </p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add app/(settings)/settings/integrations/page.tsx
git commit -m "feat: add /settings/integrations page (Figma functional, Slack/Linear shell)"
```

---

## Task 10: Add Integrations Link to Settings Sidebar

**Files:**
- Modify: `components/settings/settings-sidebar.tsx`

- [ ] **Step 1: Add Integrations to BASE_NAV**

Find:

```typescript
const BASE_NAV = [
  { href: "/settings/account", label: "Account" },
  { href: "/settings/workspace", label: "Workspace" },
  { href: "/settings/members", label: "Members" },
  { href: "/settings/projects", label: "Projects" },
];
```

Replace with:

```typescript
const BASE_NAV = [
  { href: "/settings/account", label: "Account" },
  { href: "/settings/workspace", label: "Workspace" },
  { href: "/settings/members", label: "Members" },
  { href: "/settings/projects", label: "Projects" },
  { href: "/settings/integrations", label: "Integrations" },
];
```

- [ ] **Step 2: Commit**

```bash
git add components/settings/settings-sidebar.tsx
git commit -m "feat: add Integrations link to settings sidebar"
```

---

## Task 11: Delete Webhook Route

**Files:**
- Delete: `app/api/figma/webhook/route.ts`

- [ ] **Step 1: Delete the file**

```bash
rm app/api/figma/webhook/route.ts
```

Note: `lib/figma/webhook-handler.ts` is kept — `extractFileIdFromUrl` is used by `lib/figma/sync.ts`.

- [ ] **Step 2: Commit**

```bash
git add -A
git commit -m "chore: remove webhook route (replaced by OAuth on-demand sync)"
```

---

## Task 12: Type-check and Build Verify

- [ ] **Step 1: Run TypeScript check**

```bash
npx tsc --noEmit
```

Expected: no errors. If errors appear, they will be in the modified files — fix type mismatches in the flagged lines.

- [ ] **Step 2: Run build**

```bash
npm run build
```

Expected: build completes successfully.

- [ ] **Step 3: Commit if any fixes were needed**

```bash
git add -A
git commit -m "fix: address type errors from Figma OAuth integration"
```

---

## Manual Verification Checklist

Before calling this done, verify these flows manually in the browser:

1. **Not connected + request with figmaUrl:** Open any request in design/dev phase — should see "Connect Figma to track design updates" banner
2. **Not connected + request without figmaUrl:** FigmaHistory section should be hidden entirely
3. **Connect flow:** Click "Connect Figma →" → Figma OAuth page → authorize → redirect back to `/settings/integrations?connected=true` → green success banner
4. **Connected state:** `/settings/integrations` shows "● Connected by [name] · [date]" + Disconnect button
5. **Sync on request open:** After connecting, open a request with a Figma URL — `figma_updates` rows should appear (check Supabase table viewer)
6. **Disconnect:** Click Disconnect → row deleted → page shows "Connect Figma" button again
7. **CSRF protection:** Navigating directly to `/api/figma/oauth/callback?code=x&state=wrong` should redirect to error page
