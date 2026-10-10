/**
 * Next runs register() once per server start (plan 6.1, I4/I5).
 * It is server-only; nothing here reaches the client bundle.
 */
export async function register() {
  if (process.env.NEXT_RUNTIME !== "nodejs") return;

  const { reportServerEnv } = await import("@/lib/env");
  // Throws on a production boot when a required name is missing. In
  // development it prints one warning and lets the server start.
  reportServerEnv();
}
