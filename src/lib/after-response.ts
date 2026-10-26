import "server-only";

import { after } from "next/server";

/**
 * Runs `work` after the response of the server action or route handler that calls it, so the person acting never
 * waits on it. A failure is logged under `label` by its name only (never a person, address or item). Outside a
 * request scope (a script, a test) `after` throws and nothing runs: there is no response to wait for.
 */
export function afterResponse(label: string, work: () => Promise<unknown>): void {
  try {
    after(async () => {
      try {
        await work();
      } catch (error) {
        console.error(`[${label}] work after the response failed: ${error instanceof Error ? error.name : "error"}`);
      }
    });
  } catch {
    // `after` throws outside a request scope; there is nothing to do after.
  }
}
