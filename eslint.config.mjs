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
const SESSION_SEAM = ["src/lib/session.ts", "src/lib/clerk-auth-guard.test.ts"];

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  // Plan items 1.3 and 1.5: a successful Request action already revalidates,
  // so a client refresh renders the page twice, and a refresh on any path
  // outside the overlay helper can drop a pending mutation's payload.
  {
    files: ["src/**/*.{ts,tsx}"],
    ignores: [
      "src/components/requests/use-optimistic-action.ts",
      // #296: the provider that holds the router for useServerRefresh; nothing else reaches its refresh.
      "src/components/shell/stable-router.tsx",
    ],
    rules: {
      "no-restricted-syntax": [
        "error",
        {
          selector:
            "CallExpression[callee.type='MemberExpression'][callee.property.name='refresh']",
          message:
            "Do not call router.refresh() directly. Run Request mutations through useOptimisticAction, and use useServerRefresh from src/components/requests/use-optimistic-action.ts for an explicit re-sync.",
        },
        // #256 Build 3: the named (or default) `z` is zod's whole namespace object, every schema type and locale,
        // which keeps all of zod (about 34 KB gzip) in any page whose code validates in the browser. The namespace
        // import lets the build keep only what is used, with the same schemas and messages.
        {
          selector: "ImportDeclaration[source.value='zod'] > ImportSpecifier[imported.name='z'], ImportDeclaration[source.value='zod'] > ImportDefaultSpecifier",
          message: "Import zod as `import * as z from \"zod\"`, so a page carries only the zod it uses (#256 Build 3).",
        },
      ],
    },
  },
  // #356: all of src, tests and Arc included. Flat config keeps only the last matching block's options for a rule,
  // so the dialog and link blocks below repeat CLERK_SESSION.
  {
    files: ["src/**/*.{ts,tsx}"],
    ignores: SESSION_SEAM,
    rules: { "no-restricted-imports": ["error", { paths: [CLERK_SESSION] }] },
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
      }],
    },
  },
  // Build 3: Lane's links read their pages ahead only once the page has loaded (src/components/link.tsx). The files
  // the block above leaves out get the same rule; Arc's own files keep Next's Link (Lane passes its own to them).
  {
    files: ["src/components/popup/**/*.{ts,tsx}", "src/components/shell/command-palette.tsx", "src/components/shell/workspace-search-results.tsx"],
    ignores: ["src/**/*.test.ts"],
    rules: { "no-restricted-imports": ["error", { paths: [NEXT_LINK, CLERK_SESSION] }] },
  },
  // The seam keeps the dialog and link rules; only Clerk's session reads are allowed there.
  {
    files: ["src/lib/session.ts"],
    rules: { "no-restricted-imports": ["error", { paths: [...ARC_DIALOGS, NEXT_LINK] }] },
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
  ]),
]);

export default eslintConfig;
