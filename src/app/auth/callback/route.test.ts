import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  exchangeCodeForSession: vi.fn(),
}));

vi.mock("@/lib/supabase/server", () => ({
  createClient: vi.fn(async () => ({
    auth: { exchangeCodeForSession: mocks.exchangeCodeForSession },
  })),
}));

import { GET } from "./route";

beforeEach(() => {
  vi.clearAllMocks();
  mocks.exchangeCodeForSession.mockResolvedValue({ error: null });
});

describe("auth callback", () => {
  it("exchanges a recovery code and opens the reset page", async () => {
    const response = await GET(
      new Request(
        "http://localhost:3000/auth/callback?code=recovery-code&next=%2Freset-password"
      )
    );

    expect(mocks.exchangeCodeForSession).toHaveBeenCalledWith("recovery-code");
    expect(response.headers.get("location")).toBe(
      "http://localhost:3000/reset-password"
    );
  });

  it("sends an invalid recovery code to the expired-link state", async () => {
    mocks.exchangeCodeForSession.mockResolvedValue({
      error: { code: "bad_code" },
    });

    const response = await GET(
      new Request(
        "http://localhost:3000/auth/callback?code=expired-code&next=%2Freset-password"
      )
    );

    expect(response.headers.get("location")).toBe(
      "http://localhost:3000/reset-password?error=invalid-link"
    );
  });
});
