/** Only an initial authentication guard may mark a failure safe to replay.
 * No mutation, provider request or transaction has started at that point. */
export type ActionFailure = { error: string; sessionExpired?: true };

/** Browser-safe protocol; display copy and thrown errors are never signals. */
export function isExpiredActionResult(result: unknown): boolean {
  if (!result || typeof result !== "object" || !("error" in result)) return false;
  if ("sessionExpired" in result && result.sessionExpired === true) return true;
  const error = result.error;
  // Intake, attachment and Project actions retain their structured failures.
  return Boolean(error && typeof error === "object" && "code" in error && error.code === "session_expired");
}
