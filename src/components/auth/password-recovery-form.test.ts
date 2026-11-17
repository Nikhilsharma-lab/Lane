import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { createPasswordRecoveryFlow } from "./password-recovery-flow";
import { PasswordRecoveryForm } from "./password-recovery-form";
import { PasswordRecoveryView, type PasswordRecoveryViewProps } from "./password-recovery-view";

vi.mock("@clerk/nextjs/legacy", () => ({
  useSignIn: () => ({ isLoaded: true, signIn: {}, setActive: vi.fn() }),
}));
vi.mock("next/navigation", () => ({ useRouter: () => ({ replace: vi.fn() }) }));
vi.mock("./password-recovery-flow", () => ({ createPasswordRecoveryFlow: vi.fn() }));

const actual = await vi.importActual<typeof import("./password-recovery-flow")>("./password-recovery-flow");
const provider = {
  create: async () => ({ status: "needs_first_factor", createdSessionId: null }),
  attemptFirstFactor: async () => ({ status: "complete", createdSessionId: "fixture" }),
};

describe("password recovery screen states", () => {
  let flow: ReturnType<typeof actual.createPasswordRecoveryFlow>;

  beforeEach(() => {
    flow = actual.createPasswordRecoveryFlow();
    vi.mocked(createPasswordRecoveryFlow).mockReturnValue(flow);
  });

  // D11 (#290): Lane's own form says empty and bad-format input on the field, so the browser's tooltip is off.
  it("requests a required email, checked by Lane rather than the browser, and no password", () => {
    const html = renderToStaticMarkup(createElement(PasswordRecoveryForm));
    expect(html).toContain('type="email"');
    expect(html).toContain('required=""');
    expect(html).toContain('noValidate=""');
    expect(html).toContain("Send reset code");
    expect(html).not.toContain('name="password"');
  });

  it("renders code/password fields and distinct resend/change-email controls", async () => {
    await flow.sendCode(provider, "fixture@example.com");
    const html = renderToStaticMarkup(createElement(PasswordRecoveryForm));
    expect(html).toContain('autoComplete="one-time-code"');
    expect(html).toContain('autoComplete="new-password"');
    expect(html).toContain("Save new password");
    expect(html).toContain("Resend code in 30s");
    // D12 (#290): the seconds are on screen only; the button's name stays the action.
    expect(html).toContain('<span aria-hidden="true">Resend code in 30s</span><span class="sr-only">Resend code</span>');
    expect(html).toContain("Change email");
    expect(html).not.toContain('type="email"');
  });

  it("removes code/password fields when activation alone needs retrying", async () => {
    await flow.sendCode(provider, "fixture@example.com");
    await flow.verify(provider, { code: "fixture", password: "fixture-only" });
    const html = renderToStaticMarkup(createElement(PasswordRecoveryForm));
    expect(html).toContain("Your password has been updated.");
    expect(html).toContain("Continue");
    expect(html).not.toContain('name="password"');
    expect(html).not.toContain('name="code"');
    expect(html).not.toContain("Resend code");
  });

  it("offers managed verification rather than claiming MFA is complete", async () => {
    await flow.sendCode(provider, "fixture@example.com");
    await flow.verify({
      ...provider,
      attemptFirstFactor: async () => ({ status: "needs_second_factor", createdSessionId: null }),
    }, { code: "fixture", password: "fixture-only" });
    const html = renderToStaticMarkup(createElement(PasswordRecoveryForm));
    expect(html).toContain("Continue verification");
    expect(html).toContain("remaining security checks");
    expect(html).not.toContain("password has been updated");
    expect(html).not.toContain('name="password"');
  });
});

// D16, D12 (#290): an error sits on its field, and a send that sent nothing leaves the button usable.
describe("password recovery field errors", () => {
  const view = (props: Partial<PasswordRecoveryViewProps>) => renderToStaticMarkup(createElement(PasswordRecoveryView, {
    step: "request", email: "typo@example.com", code: "", password: "", error: null, fieldErrors: {}, notice: null,
    coolingDown: false, sending: false, pending: false, isLoaded: true, resendIn: 0,
    setEmail: () => {}, setCode: () => {}, setPassword: () => {}, performAction: async () => {}, onChangeEmail: () => {},
    ...props,
  }));

  it("ties Couldn't find your account to the email field, marked invalid, with Send still usable", () => {
    const html = view({ fieldErrors: { email: "Couldn't find your account." } });
    expect(html).toMatch(/<input[^>]*id="recovery-email"[^>]*aria-invalid="true"[^>]*aria-describedby="recovery-email-error"/);
    expect(html).toMatch(/id="recovery-email-error"[^>]*role="alert"/);
    expect(html).toContain("Couldn&#x27;t find your account.");
    // The field's message is the only alert: no boxed one under the field as well.
    expect(html.match(/role="alert"/g)).toHaveLength(1);
    expect(html).toMatch(/<button(?![^>]*disabled)[^>]*type="submit"/);
    expect(html).toContain(">Send reset code<");
  });

  it("keeps an error with no field, such as a lost connection, in the box under the fields", () => {
    const html = view({ error: "Couldn’t complete the password reset. Try again." });
    expect(html).not.toContain('aria-invalid="true"');
    expect(html).toContain("Couldn’t complete the password reset. Try again.");
  });

  it("puts the code and password messages on their fields", () => {
    const html = view({ step: "code", fieldErrors: { code: "Enter the reset code.", password: "Enter a new password." } });
    expect(html).toMatch(/id="recovery-code"[^>]*aria-invalid="true"[^>]*aria-describedby="recovery-code-error"/);
    expect(html).toMatch(/<input(?=[^>]*id="recovery-password")(?=[^>]*aria-invalid="true")(?=[^>]*aria-describedby="recovery-password-error")/);
    expect(html).toMatch(/id="recovery-password-error"[^>]*role="alert"/);
    expect(html).toContain("Enter a new password.");
  });

  it("announces the end of the resend wait once, and nothing while it counts", () => {
    const status = (html: string) => html.match(/<p role="status" class="sr-only">(.*?)<\/p>/)?.[1];
    expect(status(view({ step: "code", coolingDown: true, resendIn: 12 }))).toBe("");
    expect(status(view({ step: "code", coolingDown: true, resendIn: 0 }))).toBe("You can send a new code now.");
    expect(status(view({ step: "request", coolingDown: false, resendIn: 0 }))).toBe("");
  });
});
