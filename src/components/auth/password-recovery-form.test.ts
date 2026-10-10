import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { createPasswordRecoveryFlow } from "./password-recovery-flow";
import { PasswordRecoveryForm } from "./password-recovery-form";

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

  it("requests a required email with native form validation and no password", () => {
    const html = renderToStaticMarkup(createElement(PasswordRecoveryForm));
    expect(html).toContain('type="email"');
    expect(html).toContain('required=""');
    expect(html).not.toContain("novalidate");
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
