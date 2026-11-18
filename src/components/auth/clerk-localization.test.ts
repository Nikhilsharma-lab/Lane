import { createRequire } from "node:module";
import { describe, expect, it } from "vitest";

import { clerkLocalization } from "./clerk-localization";

// The English the bundled @clerk/ui falls back to: its own @clerk/localizations, so this follows the pinned version.
const fromClerkUI = createRequire(createRequire(import.meta.url).resolve("@clerk/ui/package.json"));
const { enUS } = fromClerkUI("@clerk/localizations") as { enUS: Record<string, unknown> };

type Tree = { [key: string]: string | Tree };
const strings = (tree: Tree, path: string[] = []): [string, string][] =>
  Object.entries(tree).flatMap(([key, value]) => typeof value === "string" ? [[[...path, key].join("."), value] as [string, string]] : typeof value === "object" && value ? strings(value as Tree, [...path, key]) : []);
const lane = new Map(strings(clerkLocalization as unknown as Tree));
const clerk = new Map(strings(enUS as Tree));
const tokens = (text: string) => [...text.matchAll(/\{\{\s*([\w.]+)\s*\}\}/g)].map(match => match[1]).sort();
const outsideTokens = (text: string) => text.replace(/\{\{[^}]*\}\}/g, "");

describe("Clerk's words in Lane (#289)", () => {
  it("names the sign-in, sign-up and create-workspace screens in Lane's words", () => {
    expect(clerkLocalization.signIn.start).toEqual({ title: "Sign in to Lane", subtitle: "" });
    expect(clerkLocalization.signUp.start).toEqual({ title: "Create your Lane account", subtitle: "" });
    expect(clerkLocalization.taskChooseOrganization.createOrganization).toMatchObject({ title: "Name your workspace", subtitle: "You can change it later in Settings." });
  });

  it("overrides only keys the installed Clerk has", () => {
    for (const key of lane.keys()) expect(clerk.has(key), key).toBe(true);
  });

  it("says workspace wherever Clerk's English says organization, keeping Clerk's placeholders", () => {
    const organizationStrings = [...clerk].filter(([, text]) => /organi[sz]ation/i.test(outsideTokens(text)));
    expect(organizationStrings.length).toBeGreaterThan(0);
    for (const [key, text] of organizationStrings) {
      const ours = lane.get(key);
      expect(ours, key).toBeDefined();
      expect(outsideTokens(ours!), key).not.toMatch(/organi[sz]ation/i);
      expect(tokens(ours!), key).toEqual(tokens(text));
    }
  });

  it("writes no exclamation marks", () => {
    for (const [key, text] of lane) expect(text, key).not.toContain("!");
  });
});
