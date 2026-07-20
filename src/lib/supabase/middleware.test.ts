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

describe("session continuation", () => {
  it("keeps a protected path and query for sign-in recovery", async () => {
    const response = await updateSession(
      new NextRequest(
        "http://localhost:3000/requests/6e114cf0-6902-44c9-b57b-49d298d7c254?status=open"
      )
    );

    expect(response.headers.get("location")).toBe(
      "http://localhost:3000/login?next=%2Frequests%2F6e114cf0-6902-44c9-b57b-49d298d7c254%3Fstatus%3Dopen"
    );
  });

  it("keeps Intake as the recovery target for an expired action", async () => {
    const response = await updateSession(
      new NextRequest("http://localhost:3000/intake", { method: "POST" })
    );

    expect(response.headers.get("location")).toBe(
      "http://localhost:3000/login?next=%2Fintake"
    );
  });

  it("continues a signed-in person to the safe requested route", async () => {
    mocks.getUser.mockResolvedValue({
      data: { user: { id: "signed-in-user" } },
      error: null,
    });

    const response = await updateSession(
      new NextRequest(
        "http://localhost:3000/login?next=%2Frequests%2F6e114cf0-6902-44c9-b57b-49d298d7c254%3Fstatus%3Dopen"
      )
    );

    expect(response.headers.get("location")).toBe(
      "http://localhost:3000/requests/6e114cf0-6902-44c9-b57b-49d298d7c254?status=open"
    );
  });

  it.each([
    "https%3A%2F%2Fevil.example",
    "%2F%2Fevil.example",
    "%2Flogin",
    "%2Fsignup%3Fnext%3D%252Fintake",
  ])("returns home instead of following unsafe next target %s", async (next) => {
    mocks.getUser.mockResolvedValue({
      data: { user: { id: "signed-in-user" } },
      error: null,
    });

    const response = await updateSession(
      new NextRequest(`http://localhost:3000/login?next=${next}`)
    );

    expect(response.headers.get("location")).toBe("http://localhost:3000/");
  });
});
