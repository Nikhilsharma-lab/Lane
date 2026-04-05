# Figma Webhook — Production Activation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Activate the already-built Figma webhook end-to-end in production so live Figma file updates flow into Lane's activity feed.

**Architecture:** The webhook receiver (`/api/figma/webhook`) is fully built. This plan covers: generating the token, syncing the DB schema, wiring env vars in Vercel, and registering the webhook in Figma.

**Tech Stack:** Next.js 14, Supabase (Drizzle ORM), Vercel, Figma REST API

---

## Task 1: Generate a Secure Webhook Token

The token is the shared secret Figma uses to sign every webhook request. Lane verifies it on every incoming event.

**Files:** None — this is terminal-only

- [ ] **Step 1: Generate the token**

  Run this in your terminal:
  ```bash
  node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
  ```
  Expected output: a 64-character hex string like `a3f8...c2d1`

  **Copy this value. You'll need it in the next two tasks.**

---

## Task 2: Add Token to Local Environment

- [ ] **Step 1: Open `.env.local`** and add the line:
  ```
  FIGMA_WEBHOOK_TOKEN=<paste-your-64-char-token-here>
  ```

- [ ] **Step 2: Verify the dev server still starts**

  Run:
  ```bash
  npm run dev
  ```
  Expected: Server starts on `localhost:3000` with no errors.

  Stop the server (`Ctrl+C`) before continuing.

---

## Task 3: Push DB Schema to Supabase

The `figma_updates` table needs two columns that may not exist in production yet: `updated_by_id` (nullable) and `figma_user_handle`.

**Files:** None — schema is already correct in `db/schema/figma_updates.ts`

- [ ] **Step 1: Push schema**

  Run:
  ```bash
  npm run db:push
  ```
  Expected output: Drizzle prints each table it checked/updated. No errors.

  If prompted with "Are you sure?", type `y` and press Enter.

- [ ] **Step 2: Verify in Supabase Studio**

  Run:
  ```bash
  npm run db:studio
  ```
  Open the URL it prints (usually `https://local.drizzle.studio`).
  Navigate to `figma_updates` table.
  Confirm columns exist: `figma_user_handle`, `updated_by_id` (nullable).

  Close the studio tab when done.

---

## Task 4: Add Token to Vercel Environment Variables

- [ ] **Step 1: Open Vercel dashboard**

  Go to: `https://vercel.com/dashboard`
  Click your Lane project.

- [ ] **Step 2: Navigate to Environment Variables**

  Click **Settings** → **Environment Variables**

- [ ] **Step 3: Add the variable**

  | Field | Value |
  |---|---|
  | Name | `FIGMA_WEBHOOK_TOKEN` |
  | Value | `<your-64-char-token>` |
  | Environments | ✅ Production ✅ Preview ✅ Development |

  Click **Save**.

- [ ] **Step 4: Trigger a redeploy**

  Click **Deployments** tab → find the latest deployment → click the `...` menu → **Redeploy**.

  Wait for the deployment to go green (1-2 minutes).

---

## Task 5: Register the Webhook in Figma

- [ ] **Step 1: Get your production URL**

  It looks like: `https://design-q2.vercel.app` (check your Vercel dashboard → Domains tab).

- [ ] **Step 2: Open Figma Developer Console**

  Go to: `https://www.figma.com/developers/api`
  Log in with your Figma account.
  Click **Webhooks** in the left sidebar.

- [ ] **Step 3: Create webhook — FILE_UPDATE**

  Click **+ Create webhook** and fill in:

  | Field | Value |
  |---|---|
  | Event type | `FILE_UPDATE` |
  | Team | Your Figma team name |
  | Endpoint | `https://<your-vercel-url>/api/figma/webhook` |
  | Passcode | `<your-64-char-token>` (same as FIGMA_WEBHOOK_TOKEN) |

  Click **Save**.

- [ ] **Step 4: Create webhook — FILE_VERSION_UPDATE**

  Repeat Step 3 with event type `FILE_VERSION_UPDATE`. Same endpoint and passcode.

  This second event fires when a designer saves a named version (more reliable signal than FILE_UPDATE).

---

## Task 6: End-to-End Smoke Test

- [ ] **Step 1: Open any request in Lane** that has a Figma URL attached.

  The Figma URL must contain the `file_key` of a Figma file you control.

- [ ] **Step 2: Make a small change in Figma**

  Open the linked Figma file. Move any element slightly and press `Ctrl+S` (or `Cmd+S` on Mac). This triggers `FILE_UPDATE`.

- [ ] **Step 3: Check the activity feed in Lane**

  Reload the request detail page.
  Expected: A new activity entry like:
  ```
  🎨 <your-figma-handle> updated Figma — File updated
  ```

- [ ] **Step 4: Verify in Supabase**

  Run `npm run db:studio`, open `figma_updates` table.
  Expected: A new row with:
  - `request_id` = the request you opened
  - `figma_user_handle` = your Figma handle
  - `post_handoff` = `false` (if still in design phase) or `true` (if in dev/track phase)

- [ ] **Step 5: Test post-handoff alert**

  Move the same request to the **dev** phase (or use a request already in dev phase).
  Make another small change in its linked Figma file.
  Expected: Activity feed shows `⚠️ post-handoff update — dev review required`.

---

## Troubleshooting

**Webhook not firing:**
- Double-check the endpoint URL has no trailing slash
- Confirm the Figma file belongs to the same team the webhook was registered on
- Check Vercel Function logs: Vercel Dashboard → your project → **Functions** tab → filter by `/api/figma/webhook`

**Signature mismatch (401 in logs):**
- The passcode in Figma must exactly match `FIGMA_WEBHOOK_TOKEN` in Vercel
- Copy-paste carefully — no extra spaces

**No matching request found (matched: 0 in logs):**
- The request's `figma_url` field must contain the Figma file key
- Go to the request detail page and confirm the Figma URL is saved

**db:push fails:**
- Run `npm run db:generate` first, then `npm run db:push`
