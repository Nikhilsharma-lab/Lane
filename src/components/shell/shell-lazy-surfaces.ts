/**
 * Issue #107 (spec #101): the shell's on-demand surfaces, behind one dynamic
 * import. The search pane and the ⌘K palette share many first-load modules
 * (Arc Dialog and Motion, the list state, the Request moves). Behind two
 * imports, Turbopack regrouped the first-load chunks around the second one,
 * which cost about 2 KB gzip on every signed-in route for 0.2 KB of loader
 * code. Both were already preloaded once the page is idle, so loading them
 * together changes nothing a person sees; on Settings, which has no search
 * pane, the idle preload also fetches the pane's code.
 */
export { WorkspaceSearchPane } from "./workspace-search-pane"
export { CommandPalette } from "./command-palette"
