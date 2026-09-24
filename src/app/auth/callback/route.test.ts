import { describe, expect, it } from "vitest";

import { GET } from "./route";

describe("auth callback", () => {
  it("retires the old Supabase callback at the app root", async () => {
    const response = await GET(
      new Request(
        "http://localhost:3000/auth/callback?code=legacy-code&next=%2Freset-password"
      )
    );

    expect(response.headers.get("location")).toBe("http://localhost:3000/");
  });
});
