# Working in a git worktree

Agent worktrees live under `.claude/worktrees/` (git-ignored; lint and typecheck skip it).

## Setup

1. Confirm the worktree is based on the branch you were told to build on (`git merge-base --is-ancestor <branch> HEAD`).
2. `.env.test`: Claude Code copies it in through `.worktreeinclude`. If the worktree was made another way and it is
   missing, copy it from the main checkout. Every checkout gets its own local test database
   (`src/test/test-database.ts`), so worktrees never share one.
3. Dependencies: `CI=true pnpm install --frozen-lockfile`. Without `CI=true`, pnpm stops to ask before replacing
   `node_modules` when no terminal is attached. Install into the worktree; a symlink to the main checkout's
   `node_modules` makes pnpm try to remove it.

## Gates

The full `pnpm test` takes about five minutes. While iterating, run the files you changed
(`pnpm vitest run <files>`) and `pnpm typecheck`. Run the full suite once before you report done, and again only if
merging the base branch brought in new commits.
