import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { createHash } from "node:crypto";
import { expect } from "@playwright/test";
import { assertE2ETarget } from "./safety";

/** These transport checks need the manifest of the local app launched by this checkout's Playwright config. */
export function assertLocalUndoTarget() {
  const target = new URL(assertE2ETarget().baseURL);
  if (target.protocol !== "http:" || !["localhost", "127.0.0.1"].includes(target.hostname)) {
    throw new Error("Undo transport acceptance requires this checkout's local .next-e2e runtime. Hosted runs need their own matching build identities; another checkout's manifest is not valid.");
  }
}

export async function compiledUndoAction(kind: "pick-up" | "done" | "undo" | "release") {
  assertLocalUndoTarget();
  // The original Playwright config launches Next dev with .next-e2e in this same cwd,
  // refuses an already-running server, and compiles the route before this is read.
  const path = resolve(process.cwd(), ".next-e2e/dev/server/server-reference-manifest.json");
  const source = await readFile(path, "utf8");
  const manifest: { node?: Record<string, { filename?: string; exportedName?: string }> } = JSON.parse(source);
  const exports = {
    "pick-up": ["src/app/(app)/requests/[id]/actions.ts", "pickUpRequest"],
    done: ["src/app/(app)/requests/[id]/actions.ts", "markDone"],
    undo: ["src/app/(app)/requests/[id]/actions.ts", "undoMarkDone"],
    release: ["src/app/(app)/requests/[id]/release-actions.ts", "changeRequestRelease"],
  } as const;
  const resolveExport = (kind: keyof typeof exports) => {
    const [filename, exportedName] = exports[kind];
    const matches = Object.entries(manifest.node ?? {}).filter(([, item]) => item.filename === filename && item.exportedName === exportedName);
    expect(matches, `Unique compiled ${exportedName} identity in this running checkout`).toHaveLength(1);
    const id = matches[0][0]; expect(id).toMatch(/^[a-f0-9]{40}$/);
    return { id, filename, exportedName, manifestSha256: createHash("sha256").update(source).digest("hex") };
  };
  return resolveExport(kind);
}

/** Keys/types only. Never emit raw Flight text, request headers, URLs or value-bearing model data. */
export function flightResultShape(body: string) {
  const shape: { line: string; kind: string; keys?: string[] }[] = [];
  for (const line of body.split("\n")) {
    const match = /^([\da-f]+):(.+)$/.exec(line);
    if (!match) continue;
    try {
      const value = JSON.parse(match[2]);
      shape.push({ line: match[1], kind: Array.isArray(value) ? "array" : value === null ? "null" : typeof value, ...(value && typeof value === "object" && !Array.isArray(value) ? { keys: Object.keys(value).slice(0, 20) } : {}) });
    } catch { shape.push({ line: match[1], kind: "flight-control" }); }
    if (shape.length === 30) break;
  }
  return shape;
}
