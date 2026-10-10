# Product UI

- `DESIGN.md` is authoritative: Arc UI only. Read `.claude/skills/arc/SKILL.md` and the relevant Arc Pro workflow before UI changes.
- Use actual official Arc registry/MCP source and documented APIs. Record deliberate adaptations in `docs/design-system/arc-sources.md`.
- Use Arc foundation tokens globally, Inter body and Geist display, and the native light/dark theme. No parallel palettes or scoped competing themes. The approved 2026-10-07 Requests/detail/Project navigation work may reference Linear interactions; Arc remains the visual authority.
- Preserve existing routes, data, actions, draft/upload recovery, permissions and Clerk-owned flows. Marketing is out of scope.
- Show live Codex/Storybook previews and verify keyboard, accessible names, responsive behavior, motion and all relevant states.
- Approved 2026-10-08 exception: `Review/Linear primitives` uses sourced Linear visual tokens through optional Arc hooks, retaining Arc components/motion. This is an opt-in Requests/sidebar preview only; production, marketing and Request detail stay outside it. See `docs/design-system/linear-primitives.md`.
