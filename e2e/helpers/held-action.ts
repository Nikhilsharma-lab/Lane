import { readFile } from "node:fs/promises";
import type { Page } from "@playwright/test";
import { runningActionManifestPath } from "./server-action-identity";

/** The compiled id of one server action in the app this checkout's Playwright config launched. */
export async function compiledActionId(filename: string, exportedName: string) {
  const manifest: { node: Record<string, { filename?: string; exportedName?: string }> } = JSON.parse(await readFile(runningActionManifestPath(), "utf8"));
  const [id] = Object.entries(manifest.node).find(([, item]) => item.filename === filename && item.exportedName === exportedName) ?? [];
  if (!id) throw new Error(`No compiled ${exportedName} in ${filename}`);
  return id;
}

/**
 * #279: holds the page's next call of one server action until `release`, then sends it on unchanged, so a check can
 * see what the page shows before the server has answered. Only that action is held; the page's reads go through.
 */
export async function holdNextAction(page: Page, filename: string, exportedName: string, path = "**/requests/**") {
  const action = await compiledActionId(filename, exportedName);
  const released = Promise.withResolvers<void>();
  const seen = Promise.withResolvers<void>();
  const sent = Promise.withResolvers<void>();
  let claimed = false;
  const handler: Parameters<Page["route"]>[1] = async route => {
    if (claimed || route.request().method() !== "POST" || route.request().headers()["next-action"] !== action) return route.fallback();
    claimed = true;
    seen.resolve();
    await released.promise;
    await route.continue().finally(() => sent.resolve());
  };
  // Only the Request page's own posts.
  await page.route(path, handler);
  return {
    seen: seen.promise,
    async release() { released.resolve(); await sent.promise; await page.unroute(path, handler); },
  };
}
