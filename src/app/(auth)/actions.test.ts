import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { eq } from "drizzle-orm";
import { db, invites } from "@/db";

const mocks = vi.hoisted(() => ({
  signUp: vi.fn(),
  signInWithPassword: vi.fn(),
  resend: vi.fn(),
  resetPasswordForEmail: vi.fn(),
  getUser: vi.fn(),
  updateUser: vi.fn(),
  signOut: vi.fn(),
  createUser: vi.fn(),
  redirect: vi.fn((target: string) => {
    throw new Error(`REDIRECT:${target}`);
  }),
}));

vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("next/navigation", () => ({ redirect: mocks.redirect }));
vi.mock("@/lib/supabase/server", () => ({
  createClient: vi.fn(async () => ({
    auth: {
      signUp: mocks.signUp,
      signInWithPassword: mocks.signInWithPassword,
      resend: mocks.resend,
      resetPasswordForEmail: mocks.resetPasswordForEmail,
      getUser: mocks.getUser,
      updateUser: mocks.updateUser,
      signOut: mocks.signOut,
    },
  })),
}));
vi.mock("@/lib/supabase/admin", () => ({
  createServiceClient: vi.fn(() => ({
    auth: { admin: { createUser: mocks.createUser } },
  })),
}));

import {
  logoutAndRedirect,
  requestPasswordReset,
  resendSignupConfirmation,
  signup,
  updatePassword,
} from "./actions";

const ORG_ID = "e9e3b28e-f594-4ae1-85d9-bc85e66b5a19";
const VALID_TOKEN = "auth-confirm-valid-invite";
const EXPIRED_TOKEN = "auth-confirm-expired-invite";

function signupForm(email: string) {
  const form = new FormData();
  form.set("email", email);
  form.set("password", "Test1234!");
  form.set("fullName", "Auth Test");
  return form;
}

beforeAll(async () => {
  await db.insert(invites).values([
    {
      orgId: ORG_ID,
      email: "invited-auth@test.local",
      token: VALID_TOKEN,
      role: "member",
      status: "pending",
      expiresAt: new Date(Date.now() + 60_000),
    },
    {
      orgId: ORG_ID,
      email: "expired-auth@test.local",
      token: EXPIRED_TOKEN,
      role: "member",
      status: "pending",
      expiresAt: new Date(Date.now() - 60_000),
    },
  ]);
});

afterAll(async () => {
  await db.delete(invites).where(eq(invites.token, VALID_TOKEN));
  await db.delete(invites).where(eq(invites.token, EXPIRED_TOKEN));
});

beforeEach(() => {
  vi.stubEnv("NEXT_PUBLIC_APP_URL", "http://localhost:3000");
  vi.clearAllMocks();
  mocks.signUp.mockResolvedValue({ data: { session: null }, error: null });
  mocks.signInWithPassword.mockResolvedValue({ data: {}, error: null });
  mocks.resend.mockResolvedValue({ data: {}, error: null });
  mocks.resetPasswordForEmail.mockResolvedValue({ data: {}, error: null });
  mocks.getUser.mockResolvedValue({
    data: { user: { id: "recovering-user" } },
    error: null,
  });
  mocks.updateUser.mockResolvedValue({ data: { user: {} }, error: null });
  mocks.signOut.mockResolvedValue({ error: null });
  mocks.createUser.mockResolvedValue({ data: { user: { id: "new-user" } }, error: null });
});

describe("signup confirmation", () => {
  it("returns the confirmation state for an ordinary unconfirmed signup", async () => {
    const result = await signup(signupForm("new-user@test.local"), "/onboarding");

    expect(result).toEqual({
      confirmationRequired: true,
      email: "new-user@test.local",
      next: "/onboarding",
    });
    expect(mocks.signUp).toHaveBeenCalledWith(
      expect.objectContaining({
        email: "new-user@test.local",
        options: expect.objectContaining({
          emailRedirectTo: expect.stringContaining(
            "/auth/callback?next=%2Fonboarding"
          ),
        }),
      })
    );
  });

  it("keeps working while Supabase autoconfirm remains enabled during rollout", async () => {
    mocks.signUp.mockResolvedValue({ data: { session: { access_token: "test" } }, error: null });

    await expect(signup(signupForm("transition@test.local"))).rejects.toThrow(
      "REDIRECT:/"
    );
  });

  it("pre-confirms only a valid server-verified invite", async () => {
    await expect(
      signup(
        signupForm("invited-auth@test.local"),
        `/invite/${VALID_TOKEN}`
      )
    ).rejects.toThrow(`REDIRECT:/invite/${VALID_TOKEN}`);

    expect(mocks.createUser).toHaveBeenCalledWith(
      expect.objectContaining({
        email: "invited-auth@test.local",
        email_confirm: true,
      })
    );
    expect(mocks.signInWithPassword).toHaveBeenCalled();
    expect(mocks.signUp).not.toHaveBeenCalled();
  });

  it("rejects an invite submitted with a different email", async () => {
    const result = await signup(
      signupForm("attacker@test.local"),
      `/invite/${VALID_TOKEN}`
    );

    expect(result).toHaveProperty("error");
    expect(mocks.createUser).not.toHaveBeenCalled();
    expect(mocks.signUp).not.toHaveBeenCalled();
  });

  it("rejects an expired invite", async () => {
    const result = await signup(
      signupForm("expired-auth@test.local"),
      `/invite/${EXPIRED_TOKEN}`
    );

    expect(result).toHaveProperty("error");
    expect(mocks.createUser).not.toHaveBeenCalled();
  });
});

