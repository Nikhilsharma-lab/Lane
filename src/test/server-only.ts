// Stand-in for Next's "server-only" marker under Vitest. In the app the Next
// compiler resolves the import and fails any client bundle that includes a
// server module; the unit suite imports the loaders directly, so the marker
// resolves to this empty module instead (vitest.config.ts resolve.alias).
export {};
