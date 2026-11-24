import { expect, type Page, type Route } from "@playwright/test";

/**
 * #402: a Server Action as the app's own screen sends it, kept back from the server, so it can be sent as someone
 * else: their browser's cookies decide who is asking, and nothing else is theirs. It reads no build file, so it works
 * against a hosted app too.
 */
export type CapturedAction = { url: string; id: string; contentType: string; body: string };

/** What an action answered: `success` or `error`, or an `AuthAnswer` (`ok`, with a `code` when refused). */
export type ActionAnswer = { success?: boolean; error?: string; ok?: boolean; code?: string };

/** Does `act`, and returns the action it sent whose payload holds `marker`. That one never reaches the server. */
export async function captureAction(page: Page, marker: string, act: () => Promise<void>): Promise<CapturedAction> {
  const captured = Promise.withResolvers<CapturedAction>();
  const handler = async (route: Route) => {
    const request = route.request();
    const id = request.method() === "POST" ? request.headers()["next-action"] : undefined;
    const body = id && request.postData();
    if (!id || !body || !body.includes(marker)) return route.fallback();
    captured.resolve({ url: request.url(), id, contentType: request.headers()["content-type"] ?? "text/plain;charset=UTF-8", body });
    await route.abort("failed");
  };
  await page.route("**/*", handler);
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    await act();
    return await Promise.race([captured.promise, new Promise<never>((_, reject) => {
      timer = setTimeout(() => reject(new Error(`No action with ${marker} was sent within 15 s.`)), 15_000);
    })]);
  } finally {
    clearTimeout(timer);
    await page.unroute("**/*", handler);
  }
}

/** Sends the action straight to the server with this page's cookies, `swap` changed in its payload. Returns its answer. */
export async function sendAs(page: Page, action: CapturedAction, swap: Record<string, string> = {}): Promise<ActionAnswer> {
  let body = action.body;
  for (const [from, to] of Object.entries(swap)) {
    expect(body, "the payload holds what is swapped").toContain(from);
    body = body.replaceAll(from, to);
  }
  const response = await page.request.post(action.url, {
    headers: { "Next-Action": action.id, "Content-Type": action.contentType, Accept: "text/x-component", Origin: new URL(action.url).origin },
    data: body,
    maxRedirects: 0,
  });
  return readAnswer(await response.text(), response.status());
}

/** The answer is the Flight row that the first row's `a` names. */
function readAnswer(flight: string, status: number): ActionAnswer {
  const rows = new Map<string, string>();
  for (const line of flight.split("\n")) {
    const row = /^([\da-f]+):([{[].*)$/.exec(line);
    if (row) rows.set(row[1], row[2]);
  }
  const named = /^\$@([\da-f]+)$/.exec(JSON.parse(rows.get("0") ?? "{}").a ?? "");
  const answer = named && rows.get(named[1]);
  if (!answer) throw new Error(`The action gave no answer (status ${status}).`);
  return JSON.parse(answer) as ActionAnswer;
}
