# DesignQ2 — Deferred Features & Future Build Log

---

## PRE-LAUNCH KILLER FEATURES (build before launch, in this order)

Agreed 2026-04-02. No hard deadline — launch when all 7 are done.

### Approach 3 — Speed + Visibility (build first)
- [x] **Speed Layer** — Cmd+K command palette, J/K navigation, Cmd+N quick capture, optimistic UI ✅ Built 2026-04-02
- [ ] **Design Radar** — live designer status (in flow/idle/blocked), phase heat map, risk panel, shipped this week
- [ ] **AI Context Brief** — auto-generated brief when designer opens a request (what PM means, related past work, constraints, questions to ask)

### Approach 1 — Make Design Visible (build second)
- [ ] **Handoff Intelligence** — AI handoff brief, Figma drift alert, handoff quality score per designer
- [ ] **Impact Intelligence** — prediction confidence score before betting, Design ROI by type, "what we learned" retrospective brief

### Approach 2 — AI Does the Work (build third)
- [ ] **Proactive Alerts** — AI-decided push alerts for Design Head (stalls, overdue sign-offs, blocked designers)
- [ ] **AI Pre-flight Check** — PM impact prediction rated by AI before submission, quality score before triage

---

Everything here was intentionally skipped during the current sprint.
Nothing here is abandoned — it's queued. Pick up items in priority order.

Last updated: April 1, 2026

---

## Priority 1 — Build Next (Month 1–2)

### Figma OAuth
**Status: IN PROGRESS** — spec written at `docs/superpowers/specs/2026-04-03-figma-oauth-design.md`

MVP ships on-demand sync (fetch on request detail load). The following are deferred:

#### Figma OAuth — Scheduled Polling
**Why deferred:** On-demand sync is sufficient for MVP. Cron adds infra overhead (job runner, failure handling, rate-limit management) with no clear customer ask yet.

**What to build when ready:**
- Cron job (via `vercel.json`) that runs every 15–30 min
- Iterates all orgs with a `figma_connections` row
- For each org: fetches versions for all requests with a `figmaUrl` in dev/design phase
- Inserts new versions into `figma_updates` (same dedup logic as on-demand)
- Secured via `CRON_SECRET` header

#### Figma OAuth — Token Encryption at Rest
**Why deferred:** Plaintext token is acceptable for pre-launch. Add before onboarding paying customers.

**What to build when ready:**
- Add `ENCRYPTION_KEY` env var (32-byte AES key)
- Encrypt `access_token` + `refresh_token` in `figma_connections` on write
- Decrypt on read before passing to Figma API calls
- One-time migration to encrypt existing rows

#### /settings/integrations — Full Hub (Slack, Linear live)
**Why deferred:** UI shell ships now (Figma functional + Slack/Linear as placeholders). Live integrations are Month 2–3.

**What to build when ready:**
- Slack: webhook URL per org, wire into assign/sign-off/handoff/shipped events
- Linear: OAuth, auto-create issue on handoff, sync status back

---

### Weekly Digest — Stored Per Org (Cron Pre-generation)
**Why deferred:** Current digest is on-demand (user clicks "Generate"). For the Friday auto-delivery vision, the cron needs to generate and store digests per org so they're pre-loaded when users open Insights on Monday.

**What to build:**
- Add `weekly_digests` table to DB: `id`, `org_id`, `week_start`, `digest_json`, `generated_at`
- Update `/api/insights/digest/generate/route.ts` to iterate all orgs, generate + store digest
- Update `/api/digest` GET to first check for a stored digest for current week, fall back to live generation
- DigestPanel: show "Generated Friday" timestamp when loading a stored digest

**Cron already configured** (`vercel.json` — every Friday 9am UTC):
```json
{ "path": "/api/insights/digest/generate", "schedule": "0 9 * * 5" }
```

**Env var needed:**
```
CRON_SECRET=   ← set in Vercel to secure the cron endpoint
```

---

## Priority 2 — Month 2–3

### Email Activation (not a build task — just env vars)
Code is fully built. Just needs 3 Vercel env vars:

```
RESEND_API_KEY=        ← sign up at resend.com (free, 3k/month)
EMAIL_FROM=            ← "DesignQ <notifications@yourdomain.com>" (domain verified in Resend)
                          OR use "onboarding@resend.dev" for testing without domain verification
NEXT_PUBLIC_APP_URL=   ← live Vercel URL e.g. https://designq2.vercel.app
```

Steps:
1. Sign up at resend.com → copy API key
2. Verify sending domain in Resend OR use `onboarding@resend.dev`
3. Add all 3 vars in Vercel → redeploy
4. Test by creating an invite — should receive email

---

### Slack Notifications
**Why deferred:** Low ROI for MVP. Zapier can bridge this initially.

**What to build when ready:**
- `SLACK_WEBHOOK_URL` env var (per org or global)
- `lib/slack/index.ts` — `sendSlack(text)` helper, silent no-op if key not set
- Wire into: assign route, validation sign-off, handoff, shipped
- Settings page: paste webhook URL per org

---

### Designer Performance Dashboard
**Why deferred:** PM calibration (built) covers the PM side. Designer side needs more data to be meaningful.

**What to build:**
- Per-designer view: avg cycle time, throughput per week, on-time rate, requests by type
- Trend charts (last 4 weeks)
- Compare designer against org average
- Surfaces in Team page or as sub-tab on Insights

---

## Priority 3 — Month 3–4

### Linear Integration (Native)
**Why deferred:** Zapier can bridge for MVP. Native integration is Month 3.

**What to build:**
- OAuth with Linear API
- On handoff: auto-create Linear issue with title, description, Figma link, assignee
- Sync status back: when Linear issue closes → mark DesignQ request as shipped
- `LINEAR_CLIENT_ID` + `LINEAR_CLIENT_SECRET` env vars

---

### Duplicate Detection (Embeddings-Based)
**Why deferred:** AI triage already flags potential duplicates via text matching. Embeddings-based is more accurate but requires vector storage.

**What to build:**
- Generate embeddings for each new request on creation (OpenAI `text-embedding-3-small` or Supabase pgvector)
- Cosine similarity search against existing request embeddings
- Threshold: surface anything above 0.85 similarity
- Show in triage results + at request creation time

---

### Figma Plugin
**Why deferred:** Web app link is sufficient for MVP. Plugin is a nice-to-have for power users.

**When to build:** Only if customers explicitly ask. Defer 6+ months.

---

### Auto-Comment in Figma
**Why deferred:** Low ROI. Figma's own notification system handles this.

---

### Version Comparison Tool (Figma Diff Viewer)
**Why deferred:** Too complex for MVP. Figma link is enough.

---

## Activation Checklist (things built but not yet live)

| Item | Status | What's needed |
|------|--------|---------------|
| Email notifications | Built ✅ | 3 Vercel env vars (see above) |
| Weekly digest cron | Cron configured ✅ | `CRON_SECRET` in Vercel + per-org storage (Priority 1) |
| Figma sync | UI built ✅ | Figma OAuth flow (Priority 1) |

---

## Notes

- **Figma webhook route** (`app/api/figma/webhook/route.ts`) is deleted as part of the OAuth build — replaced by on-demand sync.
- **`FIGMA_WEBHOOK_TOKEN`** env var was removed from the plan. Don't add it.
- Everything in this file has corresponding code stubs or downstream components already built — nothing starts from zero.
