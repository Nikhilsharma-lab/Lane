import { describe, expect, it, vi } from "vitest";

import { createPasswordRecoveryFlow, recoveryErrorField, recoveryInputErrors } from "./password-recovery-flow";

function signIn(result = { status: "complete", createdSessionId: "session_fixture" as string | null }) {
  return {
    create: vi.fn(async () => ({ status: "needs_first_factor", createdSessionId: null })),
    attemptFirstFactor: vi.fn(async () => result),
  };
}

describe("password recovery boundaries", () => {
  it("sends one code while duplicate calls and the resend cooldown are blocked", async () => {
    let now = 0;
    let finishSend!: () => void;
    const provider = signIn();
    provider.create.mockImplementationOnce(() => new Promise((resolve) => {
      finishSend = () => resolve({ status: "needs_first_factor", createdSessionId: null });
    }));
    const flow = createPasswordRecoveryFlow(() => now);
    const first = flow.sendCode(provider, " fixture@example.com ");
    expect(await flow.sendCode(provider, "fixture@example.com")).toBe(false);
    finishSend();
    expect(await first).toBe(true);
    expect(provider.create).toHaveBeenCalledWith({ strategy: "reset_password_email_code", identifier: "fixture@example.com" });
    expect(flow.snapshot().step).toBe("code");
    expect(await flow.sendCode(provider, "fixture@example.com")).toBe(false);
    now = 30_000;
    expect(await flow.sendCode(provider, "fixture@example.com")).toBe(true);
    expect(provider.create).toHaveBeenCalledTimes(2);
  });

  it("changing email restarts the form but cannot bypass the send cooldown", async () => {
    const flow = createPasswordRecoveryFlow(() => 0);
    const provider = signIn();
    await flow.sendCode(provider, "fixture@example.com");
    expect(flow.changeEmail()).toBe(true);
    expect(flow.snapshot().step).toBe("request");
    expect(await flow.sendCode(provider, "other@example.com")).toBe(false);
    expect(provider.create).toHaveBeenCalledTimes(1);
  });

  // D12 (#290): the cooldown starts only once a code was sent.
  it("leaves Send usable at once after a send that sent no code", async () => {
    const provider = signIn();
    provider.create.mockRejectedValueOnce(new Error("offline"));
    const flow = createPasswordRecoveryFlow(() => 0);
    await expect(flow.sendCode(provider, "fixture@example.com")).rejects.toThrow("offline");
    expect(flow.snapshot()).toMatchObject({ step: "request", nextSendAt: 0 });
    expect(await flow.sendCode(provider, "fixture@example.com")).toBe(true);
    expect(provider.create).toHaveBeenCalledTimes(2);
  });

  it("lets someone try another address straight after Couldn't find your account", async () => {
    const provider = signIn();
    const notFound = { errors: [{ code: "form_identifier_not_found", longMessage: "Couldn't find your account.", meta: { paramName: "identifier" } }] };
    provider.create.mockRejectedValueOnce(notFound);
    const flow = createPasswordRecoveryFlow(() => 0);
    await expect(flow.sendCode(provider, "typo@example.com")).rejects.toBe(notFound);
    expect(recoveryErrorField(notFound)).toBe("email");
    expect(flow.snapshot()).toMatchObject({ step: "request", nextSendAt: 0 });
    expect(await flow.sendCode(provider, "fixture@example.com")).toBe(true);
    expect(flow.snapshot()).toMatchObject({ step: "code", nextSendAt: 30_000 });
  });

  it("starts no cooldown when the send hands over to Clerk instead of sending a code", async () => {
    const provider = signIn();
    provider.create.mockResolvedValueOnce({ status: "needs_protect_check", createdSessionId: null });
    const flow = createPasswordRecoveryFlow(() => 0);
    await flow.sendCode(provider, "fixture@example.com");
    expect(flow.snapshot().nextSendAt).toBe(0);
  });

  it("hands a send-time security challenge to the managed Clerk flow", async () => {
    const provider = signIn();
    provider.create.mockResolvedValueOnce({ status: "needs_protect_check", createdSessionId: null });
    const flow = createPasswordRecoveryFlow();
    await flow.sendCode(provider, "fixture@example.com");
    expect(flow.snapshot()).toMatchObject({ step: "continue", continuationUrl: "/login#/protect-check" });
  });

  it("keeps an expired-code failure recoverable by sending a fresh code", async () => {
    let now = 0;
    const provider = signIn();
    const flow = createPasswordRecoveryFlow(() => now);
    await flow.sendCode(provider, "fixture@example.com");
    provider.attemptFirstFactor.mockRejectedValueOnce({ errors: [{ code: "form_code_expired" }] });
    await expect(flow.verify(provider, { code: "expired", password: "fixture-only" })).rejects.toMatchObject({ errors: [{ code: "form_code_expired" }] });
    expect(flow.snapshot().step).toBe("code");
    now = 30_000;
    expect(await flow.sendCode(provider, "fixture@example.com")).toBe(true);
  });

  it("retains the code step after a weak-password error and prevents concurrent verification", async () => {
    const provider = signIn();
    const flow = createPasswordRecoveryFlow();
    await flow.sendCode(provider, "fixture@example.com");
    let reject!: (error: unknown) => void;
    provider.attemptFirstFactor.mockImplementationOnce(() => new Promise((_, rejectPromise) => { reject = rejectPromise; }));
    const first = flow.verify(provider, { code: "fixture", password: "weak" });
    expect(await flow.verify(provider, { code: "fixture", password: "weak" })).toBe(false);
    expect(flow.changeEmail()).toBe(false);
    reject({ errors: [{ code: "form_password_length_too_short" }] });
    await expect(first).rejects.toMatchObject({ errors: [{ code: "form_password_length_too_short" }] });
    expect(flow.snapshot().step).toBe("code");
  });

  it.each([
    ["needs_second_factor", "/login#/factor-two"],
    ["needs_client_trust", "/login#/client-trust"],
    ["needs_new_password", "/login#/reset-password"],
    ["needs_protect_check", "/login#/protect-check"],
    ["needs_first_factor", "/login#/factor-one"],
    ["unexpected_future_status", "/login"],
    ["complete", "/login"],
  ])("hands %s to Clerk without activating an incomplete session", async (status, destination) => {
    const flow = createPasswordRecoveryFlow();
    const provider = signIn({ status, createdSessionId: null });
    await flow.sendCode(provider, "fixture@example.com");
    await flow.verify(provider, { code: "fixture", password: "fixture-only" });
    expect(flow.snapshot()).toMatchObject({ step: "continue", continuationUrl: destination });
    const activate = vi.fn();
    await expect(flow.finish(activate, vi.fn())).resolves.toBe(false);
    expect(activate).not.toHaveBeenCalled();
  });

  it("retries only activation after a successful password reset, without consuming the code again", async () => {
    const flow = createPasswordRecoveryFlow();
    const provider = signIn();
    await flow.sendCode(provider, "fixture@example.com");
    await flow.verify(provider, { code: "fixture", password: "fixture-only" });
    const navigate = vi.fn();
    const activate = vi.fn().mockRejectedValueOnce(new Error("offline")).mockImplementationOnce(async ({ navigate: onNavigate }) => {
      await onNavigate({ session: { currentTask: null }, decorateUrl: (path: string) => path });
    });
    await expect(flow.finish(activate, navigate)).rejects.toThrow("offline");
    expect(flow.snapshot().step).toBe("activate");
    await flow.finish(activate, navigate);
    expect(provider.attemptFirstFactor).toHaveBeenCalledTimes(1);
    expect(activate).toHaveBeenLastCalledWith(expect.objectContaining({ session: "session_fixture" }));
    expect(navigate).toHaveBeenCalledWith("/");
    expect(JSON.stringify(flow.snapshot())).not.toContain("fixture-only");
  });

  it("honors pending session tasks and Clerk's decorated navigation URL", async () => {
    const flow = createPasswordRecoveryFlow();
    const provider = signIn();
    await flow.sendCode(provider, "fixture@example.com");
    await flow.verify(provider, { code: "fixture", password: "fixture-only" });
    const navigate = vi.fn();
    await flow.finish(async ({ navigate: onNavigate }) => {
      await onNavigate({ session: { currentTask: { key: "choose-organization" } }, decorateUrl: (path) => `https://auth.example.invalid/decorated?return=${path}` });
    }, navigate);
    expect(navigate).toHaveBeenCalledWith("https://auth.example.invalid/decorated?return=/login#/tasks");
  });

  it("does not allow changing identity while activation is pending", async () => {
    const flow = createPasswordRecoveryFlow();
    const provider = signIn();
    await flow.sendCode(provider, "fixture@example.com");
    await flow.verify(provider, { code: "fixture", password: "fixture-only" });
    expect(flow.changeEmail()).toBe(false);
    expect(await flow.sendCode(provider, "other@example.com")).toBe(false);
  });

  it("prevents duplicate activation while the provider is pending", async () => {
    const flow = createPasswordRecoveryFlow();
    const provider = signIn();
    await flow.sendCode(provider, "fixture@example.com");
    await flow.verify(provider, { code: "fixture", password: "fixture-only" });
    let resolve!: () => void;
    const activate = vi.fn(() => new Promise<void>((finish) => { resolve = finish; }));
    const first = flow.finish(activate, vi.fn());
    expect(await flow.finish(activate, vi.fn())).toBe(false);
    resolve();
    await first;
    expect(activate).toHaveBeenCalledTimes(1);
  });
});

