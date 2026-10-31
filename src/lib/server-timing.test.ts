import { describe, expect, it } from "vitest";

import { serverTimingHeader } from "./feature-switches";
import { createServerTimings } from "./server-timing";

/** A clock the test moves by hand, so every duration is a known number. */
function handClock(start = 1000) {
  let now = start;
  return { now: () => now, advance: (ms: number) => { now += ms; } };
}

describe("server timings", () => {
  it("names each step with its duration and the route pattern in the Server-Timing header", async () => {
    const clock = handClock();
    const timings = createServerTimings({ route: "Request page", clock: clock.now });

    await timings.time("session", async () => { clock.advance(12); });
    await timings.time("workspace", async () => { clock.advance(30.4); });
    clock.advance(5);

    expect(timings.header()).toBe('route;desc="Request page", session;dur=12, workspace;dur=30.4, render;dur=47.4');
  });

  it("writes one structured log line with every step, the render up to the first byte and the whole response", async () => {
    const clock = handClock();
    const timings = createServerTimings({ route: "Inbox", clock: clock.now, kind: "page", cold: true });

    await timings.time("session", async () => { clock.advance(2); });
    await timings.time("workspace", async () => { clock.advance(40); });
    timings.markFirstByte();
    await timings.time("data", async () => { clock.advance(100); });
    clock.advance(8);

    expect(JSON.parse(timings.logLine())).toEqual({
      serverTiming: "Inbox",
      kind: "page",
      cold: true,
      steps: { session: 2, workspace: 40, data: 100 },
      render: 42,
      total: 150,
    });
  });

  it("marks the first render since the server started as cold, so cold and warm loads are told apart", async () => {
    const clock = handClock();
    const cold = createServerTimings({ route: "Impact", clock: clock.now, cold: true });
    clock.advance(3);

    expect(cold.header()).toBe('route;desc="Impact", cold, render;dur=3');
  });

  it("counts overlapping work under one step once, so reads run side by side show their wall time", async () => {
    const clock = handClock();
    const timings = createServerTimings({ route: "Requests list", clock: clock.now });
    let release!: () => void;
    const slow = timings.time("data", () => new Promise<void>((resolve) => { release = resolve; }));
    clock.advance(10);
    await timings.time("data", async () => { clock.advance(20); });
    clock.advance(30);
    release();
    await slow;

    expect(timings.header()).toBe('route;desc="Requests list", data;dur=60, render;dur=60');
  });

  it("keeps the ids, names and titles a step works with out of the header and the log line", async () => {
    const clock = handClock();
    const timings = createServerTimings({ route: "Request page", clock: clock.now, kind: "navigation" });
    const requestId = "8c1f4b6e-2d0a-4f7e-9a51-3b2c7d9e0f12";
    const person = { userId: "user_3L7k6ORNFLJ2l6Mo305CMux2XO1", orgId: "org_3LOc8dZ4obIQeybxxmEYDJnuVIL", email: "pm@example.com" };

    await timings.time("data", async () => { clock.advance(5); return { id: requestId, title: "Checkout drop-off", ...person }; });
    await timings.time("clerk", async () => { throw new Error(`no organization ${person.orgId}`); }).catch(() => undefined);
    timings.markFirstByte();

    for (const written of [timings.header(), timings.logLine()]) {
      for (const secret of [requestId, person.userId, person.orgId, person.email, "Checkout drop-off", "organization"]) {
        expect(written).not.toContain(secret);
      }
    }
    expect(timings.header()).toBe('route;desc="Request page", data;dur=5, clerk;dur=0, render;dur=5');
  });

  it("sends the header only while LANE_SERVER_TIMING_HEADER is exactly 1", () => {
    expect(serverTimingHeader({ LANE_SERVER_TIMING_HEADER: "1" })).toBe(true);
    for (const value of [undefined, "", "0", "true", "on", " 1"]) {
      expect(serverTimingHeader({ LANE_SERVER_TIMING_HEADER: value })).toBe(false);
    }
  });
});
