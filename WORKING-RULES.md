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
