import type { Page, Request, Route } from "@playwright/test";

export type ActionResponse = { request: Request; ok: boolean; status: number; body: string };

/**
 * The next server action response that `matches`, read as the server sent it.
 *
 * In a production build (`next start`) the browser can let go of a server action's response once the app has read
 * it: DevTools then reports the request as net::ERR_ABORTED and keeps no body, so `response.text()` and
 * `response.finished()` fail although the page applied the result. Here the route fetches the real response, keeps
 * its text and hands it to the page unchanged, so a check reads the same bytes on a dev server and on a build.
 */
export async function nextActionResponse(page: Page, matches: (request: Request) => boolean) {
  const answer = Promise.withResolvers<ActionResponse>();
  let claimed = false;
  const handler = async (route: Route) => {
    if (claimed || !matches(route.request())) return route.fallback();
    claimed = true;
    try {
      const response = await route.fetch({ maxRetries: 0 });
      const body = await response.text();
      await route.fulfill({ response });
      answer.resolve({ request: route.request(), ok: response.ok(), status: response.status(), body });
    } catch (error) { answer.reject(error); }
  };
  await page.route("**/*", handler);
  return {
    /** The response, once the page has been handed it; fails after `timeout` ms without one. */
    async delivered(timeout = 30_000) {
      let timer: ReturnType<typeof setTimeout> | undefined;
      const late = new Promise<never>((_, reject) => {
        timer = setTimeout(() => reject(new Error(`No matching server action answered within ${timeout} ms.`)), timeout);
      });
      try { return await Promise.race([answer.promise, late]); } finally {
        clearTimeout(timer);
        await page.unroute("**/*", handler);
      }
    },
    stop: () => page.unroute("**/*", handler),
  };
}