// D11, D16 (#290): Lane's own recovery form says what to fix on the field.
describe("password recovery field messages", () => {
  it.each([
    ["", "Enter an email address."],
    ["   ", "Enter an email address."],
    ["not-an-email", "Enter a valid email address."],
    ["name@", "Enter a valid email address."],
    ["two words@example.com", "Enter a valid email address."],
  ])("refuses the address %j with %j", (email, message) => {
    expect(recoveryInputErrors("request", { email, code: "", password: "" })).toEqual({ email: message });
  });

  it("accepts an address in the email format, with spaces around it", () => {
    expect(recoveryInputErrors("request", { email: " fixture@example.com ", code: "", password: "" })).toEqual({});
  });

  it("asks for the code and the new password on the code step", () => {
    expect(recoveryInputErrors("code", { email: "fixture@example.com", code: " ", password: "" }))
      .toEqual({ code: "Enter the reset code.", password: "Enter a new password." });
    expect(recoveryInputErrors("code", { email: "", code: "123456", password: "fixture-only" })).toEqual({});
  });

  it.each([
    ["identifier", "email"],
    ["email_address", "email"],
    ["code", "code"],
    ["password", "password"],
  ])("puts a Clerk error about %s on the %s field", (paramName, field) => {
    expect(recoveryErrorField({ errors: [{ code: "any", meta: { paramName } }] })).toBe(field);
  });

  it.each([[new Error("offline")], [{ errors: [{ code: "too_many_requests" }] }], [null], ["text"]])("leaves %j off the fields", (error) => {
    expect(recoveryErrorField(error)).toBeNull();
  });
});