describe("resendSignupConfirmation", () => {
  it("resends with the safe post-confirmation destination", async () => {
    const result = await resendSignupConfirmation(
      "new-user@test.local",
      "/onboarding"
    );

    expect(result).toEqual({ success: true });
    expect(mocks.resend).toHaveBeenCalledWith({
      type: "signup",
      email: "new-user@test.local",
      options: {
        emailRedirectTo: expect.stringContaining(
          "/auth/callback?next=%2Fonboarding"
        ),
      },
    });
  });
});

describe("password recovery", () => {
  it("sends the reset email back through the secure auth callback", async () => {
    const form = new FormData();
    form.set("email", " Person@Test.Local ");

    const result = await requestPasswordReset(form);

    expect(result).toEqual({
      success: true,
      email: "person@test.local",
    });
    expect(mocks.resetPasswordForEmail).toHaveBeenCalledWith(
      "person@test.local",
      {
        redirectTo: expect.stringContaining(
          "/auth/callback?next=%2Freset-password"
        ),
      }
    );
  });

  it("returns the same public response when the provider rejects a request", async () => {
    const warning = vi.spyOn(console, "warn").mockImplementation(() => {});
    mocks.resetPasswordForEmail.mockResolvedValue({
      data: {},
      error: { code: "over_email_send_rate_limit", status: 429 },
    });
    const form = new FormData();
    form.set("email", "person@test.local");

    const result = await requestPasswordReset(form);

    expect(result).toEqual({
      success: true,
      email: "person@test.local",
    });
    expect(warning).toHaveBeenCalledWith(
      "Password reset email request failed",
      { code: "over_email_send_rate_limit", status: 429 }
    );
    warning.mockRestore();
  });

  it("validates the email before calling the provider", async () => {
    const form = new FormData();
    form.set("email", "not-an-email");

    const result = await requestPasswordReset(form);

    expect(result).toEqual({ error: "Please enter a valid email address" });
    expect(mocks.resetPasswordForEmail).not.toHaveBeenCalled();
  });

  it("rejects passwords that do not match", async () => {
    const form = new FormData();
    form.set("password", "LongEnough1!");
    form.set("confirmPassword", "Different1!");

    const result = await updatePassword(form);

    expect(result).toEqual({ error: "Passwords do not match" });
    expect(mocks.updateUser).not.toHaveBeenCalled();
  });

  it("rejects an invalid or expired recovery session", async () => {
    mocks.getUser.mockResolvedValue({ data: { user: null }, error: null });
    const form = new FormData();
    form.set("password", "LongEnough1!");
    form.set("confirmPassword", "LongEnough1!");

    const result = await updatePassword(form);

    expect(result).toEqual({
      error: "This reset link is invalid or has expired. Request a new one.",
    });
    expect(mocks.updateUser).not.toHaveBeenCalled();
  });

  it("updates the password, signs out, and returns to sign in", async () => {
    const form = new FormData();
    form.set("password", "LongEnough1!");
    form.set("confirmPassword", "LongEnough1!");

    await expect(updatePassword(form)).rejects.toThrow(
      "REDIRECT:/login?reset=success"
    );

    expect(mocks.updateUser).toHaveBeenCalledWith({
      password: "LongEnough1!",
    });
    expect(mocks.signOut).toHaveBeenCalledOnce();
  });
});

describe("logoutAndRedirect", () => {
  it("signs out and returns to a safe invite path", async () => {
    await expect(
      logoutAndRedirect(`/invite/${VALID_TOKEN}`)
    ).rejects.toThrow(`REDIRECT:/invite/${VALID_TOKEN}`);

    expect(mocks.signOut).toHaveBeenCalledOnce();
  });

  it("rejects an external post-logout destination", async () => {
    await expect(
      logoutAndRedirect("https://attacker.example/invite")
    ).rejects.toThrow("REDIRECT:/");
  });
});
