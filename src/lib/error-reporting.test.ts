import { describe, expect, it } from "vitest";

import { DATA_COLLECTION, errorReportingOptions, scrubEvent } from "./error-reporting";

const DSN = "https://0123456789abcdef@app.glitchtip.com/28916";

describe("errorReportingOptions", () => {
  it("is disabled with no DSN, so local work sends nothing", () => {
    const options = errorReportingOptions({});
    expect(options.enabled).toBe(false);
    expect(options.dsn).toBeUndefined();
    expect(errorReportingOptions({ NEXT_PUBLIC_SENTRY_DSN: "   " }).enabled).toBe(false);
  });

  it("is enabled with a DSN and never turns on tracing", () => {
    const options = errorReportingOptions({ NEXT_PUBLIC_SENTRY_DSN: DSN });
    expect(options.enabled).toBe(true);
    expect(options.dsn).toBe(DSN);
    expect(options.tracesSampleRate).toBe(0);
    expect(options.includeServerName).toBe(false);
  });

  it("collects no user info, cookies, bodies, query params, AI text, DB data or local variables", () => {
    const { dataCollection } = errorReportingOptions({ NEXT_PUBLIC_SENTRY_DSN: DSN });
    expect(dataCollection).toBe(DATA_COLLECTION);
    expect(dataCollection.userInfo).toBe(false);
    expect(dataCollection.cookies).toBe(false);
    expect(dataCollection.httpBodies).toEqual([]);
    expect(dataCollection.urlQueryParams).toBe(false);
    expect(dataCollection.genAI).toEqual({ inputs: false, outputs: false });
    expect(dataCollection.databaseQueryData).toBe(false);
    expect(dataCollection.stackFrameVariables).toBe(false);
    expect(dataCollection.httpHeaders.response).toBe(false);
    expect(dataCollection.httpHeaders.request.allow).not.toContain("cookie");
    expect(dataCollection.httpHeaders.request.allow).not.toContain("authorization");
  });

  it("labels the environment from Vercel first, then NODE_ENV", () => {
    expect(errorReportingOptions({ VERCEL_ENV: "preview", NODE_ENV: "production" }).environment).toBe("preview");
    expect(errorReportingOptions({ NODE_ENV: "production" }).environment).toBe("production");
    expect(errorReportingOptions({}).environment).toBe("development");
  });

  it("uses the Vercel commit as the release when present", () => {
    expect(errorReportingOptions({ VERCEL_GIT_COMMIT_SHA: "abc123" }).release).toBe("abc123");
    expect(errorReportingOptions({ VERCEL_GIT_COMMIT_SHA: "" }).release).toBeUndefined();
  });
});

describe("scrubEvent", () => {
  it("drops cookies, auth headers and the user block, keeps the rest", () => {
    const event = scrubEvent({
      message: "boom",
      user: { id: "user_1" },
      request: {
        url: "https://app.uselane.app/requests",
        method: "POST",
        cookies: { __session: "jwt" },
        headers: {
          Cookie: "__session=jwt",
          Authorization: "Bearer token",
          "x-clerk-auth-token": "token",
          "user-agent": "Mozilla/5.0",
          accept: "text/html",
        },
      },
    });

    expect(event.user).toBeUndefined();
    expect(event.request?.cookies).toBeUndefined();
    expect(event.request?.headers).toEqual({ "user-agent": "Mozilla/5.0", accept: "text/html" });
    expect(event.request?.url).toBe("https://app.uselane.app/requests");
    expect(event.message).toBe("boom");
    expect(JSON.stringify(event)).not.toMatch(/jwt|token/);
  });

  it("tolerates events without a request", () => {
    expect(scrubEvent({ message: "boom" })).toEqual({ message: "boom" });
  });
});
