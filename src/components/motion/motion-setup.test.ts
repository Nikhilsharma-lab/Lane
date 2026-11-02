import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, join, resolve } from "node:path";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

import { m, motion } from "motion/react";
import { AppMotionFeatures } from "./app-motion-features";
import { MotionFeatures } from "./motion-features";

// #266: the app imports `motion/react` and the bundler resolves it to `framer-motion` (motion-alias.ts), so the two
// packages must be one and the same version: `motion` is only framer-motion re-exported.
const root = resolve(__dirname, "../../..");
const packageJson = (path: string) => JSON.parse(readFileSync(path, "utf8")) as { version: string; dependencies?: Record<string, string> };
const ours = packageJson(join(root, "package.json")).dependencies!;
const require = createRequire(join(root, "package.json"));
/** The installed package's own package.json (its exports may not list it, so found beside its entry). */
function installed(name: string, from = require) {
  let directory = dirname(from.resolve(name));
  while (!directory.endsWith(join("node_modules", name))) directory = dirname(directory);
  return packageJson(join(directory, "package.json"));
}

describe("Motion's packages", () => {
  it("are pinned to one exact version in package.json", () => {
    expect(ours["framer-motion"]).toMatch(/^\d+\.\d+\.\d+$/);
    expect(ours.motion).toBe(ours["framer-motion"]);
  });

  it("are installed at that version, and motion's own framer-motion is ours", () => {
    const motionPackage = installed("motion");
    expect(installed("framer-motion").version).toBe(ours["framer-motion"]);
    expect(motionPackage.version).toBe(ours["framer-motion"]);
    expect(motionPackage.dependencies?.["framer-motion"]).toBe(ours["framer-motion"]);
    const motionsRequire = createRequire(require.resolve("motion"));
    expect(installed("framer-motion", motionsRequire).version).toBe(ours["framer-motion"]);
  });
});

describe("Motion's lazy features", () => {
  const render = (features: typeof MotionFeatures, element: typeof m.div) =>
    renderToStaticMarkup(createElement(features, null, createElement(element, { id: "probe" })));

  it("render m.* components on every page and in the signed-in app", () => {
    expect(render(MotionFeatures, m.div)).toContain('id="probe"');
    expect(render(AppMotionFeatures, m.div)).toContain('id="probe"');
  });

  it("refuse a motion.* component, which would bring all of Motion back into the page", () => {
    // Motion checks only in a browser (and never in a production build): the render is told it is in one.
    vi.stubGlobal("window", globalThis);
    try {
      expect(() => render(MotionFeatures, motion.div)).toThrow(/LazyMotion/);
      expect(() => render(AppMotionFeatures, motion.div)).toThrow(/LazyMotion/);
    } finally {
      vi.unstubAllGlobals();
    }
  });
});
