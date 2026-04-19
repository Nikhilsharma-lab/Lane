/**
 * Regression tests for cron request authorization.
 *
 * Bug: all four cron routes (alerts, weekly-digest, resurface, morning-briefing)
 * would authorize any request when CRON_SECRET was unset — either by skipping
 * the guard entirely (`if (cronSecret && ...)`) or by comparing against the
 * literal string `"Bearer undefined"` which a caller can trivially send.
 *
 * Fix: `isCronRequestAuthorized` fails closed — no secret means no access.
 */

import { describe, it, expect } from "vitest";
import { isCronRequestAuthorized } from "@/lib/cron/auth";

describe("isCronRequestAuthorized", () => {
  describe("when CRON_SECRET is not configured", () => {
    it("rejects requests with no auth header", () => {
      expect(isCronRequestAuthorized(null, undefined)).toBe(false);
    });

    it("rejects requests with a bearer header (fail closed)", () => {
      expect(isCronRequestAuthorized("Bearer anything", undefined)).toBe(false);
    });

    it("rejects the literal 'Bearer undefined' string", () => {
      // Attacker reads the old code and sends the exact template-literal output.
      expect(isCronRequestAuthorized("Bearer undefined", undefined)).toBe(false);
    });

    it("treats empty string secret the same as missing", () => {
      expect(isCronRequestAuthorized("Bearer ", "")).toBe(false);
    });
  });

  describe("when CRON_SECRET is configured", () => {
    const SECRET = "s3cr3t-token-value";

    it("authorizes matching bearer header", () => {
      expect(isCronRequestAuthorized(`Bearer ${SECRET}`, SECRET)).toBe(true);
    });

    it("rejects missing auth header", () => {
      expect(isCronRequestAuthorized(null, SECRET)).toBe(false);
    });

    it("rejects wrong secret", () => {
      expect(isCronRequestAuthorized("Bearer wrong-token", SECRET)).toBe(false);
    });

    it("rejects bearer prefix without the secret", () => {
      expect(isCronRequestAuthorized("Bearer ", SECRET)).toBe(false);
    });

    it("rejects the raw secret without the Bearer prefix", () => {
      expect(isCronRequestAuthorized(SECRET, SECRET)).toBe(false);
    });
  });
});
