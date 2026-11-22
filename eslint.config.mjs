import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

const NEXT_LINK = { name: "next/link", message: "Use Link from @/components/link: it waits for the page's load before reading ahead (Build 3)." };
const ARC_DIALOGS = ["dialog/dialog", "drawer/drawer", "bottom-sheet/bottom-sheet"].map((path) => ({
  name: `@/components/arc/${path}`,
  message: "Use Dialog from @/components/popup/adaptive-dialog (#263).",
}));
// #356: who is signed in, and their workspace and role, come only through the session seam, so who owns identity
// can change behind one file. clerkClient (the roster, billing) stays importable.
const CLERK_SESSION = {
  name: "@clerk/nextjs/server",
  importNames: ["auth", "currentUser"],
  message: "Read the session through readSession, readAccount or sendToSignIn from src/lib/session.ts (#356).",
};
// A dynamic import() hands over every export, auth included, so only the seam's files load Clerk's server module that way.
const CLERK_SESSION_DYNAMIC = {
  selector: "ImportExpression[source.value='@clerk/nextjs/server']",
  message: "Import clerkClient statically, and read the session through src/lib/session.ts (#356).",
};
const CLERK_SESSION_READERS = ["src/lib/session.ts", "src/lib/session.test.ts"];
// #371: the Better Auth server stays dormant until increment 5 widens this list on purpose. Only the server module,
// the auth route, the session read (#374) and their tests load Better Auth's server entry points, Lane's server
// instance or the session read. The browser client entries (better-auth/client, better-auth/react) stay open for
// the screens.
const BETTER_AUTH_SERVER = [
  {
    regex: "^better-auth(?!/(client|react|vue|svelte|solid)(/|$))(/.*)?$",
    message: "Better Auth's server is dormant: only src/lib/auth-server.ts, the auth route and the session read (src/lib/better-auth-session.ts) load it (#371, #374).",
  },
  { regex: "(^|/)auth-server$", message: "Better Auth's server instance is dormant: only the auth route uses it (#371)." },
  { regex: "(^|/)better-auth-session$", message: "The Better Auth session read is dormant until increment 5 makes readSession call it (#374)." },
];
const BETTER_AUTH_SERVER_DYNAMIC = [
  {
    selector: "ImportExpression[source.value=/^better-auth/]",
    message: "Better Auth's server is dormant: only src/lib/auth-server.ts, the auth route and the session read (src/lib/better-auth-session.ts) load it (#371, #374).",
  },
  { selector: "ImportExpression[source.value=/auth-server$/]", message: "Better Auth's server instance is dormant: only the auth route uses it (#371)." },
  { selector: "ImportExpression[source.value=/better-auth-session$/]", message: "The Better Auth session read is dormant until increment 5 makes readSession call it (#374)." },
];
// #374: the dormant session read and its test join them. Nothing else imports the read until increment 5.
const BETTER_AUTH_SERVER_FILES = [
  "src/lib/auth-server.ts",
  "src/app/api/auth/**/*.ts",
  "src/lib/better-auth-session.ts",
  "src/lib/better-auth-session.test.ts",
];
// #376: Lane's own auth and account screens stay dormant until increment 5 mounts them, so no route, page or layout
// under src/app imports them, statically or through a dynamic import(). This is the one list: each increment 4 ticket
// adds an entry. `module` is a regex for the imported file's name (no folder, no extension); `message` names the view
// and its ticket. DORMANT_SCREENS (import declarations) and DORMANT_SCREENS_DYNAMIC (import()) are both built from it.
const DORMANT_SCREEN_MODULES = [
  // #380: Settings → Profile's account section (profile-account-view, -password, -devices and their controllers).
  { module: "profile-account(-[\\w-]+)?", message: "Settings → Profile's account section is dormant until increment 5 mounts it (#380)." },
  // #381 (story 99): the workspace name and Leave rows.
  {
    module: "(workspace-name-row|leave-workspace-row)",
    message: "The workspace name and Leave rows are dormant: no route, page or layout imports them until increment 5 (#381).",
  },
];
const DORMANT_SCREENS = DORMANT_SCREEN_MODULES.map(({ module, message }) => ({ regex: `(^|/)${module}$`, message }));
const DORMANT_SCREENS_DYNAMIC = DORMANT_SCREEN_MODULES.map(({ module, message }) => ({ selector: `ImportExpression[source.value=/${module}$/]`, message }));
const ROUTER_REFRESH = {
  selector: "CallExpression[callee.type='MemberExpression'][callee.property.name='refresh']",
  message:
    "Do not call router.refresh() directly. Run Request mutations through useOptimisticAction, and use useServerRefresh from src/components/requests/use-optimistic-action.ts for an explicit re-sync.",
};
// #256 Build 3: the named (or default) `z` is zod's whole namespace object, every schema type and locale,
// which keeps all of zod (about 34 KB gzip) in any page whose code validates in the browser. The namespace
// import lets the build keep only what is used, with the same schemas and messages.
const ZOD_NAMESPACE = {
  selector: "ImportDeclaration[source.value='zod'] > ImportSpecifier[imported.name='z'], ImportDeclaration[source.value='zod'] > ImportDefaultSpecifier",
  message: "Import zod as `import * as z from \"zod\"`, so a page carries only the zod it uses (#256 Build 3).",
};
const REFRESH_OWNERS = [
  "src/components/requests/use-optimistic-action.ts",
  // #296: the provider that holds the router for useServerRefresh; nothing else reaches its refresh.
  "src/components/shell/stable-router.tsx",
];

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  // Plan items 1.3 and 1.5: a successful Request action already revalidates,
  // so a client refresh renders the page twice, and a refresh on any path
  // outside the overlay helper can drop a pending mutation's payload.
  {
    files: ["src/**/*.{ts,tsx}"],
    ignores: REFRESH_OWNERS,
    rules: { "no-restricted-syntax": ["error", ROUTER_REFRESH, ZOD_NAMESPACE, CLERK_SESSION_DYNAMIC, ...BETTER_AUTH_SERVER_DYNAMIC] },
  },
  // The files above that own the router refresh still keep Clerk's server module static.
  {
    files: REFRESH_OWNERS,
    rules: { "no-restricted-syntax": ["error", CLERK_SESSION_DYNAMIC, ...BETTER_AUTH_SERVER_DYNAMIC] },
  },
  // The seam and its Clerk-side test may load Clerk's server module dynamically; the refresh and zod rules still apply.
  {
    files: CLERK_SESSION_READERS,
    rules: { "no-restricted-syntax": ["error", ROUTER_REFRESH, ZOD_NAMESPACE, ...BETTER_AUTH_SERVER_DYNAMIC] },
  },
  // #371: the Better Auth server's own files may load it dynamically; the other rules still apply. The auth route is
  // under src/app, so it keeps the dormant screens' rule (#376).
  {
    files: BETTER_AUTH_SERVER_FILES,
    rules: { "no-restricted-syntax": ["error", ROUTER_REFRESH, ZOD_NAMESPACE, CLERK_SESSION_DYNAMIC, ...DORMANT_SCREENS_DYNAMIC] },
  },
  // #356: all of src, tests and Arc included. Flat config keeps only the last matching block's options for a rule,
  // so the dialog and link blocks below repeat CLERK_SESSION, and every block repeats BETTER_AUTH_SERVER.
  {
    files: ["src/**/*.{ts,tsx}"],
    ignores: CLERK_SESSION_READERS,
    rules: { "no-restricted-imports": ["error", { paths: [CLERK_SESSION], patterns: BETTER_AUTH_SERVER }] },
  },
  {
    files: ["src/lib/session.test.ts"],
    rules: { "no-restricted-imports": ["error", { patterns: BETTER_AUTH_SERVER }] },
  },
  // #263: Lane's dialogs go through the adaptive popup (a bottom panel on phones, focus return, the typed-text
  // guard). Only the popup itself and the pickers and menus that stay centred import Arc's dialog directly.
  {
    files: ["src/**/*.{ts,tsx}"],
    ignores: [
      "src/components/popup/**",
      "src/components/arc/**",
      // Build 4 owns ⌘K and workspace search, so the command palette and the search results stay on Arc's own dialog until then.
      "src/components/shell/command-palette.tsx",
      "src/components/shell/workspace-search-results.tsx",
      "src/**/*.test.ts",
    ],
    rules: {
      "no-restricted-imports": ["error", {
        paths: [...ARC_DIALOGS, NEXT_LINK, CLERK_SESSION],
        patterns: BETTER_AUTH_SERVER,
      }],
    },
  },
  // Build 3: Lane's links read their pages ahead only once the page has loaded (src/components/link.tsx). The files
  // the block above leaves out get the same rule; Arc's own files keep Next's Link (Lane passes its own to them).
  {
    files: ["src/components/popup/**/*.{ts,tsx}", "src/components/shell/command-palette.tsx", "src/components/shell/workspace-search-results.tsx"],
    ignores: ["src/**/*.test.ts"],
    rules: { "no-restricted-imports": ["error", { paths: [NEXT_LINK, CLERK_SESSION], patterns: BETTER_AUTH_SERVER }] },
  },
  // The seam keeps the dialog and link rules; only Clerk's session reads are allowed there.
  {
    files: ["src/lib/session.ts"],
    rules: { "no-restricted-imports": ["error", { paths: [...ARC_DIALOGS, NEXT_LINK], patterns: BETTER_AUTH_SERVER }] },
  },
  // #371: only the Better Auth server module, the auth route, the session read (#374) and their tests load Better
  // Auth's server. The auth route is under src/app, so it keeps the dormant screens' rule (#376).
  {
    files: BETTER_AUTH_SERVER_FILES,
    rules: { "no-restricted-imports": ["error", { paths: [...ARC_DIALOGS, NEXT_LINK, CLERK_SESSION], patterns: DORMANT_SCREENS }] },
  },
  // #376: the app's routes, pages and layouts keep every rule the blocks above give them, and don't import the dormant
  // screens, statically or dynamically. The Better Auth server's files keep their own allowance above, which carries
  // the same dormant-screen rule for the auth route.
  {
    files: ["src/app/**/*.{ts,tsx}"],
    ignores: ["src/**/*.test.ts", ...BETTER_AUTH_SERVER_FILES],
    rules: {
      "no-restricted-syntax": ["error", ROUTER_REFRESH, ZOD_NAMESPACE, CLERK_SESSION_DYNAMIC, ...BETTER_AUTH_SERVER_DYNAMIC, ...DORMANT_SCREENS_DYNAMIC],
      "no-restricted-imports": ["error", { paths: [...ARC_DIALOGS, NEXT_LINK, CLERK_SESSION], patterns: [...BETTER_AUTH_SERVER, ...DORMANT_SCREENS] }],
    },
  },
  // Override default ignores of eslint-config-next.
  globalIgnores([
    // Default ignores of eslint-config-next:
    ".next/**",
    ".next-e2e/**",
    ".next-audit/**",
    "out/**",
    "build/**",
    "next-env.d.ts",
    // Local research captures (gitignored); never lint them.
    "artifacts/**",
    // Local database exports and agent worktrees (gitignored): not Lane's source.
    "backups/**",
    ".claude/**",
  ]),
]);

export default eslintConfig;
