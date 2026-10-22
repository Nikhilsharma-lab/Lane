import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

function source(path: string) {
  return readFileSync(join(process.cwd(), path), "utf8");
}

const PAGE = source("src/app/(app)/intake/page.tsx");
const LAYOUT = source("src/app/(app)/layout.tsx");
const FORM = source("src/app/(app)/intake/intake-form.tsx");
const ACTIONS = source("src/app/(app)/intake/actions.ts");
const TRIAGE = source("src/lib/ai/triage.ts");
const TOKEN = source("src/lib/triage-token.ts");
// The draft's scope and age live in the schema-free key module the composer provider also reads.
const DRAFT = source("src/lib/intake-draft.ts") + source("src/lib/intake-draft-key.ts");

describe("Intake Gate contract", () => {
  it("uses shared icons without custom SVG markup", () => {
    expect(FORM).not.toContain("<svg");
    expect(FORM).not.toContain("SparklesIcon");
  });

  it("checks reworded framing with the rule the save uses, beside its field", () => {
    expect(FORM).toContain("savedFraming(storedShape(");
    expect(FORM).toContain('error={framingError?.field === "reframedProblem"');
    expect(FORM).toContain('error={framingError?.field === "extractedSolution"');
    expect(ACTIONS).toContain("savedFraming(framingShape(payload.classification)");
  });

  it("preserves source content and never resets the review with Escape", () => {
    expect(FORM).toContain("Your original Request");
    expect(FORM).toContain("Suggested change");
    expect(FORM).not.toContain('event.key === "Escape"');
    expect(FORM).not.toContain("Start over");
  });

  it("derives identity from the session and binds review state to context", () => {
    expect(LAYOUT).toContain('context={{ orgId: result.orgId }}');
    expect(PAGE).not.toContain("userId:");
    expect(ACTIONS).toContain("requireActiveMember(context.orgId)");
    expect(ACTIONS).toContain("userId: auth.userId");
    expect(TOKEN).toContain("requestId: existingRequestId ?? randomUUID()");
    expect(TOKEN).toContain('purpose: existingRequestId ? "edit" : "create"');
    expect(TOKEN).toContain("orgId: context.orgId");
    expect(TOKEN).toContain("userId: context.userId");
    expect(ACTIONS).toContain("onConflictDoNothing");
  });

  it("bounds AI output to the three approved gate values", () => {
    expect(TRIAGE).toContain("GENERATED_TEXT_MAX");
    expect(TRIAGE).toContain("Return only the required structured result");
    expect(TRIAGE).not.toContain("qualityScore");
    expect(TRIAGE).not.toContain("qualityFlags");
    expect(TRIAGE).not.toContain("suggestions:");
  });

  it("keeps loading and recovery states explicit and accessible", () => {
    expect(FORM).toContain("aria-busy");
    expect(FORM).toContain('role="status"');
    expect(FORM).toContain("loading={checking}");
    expect(FORM).toContain("Checking whether this describes a problem…");
    expect(FORM).toContain("Still checking. Your draft is kept.");
    expect(FORM).toContain("hidden={checking}");
    expect(ACTIONS).toContain("Review unavailable right now. Your draft is kept.");
    expect(FORM).toContain("Creating Request…");
    expect(ACTIONS).toContain('"timeout"');
    expect(ACTIONS).toContain('"rate_limited"');
    expect(ACTIONS).toContain('"malformed"');
    expect(ACTIONS).toContain('"review_expired"');
    expect(ACTIONS).toContain('"save_failed"');
    expect(ACTIONS).toContain('"session_expired"');
  });

  it("retries an ended session once with a fresh token before asking for sign-in", () => {
    expect(FORM).toContain("await refreshClerkToken()");
    expect(FORM.match(/error\.code (?:===|!==) "session_expired"/g)?.length).toBeGreaterThanOrEqual(2);
  });

  it("restores session-scoped drafts without trusting them as identity", () => {
    expect(LAYOUT).toContain("draftOwnerId={result.userId}");
    expect(LAYOUT).toContain("context={{ orgId: result.orgId }}");
    expect(FORM).toContain("window.sessionStorage");
    expect(FORM).toContain("readIntakeDraft");
    expect(FORM).toContain("writeIntakeDraft");
    expect(FORM).toContain("clearIntakeDraft");
    expect(FORM).toContain("Your review was restored.");
    expect(FORM).not.toContain("redirectTo=/intake");
    expect(DRAFT).toContain("userId: string, orgId: string");
    expect(DRAFT).toContain("24 * 60 * 60 * 1000");
    expect(DRAFT).not.toContain("localStorage");
  });
});
