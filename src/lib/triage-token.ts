import { createHmac } from "crypto";
import type { TriageResult } from "@/lib/ai/triage";

/**
 * Server-side signed token for triage results.
 *
 * After the AI classifies a request, the server encodes the trusted
 * classification + extractedSolution into an HMAC-signed token. The client
 * receives this token alongside the triage result for display, but on save
 * the server only trusts what's in the verified token — never the client's
 * classification field. The client MAY supply an edited reframedProblem
 * (the user can tweak the AI's reframing), but classification and
 * extractedSolution are locked.
 */

interface TokenPayload {
  /** Original title (to bind the token to a specific submission) */
  title: string;
  /** Original description */
  description: string;
  /** AI classification — trusted, not client-editable */
  classification: "problem" | "solution" | "hybrid";
  /** AI-extracted solution for hybrid — trusted, not client-editable */
  extractedSolution: string | null;
  /** Timestamp to expire tokens */
  issuedAt: number;
}

const TOKEN_MAX_AGE_MS = 10 * 60 * 1000; // 10 minutes

function getSecret(): string {
  const secret = process.env.TRIAGE_TOKEN_SECRET;
  if (!secret) {
    throw new Error("[triage-token] TRIAGE_TOKEN_SECRET is required for signing triage tokens");
  }
  return secret;
}

function sign(payload: TokenPayload): string {
  const data = JSON.stringify(payload);
  const encoded = Buffer.from(data).toString("base64url");
  const hmac = createHmac("sha256", getSecret()).update(encoded).digest("base64url");
  return `${encoded}.${hmac}`;
}

function verify(token: string): TokenPayload | null {
  const parts = token.split(".");
  if (parts.length !== 2) return null;

  const [encoded, hmac] = parts;
  const expected = createHmac("sha256", getSecret()).update(encoded).digest("base64url");

  // Constant-time comparison
  if (hmac.length !== expected.length) return null;
  let mismatch = 0;
  for (let i = 0; i < hmac.length; i++) {
    mismatch |= hmac.charCodeAt(i) ^ expected.charCodeAt(i);
  }
  if (mismatch !== 0) return null;

  try {
    const payload: TokenPayload = JSON.parse(Buffer.from(encoded, "base64url").toString());

    // Check expiry
    if (Date.now() - payload.issuedAt > TOKEN_MAX_AGE_MS) return null;

    return payload;
  } catch {
    return null;
  }
}

export function createTriageToken(
  title: string,
  description: string,
  triage: TriageResult
): string {
  return sign({
    title,
    description,
    classification: triage.classification,
    extractedSolution: triage.extractedSolution,
    issuedAt: Date.now(),
  });
}

export function verifyTriageToken(token: string): TokenPayload | null {
  return verify(token);
}
