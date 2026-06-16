# Invites & Membership — Design Spec

Plan-before-build for the most complex piece of Day 4. Read this, confirm the two open decisions at the
bottom, and it becomes the build prompt.

---

## Foundational decision: ONE workspace per user (MVP)

A user belongs to exactly one workspace. Multi-workspace (being on several teams + a switcher) is deferred
(it's on the CLAUDE.md ban list). This one constraint is what makes invites tractable — almost every messy
branch below collapses because of it.

It also fits the target: a person is on one design team. Multi-team (agencies, consultants) is a later market.

---

## Mechanism: email-bound invite, link delivery

- Owner/admin invites a teammate **by email**. The invite is **bound to that email**.
- The system creates an invite (token) and produces a **copy-able link**. The owner shares the link
  themselves (Slack/email/wherever). **No auto-email yet** — that's deferred (Resend, see DEFERRED.md).
- The link carries a token; **acceptance requires authenticating as the invited email**. Binding to the
  email means a forwarded or leaked link can't be used by the wrong person.

**Why not an open "anyone with the link joins" link:** less control, and for a B2B tool you're inviting
specific colleagues, not opening a public door. Email-bound is the right default. An open team-link can be
added later if a customer asks.

**Upgrade path (deferred):** auto-send the invite email (Resend), or use Supabase's built-in invite email.
Copy-link is genuinely fine for the first small beta teams.

---

## Who can invite

Owner and admin only (`workspace_members.role`). Regular members cannot invite in the MVP. This is a
*workspace-permission* gate, separate from the PM/Designer/Developer label — so it does not violate
"same view for everyone," which is about the functional role.

---

## Data model

**invites:** `id`, `org_id`, `email` (stored lowercased), `token` (long random, unguessable),
`invited_by` (profile id), `status` (`pending` | `accepted` | `revoked` | `expired`),
`expires_at` (created + 7 days), `created_at`, `accepted_at` (nullable).
- **Unique constraint:** at most one `pending` invite per (`org_id`, `email`) — prevents duplicates.

**workspace_members:** `user_id`, `org_id`, `role` (`owner` | `admin` | `member`). Invitees join as `member`.
The workspace creator is `owner`.

---

## Invite lifecycle

```
pending ──accept──▶ accepted   (terminal)
pending ──revoke──▶ revoked    (terminal)
pending ──7 days──▶ expired    (terminal)
```

---

## Every situation → defined behavior

| Situation | What happens |
|---|---|
| Owner invites a NEW email (no Lane account) | Create pending invite + link. Invitee opens link → signs up with that email → "Join {workspace}?" → joins as member. **No personal workspace is auto-created for them.** |
| Owner invites an email already a MEMBER of this workspace | Block: "Already a member." No invite created. |
| Owner invites an email with an existing PENDING invite here | Idempotent — no duplicate. Refresh the existing invite (reset 7-day expiry) and re-show its link. "Invite refreshed." |
| Invitee already has a Lane account, NOT in any workspace | Opens link (logs in as the invited email) → "Join {workspace}?" → joins. |
| Invitee already has an account AND is already in a workspace | **BLOCK** (multi-workspace deferred): "You're already in a workspace. Joining a second is coming soon." Invite stays `pending` so they can accept once multi-workspace ships. |
| Invitee opens link signed in as a DIFFERENT email than invited | Mismatch: "This invite is for alice@x.com. You're signed in as bob@y.com — log out and use the invited email." |
| Invitee opens link NOT signed in | Route to signup/login, pre-fill the invited email, then return to the "Join?" step. |
| Invitee clicks a link they've ALREADY accepted | Idempotent: send them to the board. "You're already in {workspace}." |
| Link is expired | "This invite has expired. Ask {inviter} for a new one." |
| Link was revoked | "This invite is no longer valid." |
| Owner revokes a pending invite | `status` → `revoked`; the link stops working. Owner/admin only. |

---

## Members page (what the owner sees)

- **Current members:** name, functional role label (PM/Designer/Developer), workspace role.
- **Pending invites:** email, sent date, expiry — each with **Copy link**, **Resend** (refresh expiry),
  **Revoke**.

---

## MVP vs deferred

**In MVP:** email-bound invite, copy-link delivery, the "Join?" accept flow, revoke/resend, the
one-workspace guard, and every situation in the table above.

**Deferred (→ DEFERRED.md):** auto-emailing the invite (Resend); multi-workspace membership + switcher;
open "team link"; choosing a role at invite time (MVP: all invitees join as `member`); hashing invite
tokens at rest (pre-launch hardening).

---

## Build order (gated) — becomes the prompt once you approve

1. **invites schema** (columns + the one-pending-per-email constraint) + **Members page**: list members,
   invite-by-email (create invite + copy link), revoke, resend.
2. **/invite/[token] accept flow** with every branch from the table.
3. **The one-workspace guard** — block the already-in-a-workspace case gracefully.
4. **RLS + cross-workspace verification** — the danger-day proof, with independent accounts.

---

## Two decisions to confirm before I write the build prompt

1. **Delivery: copy-link now, email later — agree?** Or do you want auto-email (Resend) in the MVP despite
   the added infra? (My recommendation: copy-link now.)
2. **The already-in-a-workspace case: block with "coming soon" — agree?** The only alternative is building
   multi-workspace now, which is banned/deferred and would blow the timeline. (My recommendation: block.)
