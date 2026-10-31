import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { dirname, join, relative, resolve } from "node:path";
import { describe, expect, it } from "vitest";

// #266: outside the signed-in app a page carries Motion's animations and gestures only (motion-features.tsx). Layout
// and drag come with the (app) layout (app-motion-features.tsx), so a component using them anywhere else would jump
// where it should glide. This follows every import (static and lazy) from each route file outside src/app/(app) and
// from the root layout, and finds the m.* elements that ask for layout or drag.

const root = resolve(__dirname, "../../..");
const app = join(root, "src/app");
const LAYOUT_OR_DRAG = /^(layout|layoutId|layoutScroll|layoutRoot|layoutDependency|drag|dragControls|dragListener|onPan|onPanStart|onPanEnd|onPanSessionStart|onDrag|onDragStart|onDragEnd)$/;
const ROUTE_FILE = /^(page|layout|template|loading|error|not-found|global-error|default)\.tsx?$/;

/** The props of every `<m.x …>` opening tag in a file, read at the tag's own level (not inside `{…}`). */
function motionProps(source: string): string[] {
  const props: string[] = [];
  for (const match of source.matchAll(/<m\.[a-zA-Z]+/g)) {
    let depth = 0, tag = "";
    for (let i = match.index + match[0].length; i < source.length; i++) {
      const char = source[i];
      if (char === "{") depth++;
      else if (char === "}") depth--;
      else if (depth === 0 && char === ">") break;
      else if (depth === 0) tag += char;
    }
    props.push(...[...tag.matchAll(/(?:^|\s)([a-zA-Z]+)(?==|\s|\/|$)/g)].map(prop => prop[1]));
  }
  return props;
}
const usesLayoutOrDrag = (file: string) => motionProps(readFileSync(file, "utf8")).some(prop => LAYOUT_OR_DRAG.test(prop));

function resolveImport(from: string, specifier: string): string | null {
  const base = specifier.startsWith("@/") ? join(root, "src", specifier.slice(2)) : specifier.startsWith(".") ? resolve(dirname(from), specifier) : null;
  if (!base) return null;
  for (const candidate of [base, `${base}.tsx`, `${base}.ts`, join(base, "index.tsx"), join(base, "index.ts")]) {
    if (existsSync(candidate) && statSync(candidate).isFile() && /\.tsx?$/.test(candidate)) return candidate;
  }
  return null;
}
function imports(file: string): string[] {
  const source = readFileSync(file, "utf8");
  const specifiers = [
    ...[...source.matchAll(/^\s*(?:import|export)\s+(?!type\s)(?:[^'"]*?\sfrom\s+)?["']([^"']+)["']/gm)].map(match => match[1]),
    ...[...source.matchAll(/import\(\s*["']([^"']+)["']\s*\)/g)].map(match => match[1]),
  ];
  return specifiers.map(specifier => resolveImport(file, specifier)).filter((path): path is string => path !== null);
}
function routeFilesOutsideApp(directory: string): string[] {
  return readdirSync(directory, { withFileTypes: true }).flatMap(entry => {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) return path === join(app, "(app)") || entry.name === "api" ? [] : routeFilesOutsideApp(path);
    return ROUTE_FILE.test(entry.name) ? [path] : [];
  });
}
/** Every file reachable from `entries`, with the chain that first reached it. */
function reach(entries: string[]) {
  const via = new Map<string, string[]>(entries.map(entry => [entry, [entry]]));
  const queue = [...entries];
  while (queue.length) {
    const file = queue.shift()!;
    for (const next of imports(file)) {
      if (via.has(next)) continue;
      via.set(next, [...via.get(file)!, next]);
      queue.push(next);
    }
  }
  return via;
}
const name = (file: string) => relative(root, file);

describe("Motion's layout and drag", () => {
  it("are asked for by the signed-in app's components (so the check below looks for the right thing)", () => {
    const signedIn = reach([join(app, "(app)/layout.tsx"), ...readdirSync(join(app, "(app)"), { recursive: true, encoding: "utf8" }).filter(path => ROUTE_FILE.test(path.split("/").pop()!)).map(path => join(app, "(app)", path))]);
    const users = [...signedIn.keys()].filter(usesLayoutOrDrag).map(name);
    expect(users).toEqual(expect.arrayContaining([
      "src/components/arc/blocks/workspace-sidebar/workspace-sidebar.tsx",
      "src/components/arc/segmented-control/segmented-control.tsx",
      "src/components/arc/user-menu/user-menu.tsx",
      "src/components/arc/chip-group/chip-group.tsx",
      "src/components/settings/settings-command-adapter.tsx",
    ]));
  });

  it("are used nowhere outside the signed-in app, where the page carries only animations and gestures", () => {
    const outside = reach(routeFilesOutsideApp(app));
    expect(outside.size).toBeGreaterThan(20);
    const users = [...outside.entries()].filter(([file]) => usesLayoutOrDrag(file)).map(([, chain]) => chain.map(name).join(" -> "));
    expect(users).toEqual([]);
  });
});
