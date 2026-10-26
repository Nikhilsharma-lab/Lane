/**
 * #217: help's way back to the first run, in the account menu on every page with the sidebar. Kept apart from
 * the first-run rules so the shell carries only these two strings. The Requests list hears the hash
 * (src/components/first-run/first-run-help.tsx) and shows the guide, reopening it if it was skipped or finished.
 */
export const FIRST_RUN_HELP = { label: "First-run guide", href: "/#first-run", hash: "#first-run" } as const;
