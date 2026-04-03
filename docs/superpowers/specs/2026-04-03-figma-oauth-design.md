# Figma OAuth — Design Spec

**Date:** 2026-04-03  
**Status:** Approved  
**Feature:** Figma integration via OAuth (replaces manual webhook approach)

---

## What We're Building

Replace the manual-webhook Figma sync (which requires per-team setup in Figma's dev console and doesn't scale) with an OAuth-based integration. A user clicks "Connect Figma" once, grants DesignQ access, and the app fetches Figma version history on-demand whenever a request with a Figma URL is opened.

---

## Scope

### In scope
- `figma_connections` DB table (one row per org)
- OAuth initiation route + callback route
- On-demand sync: fetch Figma file versions when request detail loads
- Inline "Connect Figma" prompt on request detail (when not connected)
- `/settings/integrations` UI shell (Figma card functional; Slack/Linear as coming-soon placeholders)
- Delete `app/api/figma/webhook/route.ts` (replaced)

### Out of scope (deferred)
- Scheduled polling / cron-based sync → see DEFERRED.md
- Token encryption at rest → see DEFERRED.md
- Full `/settings/integrations` hub (Slack, Linear live) → see DEFERRED.md

---

## Architecture

```
NEW
├─ db/schema/figma_connections.ts
├─ db/migrations/                           — generated via db:generate + db:push
├─ app/api/figma/oauth/connect/route.ts     — redirects to Figma OAuth
├─ app/api/figma/oauth/callback/route.ts    — exchanges code → stores token
├─ app/api/figma/oauth/disconnect/route.ts  — deletes figma_connections row
├─ app/(settings)/settings/integrations/page.tsx
└─ components/requests/figma-connect-prompt.tsx

MODIFIED
├─ components/requests/figma-history.tsx    — renders prompt when not connected
├─ app/(dashboard)/requests/[id]/page.tsx   — pass isConnected + run on-demand sync
└─ DEFERRED.md                              — add scheduled polling + token encryption

RETIRED
└─ app/api/figma/webhook/route.ts           — deleted

KEPT AS-IS
├─ lib/figma/webhook-handler.ts             — extractFileIdFromUrl + buildChangeDescription reused
├─ db/schema/figma_updates.ts
├─ GET /api/requests/[id]/figma-updates
└─ POST /api/requests/[id]/figma-updates/[updateId]/review
```

---

## Database Schema

```typescript
// db/schema/figma_connections.ts
export const figmaConnections = pgTable("figma_connections", {
  id: uuid("id").primaryKey().defaultRandom(),
  orgId: uuid("org_id")
    .notNull()
    .unique()                                  // one connection per org
    .references(() => organizations.id, { onDelete: "cascade" }),
  accessToken: text("access_token").notNull(), // plaintext for MVP — encrypt post-launch
  refreshToken: text("refresh_token"),         // nullable — Figma may not issue these
  scopes: text("scopes"),                      // e.g. "file_read"
  connectedById: uuid("connected_by_id")
    .references(() => profiles.id, { onDelete: "set null" }),
  expiresAt: timestamp("expires_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});
```

Reconnecting upserts the row (update token in place via `ON CONFLICT (org_id) DO UPDATE`).

---

## OAuth Flow

### Step 1 — Initiate
```
User clicks "Connect Figma"
→ GET /api/figma/oauth/connect
→ Generate state (random UUID)
→ Store state in cookie (httpOnly, 10-min expiry) for CSRF protection
→ Redirect to Figma OAuth:
   https://www.figma.com/oauth
     ?client_id=FIGMA_CLIENT_ID
     &redirect_uri=NEXT_PUBLIC_APP_URL/api/figma/oauth/callback
     &scope=file_read
     &state=<csrf_state>
     &response_type=code
```

### Step 2 — Callback
```
GET /api/figma/oauth/callback?code=xxx&state=xxx
→ Verify state matches cookie (reject if mismatch — CSRF)
→ POST https://www.figma.com/api/oauth/token
     code, client_id, client_secret, redirect_uri, grant_type=authorization_code
→ Receive { access_token, refresh_token?, expires_in?, scope }
→ Upsert into figma_connections (org_id from session)
→ Clear state cookie
→ Redirect to /settings/integrations?connected=true
```

