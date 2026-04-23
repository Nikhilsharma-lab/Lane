# Lane — Working Rules for AI Sessions

These rules were developed across the April 14-16, 2026 sessions. They exist because every rule here was learned the hard way — a bug was missed, time was wasted, or a commitment was forgotten because the rule wasn't followed. Any Claude instance working on Lane should follow these.

## Source of truth
- `docs/ROADMAP.md` is the source of truth for what to build next. Every session starts by reading the "Next session" pointer.
- `CLAUDE.md` is the source of truth for vocabulary, architecture, and product philosophy. When in doubt, CLAUDE.md wins.
- `docs/nav-spec.md` and `docs/onboarding-spec.md` are the sources of truth for their respective features.
- This chat is where we think. The files are where decisions live.

## Verify before acting
- Never trust documentation claims about what's "already built." Grep the codebase to confirm.
- Never trust CLAUDE.md's description of how a feature works. Read the actual code.
- Before writing any fix, grep for the full scope of what needs changing. The first grep always misses something.
- Run `npx tsc --noEmit` after every code change. TypeScript catches what grep misses.
- After every rename or refactor, run a verification grep to confirm zero stale references remain.
- **Success signals are not proof of effect.** A command exiting 0, a
  spinner showing "complete", a flag labeled "minor" — none of these
  prove the work achieved its goal. Verify the end state independently,
  not the return code. Examples:
  - Commands succeeding without doing what was intended — always verify
    the outcome against what you actually wanted, not against the tool's
    own success message.
  - `drizzle-kit migrate` exits 0 and prints "migrations applied
    successfully!" even when zero migrations were applied (silent skip
    via journal `when` timestamp comparison). Post-apply DB state
    verification is required, not optional.
  - "Minor, not blocking" flags dismissed without verification have
    caused real bugs (April 22 timestamp-inversion finding). Verify
    first; downgrade to "not blocking" only after verification.
  - Count-based verification can false-positive when a column name
    appears on multiple tables or pre-exists on the target. Use
    `(table_name, column_name)` pair matching, not `IN (list)` counts.

### Blocker-gated cleanup before spine work

Before starting any spine item (a checklist entry on the active
roadmap), walk the full parking lot and classify each entry as
blocker / partial-blocker / non-blocker against that specific
spine item. A blocker is something that, left unfixed, will cause
the spine item to fail, produce wrong results, or be un-verifiable.
A partial-blocker is a multi-faceted item where some facets block
the spine item and others don't.

Rules:
- Fix all full blockers completely before starting the spine item.
- Fix partial blockers completely too — not just the slice that
  unblocks the current item. Partial fixes create re-discovery
  overhead for every future spine item that hits the same parking
  lot entry.
- Non-blockers stay parked until they become blockers for a later
  item.
