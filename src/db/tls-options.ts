import { X509Certificate } from "node:crypto";

/** Shared by the runtime and migration tooling; no environment or client side effects. */
export function databaseTlsOptions(
  url: URL,
  certificate?: string
): false | { rejectUnauthorized: true; ca?: string } {
  if (url.hostname === "localhost" || url.hostname === "127.0.0.1") return false;

  const ca = certificate?.replaceAll("\\n", "\n").trim();
  if (ca) {
    try {
      new X509Certificate(ca);
    } catch {
      // Keep certificate contents and connection credentials out of errors.
      throw new Error("[db] DATABASE_SSL_CA must contain a valid PEM certificate.");
    }
  }

  // Postgres.js "require" encrypts but skips certificate verification.
  // A supplied Supabase CA replaces Node's default trust; neither path falls back.
  return { rejectUnauthorized: true, ...(ca ? { ca } : {}) };
}