### Step 3 — Disconnect
```
POST /api/figma/oauth/disconnect
→ Delete row from figma_connections WHERE org_id = current org
→ Redirect to /settings/integrations
```

### New env vars
```
FIGMA_CLIENT_ID=
FIGMA_CLIENT_SECRET=
# NEXT_PUBLIC_APP_URL already exists
```

Figma OAuth app must be registered at figma.com/developers with:
- Redirect URI: `<NEXT_PUBLIC_APP_URL>/api/figma/oauth/callback`
- Scope: `file_read`

---

## On-Demand Sync

Runs server-side when the request detail page loads.

```
Page server component:
  1. Read figma_connections WHERE org_id = current org
  2. If no connection → pass isConnected=false → show FigmaConnectPrompt
  3. If connected AND request.figmaUrl exists:
     a. Parse fileKey from figmaUrl using extractFileIdFromUrl()
     b. GET https://api.figma.com/v1/files/:fileKey/versions
        Authorization: Bearer <access_token>
     c. For each version returned:
        - Check if figma_updates row exists (match on request_id + figma_version_id)
        - If new → INSERT into figma_updates
          (reuse buildChangeDescription logic, set post_handoff flag)
     d. Silent failure: if Figma API errors → log, continue page load
  4. Pass isConnected=true → FigmaHistory renders updates as before
```

**Dedup key:** `(request_id, figma_version_id)` — same version never inserted twice.

**Silent failure rule:** Figma API errors (expired token, rate limit, network) must never crash the request detail page. Log the error server-side and render FigmaHistory with whatever data is already in the DB.

---

## UI

### Inline prompt (request detail — not connected)

Shown inside the FigmaHistory section when `isConnected=false` and `request.figmaUrl` exists:

```
┌────────────────────────────────────────────────────────┐
│  Connect Figma to track design updates                  │
│  See version history and post-handoff alerts            │
│                                    [Connect Figma →]    │
└────────────────────────────────────────────────────────┘
```

- Styled to DESIGN.md: `--bg-subtle` background, `--accent` button, Satoshi font
- Hidden if `request.figmaUrl` is null (no Figma file linked yet)

### `/settings/integrations` shell

```
Integrations

─── Figma ──────────────────────────────────────────────
  Track design file updates and post-handoff changes
  Status: ● Connected (by Yash · Apr 3)     [Disconnect]
       OR
  Status: ○ Not connected              [Connect Figma →]
────────────────────────────────────────────────────────

─── Slack ───────────────────────────────── Coming soon
─── Linear ──────────────────────────────── Coming soon
```

- Figma card: fully functional (connect / disconnect)
- Slack + Linear: placeholder cards, greyed out, "Coming soon" badge
- `?connected=true` query param shows a success toast on arrival from OAuth callback

---

## What Gets Deleted

`app/api/figma/webhook/route.ts` — deleted entirely. The webhook approach is replaced by OAuth. `lib/figma/webhook-handler.ts` is kept because `extractFileIdFromUrl` and `buildChangeDescription` are reused by the on-demand sync.

---

## Deferred

| Item | Reason |
|------|--------|
| Scheduled polling (cron) | On-demand is sufficient for MVP; cron adds infra overhead |
| Token encryption at rest | MVP acceptable; add AES encryption before first paying customers |
| Full integrations hub (Slack, Linear live) | UI shell ships now; live integrations are Month 2–3 |

---

## Environment Variables Summary

| Var | Purpose | When |
|-----|---------|------|
| `FIGMA_CLIENT_ID` | Figma OAuth app ID | Before building OAuth routes |
| `FIGMA_CLIENT_SECRET` | Figma OAuth app secret | Before building OAuth routes |
| `NEXT_PUBLIC_APP_URL` | Callback redirect URI base | Already exists |
