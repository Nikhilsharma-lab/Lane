# WORKING-RULES.md — standing process rules

Rules that govern how work is designed and tracked. These supplement CLAUDE.md's working rules
with process discipline learned from real failures.

---

## PLANE-FIRST

No feature designed or built — however small — without first confirming the approach against
Plane's actual code (`makeplane/plane`) via a Claude Code recon.

**The sequence is:**
1. Read Plane's implementation (models, views, frontend) for the feature area.
2. Map Plane's grammar onto Lane's nouns and thesis.
3. Adopt what fits, simplify what's over-built for Lane's scale, and **refuse** Plane's
   surveillance machinery (watch-all-activity, utilization tracking, activity heatmaps).
4. Only then design and build.

No from-scratch design. No theory-first design. Plane is the authority on project-management
grammar; Lane's thesis decides what to keep and what to refuse.

**Why this rule exists:** The notification system (increments 1–2a) was designed from standard
patterns instead of reading Plane first. The post-hoc recon revealed no critical misses, but
that was luck — the rule prevents a future feature from shipping with a fundamentally wrong
shape because we didn't look at the reference implementation.

---

## DEFERRAL-TRACKING

Every deferred item is written to `DEFERRED.md` immediately — not held in chat, not mentioned
verbally and forgotten.

**Each entry must include:**
- **What** — the specific feature, fix, or decision being deferred
- **Why** — why it's deferred now (Lane simpler, not needed at MVP scale, thesis refusal, etc.)
- **Plane ref** — if the item maps to a Plane concept, name it (model, view, component)
- **Revisit trigger** — the concrete event or condition that makes this item active again

No verbal-only deferrals. If it's worth mentioning as "we'll do this later," it's worth a line
in DEFERRED.md. Items without a trigger rot — every entry gets one.

**Why this rule exists:** Deferred items from daily reviews and recons lived only in chat context
and were lost across sessions. DEFERRED.md existed but wasn't used consistently as the single
source of truth for what's been intentionally postponed.

---

## RECON-QUOTE

Any recon or summary that asserts a rule ("banned per CLAUDE.md", "required by spec §X",
"Plane does Y") must back it with a verbatim quote + file:line reference. Never paraphrase a
source as if it were a quoted rule; never state an inference about what a source says as fact.
If it isn't quoted, it's an inference — label it one.

**Any claim that gates a build or a refusal must be verified against the actual source before
it's acted on.**

**Why this rule exists:** The polish recon (2025-06-20) stated "Detail-page peek/modal modes —
banned per CLAUDE.md" in a refuse list. CLAUDE.md contains no such ban — the claim was an
inference from the MVP screen whitelist, presented as a quoted rule. The error would have
permanently closed a deferral (the notification inbox-pane form, which depends on peek) that
is actually ungated. Fabricated authority closes doors that should stay open.

---

## SESSION-HYGIENE (clean-tree gate)

At the start of any work session — whether in this track's prompts or a parallel Claude Code
session — run `git status` and verify a clean tree before making new edits. If uncommitted or
untracked WIP exists, secure it first (commit to a dedicated branch or stash) and identify what
it is. Never start new work on top of unexplained uncommitted changes.

A session must not end leaving uncommitted work in the working tree.

**Why this rule exists:** A parallel design session (impeccable skill) left a 687-line intake
rework and an untracked PickUpButton in the working tree. A subsequent polish commit
accidentally included the reworked `page.tsx`, which imported the untracked file — Vercel
deployed, failed, and the contaminated commit had to be reverted. The root cause was starting
new edits in a dirty tree without first identifying and securing the existing WIP.
