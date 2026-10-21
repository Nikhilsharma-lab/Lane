import { describe, expect, it } from "vitest";

import { reportsSpeedInsights, withoutQueryOrHash } from "./speed-insights";

describe("reportsSpeedInsights", () => {
  it("reports from the production deployment at app.uselane.app", () => {
    expect(reportsSpeedInsights({ VERCEL_ENV: "production", NEXT_PUBLIC_APP_URL: "https://app.uselane.app" })).toBe(true);
    expect(reportsSpeedInsights({ VERCEL_ENV: "production", NEXT_PUBLIC_APP_URL: "https://app.uselane.app/" })).toBe(true);
  });

  it("stays off on staging, previews, local builds and a missing or garbled app URL", () => {
    expect(reportsSpeedInsights({ VERCEL_ENV: "production", NEXT_PUBLIC_APP_URL: "https://lane-staging.vercel.app" })).toBe(false);
    expect(reportsSpeedInsights({ VERCEL_ENV: "preview", NEXT_PUBLIC_APP_URL: "https://app.uselane.app" })).toBe(false);
    expect(reportsSpeedInsights({ NEXT_PUBLIC_APP_URL: "http://localhost:3000" })).toBe(false);
    expect(reportsSpeedInsights({ VERCEL_ENV: "production" })).toBe(false);
    expect(reportsSpeedInsights({ VERCEL_ENV: "production", NEXT_PUBLIC_APP_URL: "app.uselane.app" })).toBe(false);
  });
});

describe("withoutQueryOrHash", () => {
  it("drops the query string and fragment, keeping the path and route", () => {
    expect(
      withoutQueryOrHash({
        type: "vital",
        url: "https://app.uselane.app/signup?__clerk_ticket=secret&redirect_url=%2F#form",
        route: "/signup",
      }),
    ).toEqual({ type: "vital", url: "https://app.uselane.app/signup", route: "/signup" });
  });

  it("keeps a URL that has neither", () => {
    const event = { type: "vital" as const, url: "https://app.uselane.app/requests/abc", route: "/requests/[id]" };
    expect(withoutQueryOrHash(event)).toEqual(event);
  });
});
