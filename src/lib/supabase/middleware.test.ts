import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const mocks = vi.hoisted(() => ({
  getUser: vi.fn(),
}));

vi.mock("@supabase/ssr", () => ({
  createServerClient: vi.fn(() => ({
    auth: { getUser: mocks.getUser },
  })),
}));

import { updateSession } from "./middleware";

beforeEach(() => {
  vi.clearAllMocks();
  mocks.getUser.mockResolvedValue({ data: { user: null }, error: null });
});

describe("recovery route access", () => {
  it.each(["/forgot-password", "/reset-password?error=invalid-link"])(
    "keeps %s public for signed-out users",
    async (path) => {
      const response = await updateSession(
        new NextRequest(`http://localhost:3000${path}`)
      );

      expect(response.headers.get("location")).toBeNull();
      expect(response.status).toBe(200);
    }
  );
});
