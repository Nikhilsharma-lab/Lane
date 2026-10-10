# Arc Pro licence record

**Checked:** 2026-10-10, against https://uiarc.dev/license ("License | Arc UI", last updated 26 September 2026). This closes decision 8.8 of `docs/superpowers/plans/2026-10-10-mvp-launch-linear.md`. Nikhil holds an Arc Pro account; licensed source arrives through the authenticated Arc MCP server (`https://uiarc.dev/api/mcp`).

## What the licence allows for Lane

- Pro source may be used in an open-source end product, such as an app published on GitHub, as long as the Pro source is only a part of it and the project is not a UI kit, library or template. Lane is an end product, and its public repository qualifies.
- End products may be sold, including SaaS apps with many users.

## What the licence requires

- Keep the Arc Pro notice in the Pro files and note that they are not covered by the project's open-source licence.
- Do not redistribute, resell, sublicense or share Pro source on its own: not as source files, a package, a registry, a snippet collection or a download.

## Pro files in this repository

Every file below carries the Arc Pro notice in its header. They are licensed by uiarc under Arc Pro, not under any licence Lane may adopt for its own code. The provenance ledger `docs/design-system/arc-source-hashes.json` records their upstream and local hashes, and `pnpm design:check` verifies them.

- `src/components/arc/blocks/workspace-sidebar/workspace-sidebar.tsx`
- `src/components/arc/blocks/workspace-sidebar/workspace-sidebar.module.css`
- `src/components/shell/sidebar-view.tsx` (composes the Pro block)
- `src/components/shell/workspace-search-pane.tsx` and `.module.css` (adapted from Pro source)

The Arc skill files under `.claude/skills/` include Pro skill content. They stay out of the repository (`.gitignore` ignores `/.claude/`).

## Still open

Lane has no licence file of its own. Until one exists, the notices above are the only statement of terms for the Pro files; a Lane licence, when added, must exclude them explicitly.
