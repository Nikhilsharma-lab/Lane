import type { MemberAuth } from "@/lib/auth-guard";

/**
 * What read-route.ts's routes answer that a caller reads back, written and read here only: safe in the browser, where
 * the app frame's check (src/components/shell/frame-check.ts) reads it.
 */

/** The code on a refusal because the session isn't in the page's workspace any more: in another one, or in none. */
export const WORKSPACE_CHANGED_CODE = "WORKSPACE_CHANGED";

/** Whose session answers, and their role, for a frame that asks after a move. The browser has its own person's id. */
export type FrameAnswer = Pick<MemberAuth, "userId" | "role">;
export const frameAnswer = ({ userId, role }: MemberAuth): FrameAnswer => ({ userId, role });

/**
 * What a frame was answered: who and which role, `workspace` when the session isn't in its workspace any more, or null
 * for any other answer, such as a firewall's 403 or a network's sign-in page, which says nothing about the session.
 */
export function readFrameAnswer(status: number, body: { code?: unknown; userId?: unknown; role?: unknown }): "workspace" | { userId: string; role: string } | null {
  if (status === 403) return body.code === WORKSPACE_CHANGED_CODE ? "workspace" : null;
  const { userId, role } = body;
  return status === 200 && typeof userId === "string" && typeof role === "string" ? { userId, role } : null;
}
