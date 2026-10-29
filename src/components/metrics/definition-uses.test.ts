import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { buildDefinitionUses, type ImpactDefinition, type ImpactRow } from "@/lib/impact-read-model";
import type { ExpectedImpact } from "@/lib/request-impact";
import type { OutcomeClosure, OutcomeException } from "@/lib/request-outcome";
import type { ReleaseFact, ReleaseState } from "@/lib/request-release";
import { DefinitionUsesList } from "./definition-uses";

// Dates read "24 Oct" in the current year and "24 Oct 2025" in others (#261): pin the year these fixtures are in.
beforeAll(() => { vi.useFakeTimers({ toFake: ["Date"], now: new Date("2026-10-23T12:00:00.000Z") }); });
afterAll(() => { vi.useRealTimers(); });

// #203: a Metric definition's page lists the Requests that used it, from the Impact read model.
const ORG = "org_uses";
const ME = "user_me";
const NOW = new Date("2026-10-23T12:00:00.000Z");
const TRIALS: ImpactDefinition = { position: 0, id: "def-trials", name: "Trials started", unit: "count" };
const ORDERS: ImpactDefinition = { position: 0, id: "def-orders", name: "Orders", unit: "count" };

const measurement = { audience: "all", platform: "all", windowDays: 30, exactDates: false, startDate: "", endDate: "" } as const;
const plan = (guardrailLimit?: number): ExpectedImpact => ({
  kind: "measurement", version: 4, measurement,
  primary: { key: "events", name: "", unit: "count", current: 100, target: 150, noBaseline: false, check: "" },
  guardrails: guardrailLimit === undefined ? [] : [{ key: "events", name: "", unit: "count", current: 10, noBaseline: false, operator: "at_most", limit: guardrailLimit }],
} as ExpectedImpact);
const AUG: ReleaseFact = { exposureDate: "2026-08-10", audience: "all", evidence: "Released", dueDate: "2026-09-09", startDate: "2026-08-10", windowKind: "relative" };
const OCT: ReleaseFact = { exposureDate: "2026-10-01", audience: "all", evidence: "Released", dueDate: "2026-10-31", startDate: "2026-10-01", windowKind: "relative" };
const released = (release: ReleaseFact): ReleaseState => ({ version: 1, ownerId: ME, release, history: [] });
function closure(expected: ExpectedImpact, actual: number, guardrailActual?: number): OutcomeClosure {
  return {
    version: 1, kind: "measured", actorId: ME, ownerId: ME, closedAt: "2026-09-10T09:00:00.000Z", operationId: `op-${actual}`, fingerprint: "fp",
    expected, release: AUG, primary: { kind: "numeric", actual, unit: "count" },
    guardrails: guardrailActual === undefined ? [] : [{ metric: "Action count", operator: "at_most", limit: 20, unit: "count", actual: guardrailActual }],
    evidence: `Export ${actual}`, observedFrom: AUG.startDate, observedTo: AUG.dueDate, revision: 1,
  };
}
const exception: OutcomeException = { version: 1, kind: "exception", reasonCode: "rolled_back", reason: "Rolled back after a day", actorId: ME, ownerId: ME, closedAt: "2026-09-10T09:00:00.000Z", operationId: "op-x", fingerprint: "fp", release: AUG, revision: 1 };
function row(id: string, requestNumber: number, over: Partial<ImpactRow> = {}): ImpactRow {
  return {
    id, orgId: ORG, requestNumber, title: `Request ${requestNumber}`, problem: `Problem ${requestNumber}`, createdBy: ME, takenOnBy: null, assignedTo: null, projectId: null, projectName: null, status: "open",
    releaseState: null, outcomeClosure: null, exceptionClosure: null, closureCorrections: [], expectedImpact: plan(), noMeasurableImpactReason: null,
    followUpOf: null, definitions: [TRIALS], createdAt: new Date(Date.UTC(2026, 0, requestNumber)), sameProblemGroup: null, ...over,
  };
}
const render = (rows: ImpactRow[]) => renderToStaticMarkup(createElement(DefinitionUsesList, { uses: buildDefinitionUses({ userId: ME, orgId: ORG, role: "member" }, rows, TRIALS.id, { now: NOW })! }));
const text = (html: string) => html.replace(/<[^>]+>/g, " ").replace(/&#x27;|&#39;/g, "'").replace(/&amp;/g, "&").replace(/\s+/g, " ").trim();
const items = (html: string) => [...html.matchAll(/<li\b[\s\S]*?<\/li>/g)].map(match => text(match[0]));

describe("Requests that used a Metric definition", () => {
  it("groups main-metric uses by Project, each with predicted and actual side by side", () => {
    const html = render([
      row("a", 1, { projectId: "p1", projectName: "Growth", status: "done", releaseState: released(AUG), outcomeClosure: closure(plan(), 130) }),
      row("b", 2),
    ]);
    expect(html).toMatch(/<section aria-labelledby="definition-uses-main"><h4 id="definition-uses-main"[^>]*>As the main metric/);
    expect(text(html)).toContain("As the main metric 2 Requests");
    expect(html).toContain('aria-label="Growth, as the main metric"');
    expect(html).toContain('aria-label="No Project, as the main metric"');
    const [measured, waiting] = items(html);
    expect(measured).toMatch(/^LAN-1 Request 1 Closed Goal 150 \(from 100\) Actual 130 Change \+30$/);
    expect(html).toMatch(/<a[^>]*href="\/requests\/a"/);
    expect(waiting).toContain("Actual Still due (not released yet)");
  });

  it("shows a still-due result as still due with its due date, never as zero, and a closed-without-result reason", () => {
    const html = render([
      row("a", 1, { status: "done", releaseState: released(OCT) }),
      row("b", 2, { status: "done", releaseState: released(AUG), exceptionClosure: exception }),
    ]);
    const [due, closed] = items(html);
    expect(due).toContain("Actual Still due (Due in 8 days, 31 Oct)");
    expect(due).not.toMatch(/Actual 0|Change/);
    expect(closed).toContain("Actual Closed without a result: Rolled back after a day");
  });

  it("lists guardrail uses separately, each limit beside what was measured", () => {
    const html = render([
      row("a", 1, { definitions: [ORDERS, { ...TRIALS, position: 1 }], expectedImpact: plan(20), status: "done", releaseState: released(AUG), outcomeClosure: closure(plan(20), 50, 25) }),
    ]);
    expect(text(html)).toContain("As the main metric Not used as the main metric yet.");
    expect(html).toMatch(/<section aria-labelledby="definition-uses-guardrails"><h4 id="definition-uses-guardrails"[^>]*>As a guardrail/);
    const [guardrail] = items(html);
    expect(guardrail).toMatch(/^LAN-1 Request 1 Closed Guarding Orders Limit At or below 20 Measured 25, outside the limit$/);
  });

  it("explains a definition no Request has used yet", () => {
    const html = render([row("a", 1, { definitions: [ORDERS] })]);
    expect(text(html)).toContain("No Requests have used this metric yet");
    expect(html).not.toContain("As the main metric");
  });
});
