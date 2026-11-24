import { readFileSync } from "node:fs";
import { join } from "node:path";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { SignInAgain } from "./sign-in-again";

function source(path: string) {
  return readFileSync(join(process.cwd(), path), "utf8");
}

const PAGE = source("src/app/(app)/intake/page.tsx");
// #271: the (app) layout hands its session-derived workspace to WorkspaceFrame, which mounts the composer.
const LAYOUT = source("src/app/(app)/layout.tsx");
const FRAME = source("src/components/shell/workspace-frame.tsx");
const FRAME_DATA = source("src/lib/data/workspace-frame.ts");
const FORM = source("src/app/(app)/intake/intake-form.tsx");
const SAVE = source("src/app/(app)/intake/intake-save.ts");
const ACTIONS = source("src/app/(app)/intake/actions.ts");
const TRIAGE = source("src/lib/ai/triage.ts");
const TOKEN = source("src/lib/triage-token.ts");
// The draft's scope and age live in the schema-free key module the composer provider also reads.
const DRAFT = source("src/lib/intake-draft.ts") + source("src/lib/intake-draft-key.ts");
const EDIT_FORM = source("src/app/(app)/requests/[id]/edit-request-form.tsx");
const NEW_REQUEST = source("src/components/requests/new-request-provider.tsx");

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
    expect(LAYOUT).toContain("<WorkspaceFrame {...workspace.frame}>");
    expect(FRAME_DATA).toContain("orgId: result.orgId,");
    expect(FRAME).toContain("context={{ orgId }}");
    expect(PAGE).not.toContain("userId:");
    expect(ACTIONS).toContain("guardCanContribute(context.orgId,");
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
    expect(FORM).toContain("Still checking. ${TEXT_KEPT}");
    expect(FORM).toContain("hidden={checking}");
    expect(ACTIONS).toContain("Review unavailable right now. ${TEXT_KEPT}");
    expect(FORM).toContain("loading={creating}");
    expect(FORM).not.toContain("Creating Request…");
    expect(ACTIONS).toContain('"timeout"');
    expect(ACTIONS).toContain('"rate_limited"');
    expect(ACTIONS).toContain('"malformed"');
    expect(ACTIONS).toContain('"review_expired"');
    expect(ACTIONS).toContain('"save_failed"');
    expect(ACTIONS).toContain('"session_expired"');
  });

  it("routes the AI check and save through the shared action boundary", () => {
    expect(FORM).toContain("run: () => callAction(() => editing ? runTriage(");
    expect(SAVE).toContain("return callAction(() => saveRequest(");
  });

  it("returns a person whose session ended to Intake after signing in, with the draft saved as they leave (#397)", () => {
    const html = renderToStaticMarkup(createElement(SignInAgain, { onLeave: () => {} }));
    expect(html).toContain('href="/login?redirect_url=%2Fintake"');
    expect(html).toContain(">Sign in again</a>");
    // The compose step and the review step each offer it, and both save the draft first.
    expect(FORM.match(/<SignInAgain onLeave=\{preserveDraftForSignIn\} \/>/g)).toHaveLength(2);
    expect(FORM).not.toContain("/login");
  });

  it("restores session-scoped drafts without trusting them as identity", () => {
    expect(FRAME_DATA).toContain("userId: result.userId,");
    expect(FRAME).toContain("draftOwnerId={userId}");
    expect(FRAME).toContain("context={{ orgId }}");
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

  it("names the review step's way back for each editor: Back to editing on Edit Request, Edit Request on New Request (#280, B26)", () => {
    const back = /\{editing\?\.backLabel \?\? "([^"]+)"\}<\/Button>/.exec(FORM);
    expect(back?.[1]).toBe("Edit Request");
    expect(EDIT_FORM).toMatch(/editing=\{\{[^}]*backLabel: "Back to editing"/);
    const composer = /<form\.IntakeForm\b[^>]*\/>/.exec(NEW_REQUEST)?.[0];
    expect(composer).toBeDefined();
    expect(composer).not.toContain("editing=");
    expect(composer).not.toContain("backLabel");
    expect(NEW_REQUEST).not.toContain("Back to editing");
  });
});