- Classification is investigation, not pattern-matching. Don't
  dismiss items as non-blocking based on surface read ("drift is
  bad → fix now"); verify the specific block condition ("does
  Date.now() today exceed prev_max? — yes → no block").
- Docs updates for each cleared or newly discovered parking-lot
  entry land within the same session, bundled per the docs-update
  granularity rule under ## Commit discipline.

Rule established 2026-04-22 after the B1 session's 74-item parking
lot made ad-hoc triage infeasible. Review cadence: re-read at end
of week 4 and adjust if parking lot items are being discovered
faster than they resolve (indicator of under-classification).

### Column-name verification before raw SQL composition

Raw SQL (migrations, RPCs, pg-tap tests, ad-hoc probes) must
reference tables and columns by their SQL identifiers, not by
Drizzle field/var names. The two often match (e.g., `profiles.id`),
but diverge in three known instances where Lane uses a
different Drizzle alias than the SQL table/column name:

- workspaces (Drizzle) = organizations (SQL table)
- teams (Drizzle) = projects (SQL table)
- teamMemberships (Drizzle) = project_members (SQL table)
- Columns: project_members.teamId (Drizzle) = project_id (SQL)

Before composing raw SQL that references any table listed above
(or any table where the author is unsure), query information_schema
for the authoritative identifier reference:

  SELECT table_name, column_name, data_type
  FROM information_schema.columns
  WHERE table_schema = 'public' AND table_name IN (...);

Compose SQL against the probe output, not against the Drizzle
schema file. Information_schema reflects the live database state;
Drizzle schema files reflect author intent, which can drift from
the live state between edit-and-generate or between regenerate
cycles.

Observed in: B2 PART 3 (author wrote `project_members (team_id, ...)`
based on the Drizzle field; caught pre-append by manual re-check;
would have failed at test time with "column team_id does not
exist"). Subsequently adopted pre-emptively in B2 PART 5 as
step 5a; caught nothing because the discipline prevented the class.

Rule established 2026-04-23 after two B2 encounters with the same
class of bug.

## Commit discipline
- Claude Code does NOT commit. Every commit is manual after human review.
- Read the full `git diff` before committing. Don't skim.
- One logical change per commit. Don't bundle unrelated fixes.
- Commit messages describe what changed AND why (reference the roadmap item or bug).
- Don't push until the end of the session or until a logical block of work is complete.
- **Fetch before committing mid-session if a collaborator might have
  pushed.** Observed recurrences April 19 (rebase pipeline) and
  April 21 (bootstrap integration). `git fetch origin` is cheap;
  discovering the collision after staging is not. If the local and
  remote branches have diverged, stop and handle as an integration
  scenario — do not rebase or merge without explicit direction.

### Docs-update granularity

Every code change that touches parking-lot state (resolves entry,
adds entry, discovers bug/pattern worth logging) triggers doc
updates within the same session. Granularity: option (b) from the
2026-04-22 decision — code commits land individually, related doc
updates bundle into a session-end docs commit covering all doc
impact from the session.

At session-end, check each of these for applicability and update
any that are affected by the session's changes:
- ROADMAP.md parking lot: strike through resolved entries (with
  resolution commit SHA + one-line explanation), add new entries,
  update active-items count.
- ROADMAP.md checklist: flip [ ] → [x] for completed spine items
  (with actual hours + commit SHA chain).
- Next session pointer (if spine progress changes what's next).
- CLAUDE.md: update Parts 6 (data model), 15 (commands), 16 (what's
  built), 18 (what's not being built) when the code change affects
  any of these.
- WORKING-RULES.md: add any new discipline rule discovered.
- Relevant spec files: patch specs in the same session as code
  that reveals spec bugs or shifts spec scope. Do not commit code
  without the spec patch, or the next reader inherits the bug.
- CHANGELOG.md: add entry if the change is user-visible.

Applicability is not optional — each item requires a deliberate
check, not "I'll remember if it applied." The session-end docs
commit is never deferred to "a future cleanup session." Deferring
is how stored-claims drift enters the record.

## Stop-point discipline
- Claude Code prompts include explicit STOP points between steps.
- At each stop, Claude Code shows the diff and waits for "continue."
- Never let Claude Code run multiple steps without review between them.
- If Claude Code skips a step or "defers" something that was in the prompt, call it out immediately.

## Lock commitments immediately
- When a decision is made to do something later, add it to `docs/ROADMAP.md` immediately — not "at the end of the session."
- Parking lot items go in the parking lot section of the roadmap the moment they're identified.
- The "Next session" pointer gets updated before the session ends, every time.

## AI file fixes (Anthropic structured output)
- Zod 4 `.int()` emits safe-integer bounds that Anthropic rejects (vercel/ai#13355).
- Pattern: drop `.int().min().max()` from schema → prepend range info to `.describe()` → add runtime Math.round + clamp after generateObject returns → spread return to preserve other fields.
- Array constraints: drop `.min().max()` → add `.describe()` with count guidance → truncate if too long, throw if too short.
- Runtime clamps are insurance, not patches. The model usually returns clean values.

## Claude Code environment quirk
- Claude Code's host shell exports `ANTHROPIC_BASE_URL=https://api.anthropic.com` (missing `/v1`) and overrides `ANTHROPIC_API_KEY`.
- Any tsx/node scripts that hit Anthropic need: `unset ANTHROPIC_API_KEY ANTHROPIC_BASE_URL &&` prefixed before the command.

## Architecture facts (discovered April 14-16)
- Sidebar rendering: `components/shell/sidebar.tsx` (NOT `components/nav/`)
- Nav logic: `components/nav/team-section.tsx` for team sections, `lib/nav/` for keys and order
- Hotkeys: `components/shell/hotkeys-provider.tsx`
- Request detail: DetailDock side panel (`?dock={id}` URL param), NOT a dedicated `[id]/page.tsx` route
- AI features: all 8 in `lib/ai/`, all verified working against `claude-haiku-4-5-20251001`
- Database: two Supabase projects — `lane dev` (local) and `lane app` (production); see "Supabase connection strings" section below for connection-string details

## Vocabulary lock (from CLAUDE.md)
- Request (never Stream, Ticket, Issue)
- Predesign, Design, Build, Track (the four phases)
- Sense, Frame, Diverge, Converge, Prove (the five design stages)
- Intake (where Requests land)
- Prove (the three-sign-off quality gate, NOT "Validation gate")
- Commitments (cycle-committed work)
- Ideas (upstream pool)
- Rationale (per-direction thinking in Diverge stage, renamed from "Reflection field")
- Reflection — vocabulary preserved but feature deferred to post-v1

## Production status (as of April 16, 2026)
- ANTHROPIC_API_KEY in Vercel returns 401 — needs diagnosis
- Database connection pool exhaustion on multiple endpoints — needs diagnosis
- Both are blockers for real customer use but NOT for local dev work

## Supabase connection strings

Lane uses two Supabase projects for application data:
- `lane dev` (`<lane-dev-ref>`) for local development
- `lane app` (`<lane-app-ref>`) for production

Local dev uses two env vars for the `lane dev` project:

- `DATABASE_URL` — used by app code for runtime queries (Drizzle ORM, Supabase JS). `{ prepare: false }` is required in every `postgres()` call that reads this URL when pointed at a transaction pooler (port 6543).
- `DIRECT_DATABASE_URL` — used by Drizzle Kit migrations, pg-tap tests, and any code that calls `set_config(..., false)` or uses prepared statements directly. This URL must point at a session-mode pooler (port 5432) or a direct Postgres connection. `drizzle.config.ts` and `db/user.ts` fall back to `DATABASE_URL` if `DIRECT_DATABASE_URL` is unset (`process.env.DIRECT_DATABASE_URL ?? process.env.DATABASE_URL!`).

Current workaround (April 19, 2026): both `DATABASE_URL` and `DIRECT_DATABASE_URL` point at the session pooler on port 5432. The transaction pooler on port 6543 rejects auth for `lane dev` for unknown reasons. See ROADMAP parking lot for investigation trigger. When fixed, only `DATABASE_URL` needs to change — `DIRECT_DATABASE_URL` already points at the right place.

**Production rule:** `lane app` DATABASE_URL lives only in Vercel environment variables. It is never copied to `.env.local`, never pasted in chats, never stored in password managers alongside dev credentials. If production DATABASE_URL ever needs to be seen, it is looked up through the Vercel UI and treated as a security event. Nikhil should not know the production DB password from memory.

**After `vercel env pull`:** the pull can overwrite manually-set `DIRECT_DATABASE_URL`. Re-add it after every pull. Consider this a known friction until Vercel supports ignore-patterns for env pull.

**First-time lane dev setup:** see `docs/lane-dev-bootstrap.md` for the canonical ordering (Drizzle-managed schema first, dev-only migrations on top) to populate an empty lane dev project. Applies after creating a fresh Supabase project or a schema reset.

**Before destructive platform operations:** enumerate Supabase
platform infrastructure before dropping, truncating, or resetting
anything. Supabase projects carry auth schema, realtime subscriptions,
storage buckets, cron jobs, and edge functions that are not visible
in `public` schema inspection. A reset that looks clean in Drizzle-
world can silently break platform-level integrations. Dashboard
review (Auth → Providers, Realtime → Inspector, Storage → Buckets,
Database → Extensions, Database → Cron) before irreversible ops.

## Migration discipline

- **"Migrations as canonical" is aspirational from April 22, 2026
  forward.** Prior migrations (pre-0010) were generated against
  partially-drifted schema snapshots; `drizzle-kit generate` diffs
  against the last Drizzle snapshot, not the live DB. Going forward:
  schema files describe intent, migrations describe what shipped,
  database state is authoritative. Discrepancies are resolved by
  writing a catch-up migration, not by editing either source.
- **After `drizzle-kit generate`, verify the new journal entry's
  `when` value exceeds `MAX(when)` across all existing entries.**
  `drizzle-orm`'s migrator skips entries whose `when` is not
  strictly greater than `MAX(created_at)` in
  `drizzle.__drizzle_migrations`. Manually-rounded `when` values
  from past PR integrations can push the max past `Date.now()`,
  causing silent skip. If the new entry's `when` is not greater,
  bump it to current epoch millis before committing.
- For the general principle behind post-apply verification, see
  "Success signals are not proof of effect" under **Verify before
  acting** above.

## Claude.ai ↔ Claude Code loop

Lane development uses two Claude surfaces in a disciplined loop:

- **Claude.ai** — strategy, spec work, architectural decisions, review. No filesystem access; reads only the docs Nikhil pastes or uploads as project files.
- **Claude Code** — execution against the real Lane repo. Runs commands, edits files, reports back with reproducible diffs.

The loop:
1. Claude.ai produces a structured Claude Code prompt with explicit STOP points between steps
2. Nikhil pastes the prompt into Claude Code
3. Claude Code executes one step, STOPs, reports
4. Nikhil pastes the report back to Claude.ai
5. Claude.ai reviews, directs the next step (continue / course-correct / rollback)
6. Repeat until the phase is complete

Prompt patterns that work:
- Read required docs first (WORKING-RULES, relevant spec)
- Pre-flight checks that report only, don't fix
- Numbered steps with explicit STOP between each
- Literal STOP markers before irreversible actions — any rebase, commit, push, delete, or destructive SQL must have an explicit "STOP" or "wait for approval" line in the prompt. Implicit stop gates ("then we decide") are ambiguous and have failed in practice
- Success doesn't unlock the next gate; the human does. When a prompt specifies STOPs between steps, those STOPs hold even when each preceding step completes cleanly. "Nothing failed" is not approval. (Two recurrences — April 19 rebase pipeline, April 20 bootstrap Step 3 — both now in the parking lot.)
- "Propose, don't implement" for decisions with real consequences
- Success criteria at the end
- Rollback plan called out separately
- Scoped to one phase only ("do A1, not A2 or A3")

Anti-patterns to avoid:
- Vague prompts ("start Phase A") — Claude Code over-interprets
- No STOP points — Claude Code runs through everything without review
- Decisions buried in implementation ("I just went ahead and...")
- Multi-phase scope in one prompt
- Implicit STOP gates based on clause structure ("then we decide X") — always use an explicit "STOP" marker before the action Claude Code must not take without approval

When Claude Code hits an ambiguity mid-step, it should STOP and ask, not resolve silently. Any report that includes "I just noticed X and fixed it" without explicit approval is a WORKING-RULES violation worth flagging back.

## Living docs rule

Any document referenced as source of truth gets updated when reality changes. Not "at the end of the session," not "when I remember" — immediately when the change happens, in the same commit or an immediate follow-up.

- `docs/ROADMAP.md` — updated at the end of every build step (not phase, step). Check items off with actual hours in parentheses. Parking lot items get added the moment they're identified, not held in chat memory or at session end.

- `docs/user-flows-spec.md` and other specs — updated when implementation reality diverges from spec. If a build step reveals a flaw in the spec design and we fix it differently, the spec gets updated to match the real implementation *before* the commit ships.

- `docs/WORKING-RULES.md` — updated when a new working rule is discovered mid-build. Small follow-up commits, one rule per commit, kept short.

- `CLAUDE.md` — updated rarely. Architecture-level changes only.

- **Stored claims drift even when nothing changes.** A claim written
  on day N is only known-true as of day N; by day N+30 it may be
  stale even if the doc file wasn't touched. Three manifestations:
  - Specs describe intent; reality may have diverged. Event-driven
    updates (on known changes) catch most drift but miss silent
    drift. A quarterly re-verification pass is the backstop.
  - Parking lot items saying "doesn't block X" were true when written;
    before each new work phase that would be blocked, re-verify those
    items don't in fact block.
  - "Last known good" counts and snapshots (table counts, migration
    journal state, RLS policy counts) age out — re-snapshot at the
    start of work that depends on them.

The test of whether this rule is real: does a doc stay true after a session ends? If yes, the rule worked. If no, either the doc got updated and we drifted anyway (rare), or the doc didn't get updated and became fiction (common failure mode). Specs that don't match code are worse than no specs — they mislead future sessions into building on a false picture.

Every Claude Code prompt that produces a code change must end with a "Doc updates required" section listing which docs get updated before the commit lands. Without that section, doc drift is almost guaranteed.
