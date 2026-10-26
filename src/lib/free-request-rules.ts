/**
 * #213 (spec #195, item 5): the Free Requests rules. Client-safe and pure; the billing module (src/lib/billing.ts)
 * gives them a workspace's stored state. 4 Free Requests come with the whole product, for any number of people and no
 * time limit. The allowance belongs to the company email domain of the workspace's creator, or, for a personal email
 * domain such as gmail.com, to that one person. Decision 2026-10-26: the 4 are shared by every workspace with the same
 * allowance, so a second workspace from a company domain gets whatever is left (the first used 1: the second gets 3).
 */

export const FREE_REQUESTS = 4;

export type PlanState = "free" | "paying" | "lapsed";
export type AllowanceKind = "company_domain" | "personal_email";

/**
 * What a workspace's billing row says: Requests counted here, and the allowance it shares (null until the creator's
 * allowance has been looked up) with how many Requests the other workspaces sharing it have counted.
 */
export type FreeRequestsState = {
  planState: PlanState;
  used: number;
  allowance: { kind: AllowanceKind; domain: string; usedElsewhere: number } | null;
};

export type FreeRequests = {
  /** Always the 4 of the allowance, however many workspaces share it. */
  total: number;
  /** Counted in this workspace. */
  used: number;
  left: number;
  /** Set when other workspaces from the creator's company domain (or of the same person) used some of the 4. */
  usedElsewhere: { kind: AllowanceKind; domain: string; used: number } | null;
};

export function freeRequestsOf(state: FreeRequestsState): FreeRequests {
  const elsewhere = state.allowance && state.allowance.usedElsewhere > 0 ? state.allowance : null;
  return {
    total: FREE_REQUESTS,
    used: state.used,
    left: Math.max(0, FREE_REQUESTS - state.used - (elsewhere?.usedElsewhere ?? 0)),
    usedElsewhere: elsewhere && { kind: elsewhere.kind, domain: elsewhere.domain, used: elsewhere.usedElsewhere },
  };
}

export const ADMIN_NEEDS_TO_PAY =
  "An Admin needs to pay for Lane before anyone here can create a new Request or take on a Guest submission. Everything already filed keeps working.";

/** Why the 5th Request is refused, in the words of the person who gets refused. */
export function freeRequestsUsedReason(free: FreeRequests): string {
  const elsewhere = free.usedElsewhere;
  if (!elsewhere) return `This workspace has used its ${FREE_REQUESTS} Free Requests.`;
  const company = elsewhere.kind === "company_domain";
  if (free.used > 0) return company
    ? `This workspace and another from ${elsewhere.domain} have used the ${FREE_REQUESTS} Free Requests for ${elsewhere.domain}.`
    : `This workspace and another created by the same person have used their ${FREE_REQUESTS} Free Requests.`;
  return company
    ? `The Free Requests for ${elsewhere.domain} were already used by another workspace.`
    : "The person who created this workspace already used their Free Requests in another workspace.";
}

/** While some are left: that the 4 are shared with another workspace, which has used some. Null when none are shared. */
export function freeRequestsSharedNote(free: FreeRequests): string | null {
  const elsewhere = free.usedElsewhere;
  if (!elsewhere || free.left === 0) return null;
  const whose = elsewhere.kind === "company_domain" ? `another workspace from ${elsewhere.domain}` : "another workspace created by the same person";
  return `${free.left} of ${FREE_REQUESTS} Free Requests left. They are shared with ${whose}, which used ${elsewhere.used}.`;
}

/**
 * The only thing billing blocks: creating a new Request, or taking on a Guest submission, once the Free Requests
 * are used without a paid plan, or when the plan has lapsed. Null means go ahead. Nothing is ever blocked while
 * billing isn't enforced (`LANE_BILLING_ENFORCED`, off by default).
 */
export function creationBlock(state: FreeRequestsState, { enforced }: { enforced: boolean }): string | null {
  return freeRequestsBlock(state.planState, freeRequestsOf(state), { enforced });
}

/** `creationBlock` for a workspace's plan state and Free Requests, as Settings → Billing reads them. */
export function freeRequestsBlock(planState: PlanState, free: FreeRequests, { enforced }: { enforced: boolean }): string | null {
  if (!enforced || planState === "paying") return null;
  if (planState === "lapsed") return `This workspace’s plan has lapsed. ${ADMIN_NEEDS_TO_PAY}`;
  return free.left > 0 ? null : `${freeRequestsUsedReason(free)} ${ADMIN_NEEDS_TO_PAY}`;
}

/** Common free email providers: an address there is one person, not a company. */
const PERSONAL_EMAIL_DOMAINS = new Set([
  "gmail.com", "googlemail.com", "outlook.com", "hotmail.com", "hotmail.co.uk", "live.com", "msn.com",
  "yahoo.com", "yahoo.co.uk", "ymail.com", "rocketmail.com", "icloud.com", "me.com", "mac.com", "aol.com",
  "proton.me", "protonmail.com", "pm.me", "gmx.com", "gmx.de", "gmx.net", "web.de", "mail.com", "zoho.com",
  "yandex.com", "yandex.ru", "mail.ru", "hey.com", "fastmail.com", "tutanota.com", "tuta.io", "qq.com",
  "163.com", "126.com", "naver.com", "rediffmail.com",
]);
/** Gmail ignores dots and treats googlemail.com as the same mailbox. */
const GMAIL = new Set(["gmail.com", "googlemail.com"]);
const DOMAIN = /^[a-z0-9]([a-z0-9-]*[a-z0-9])?(\.[a-z0-9]([a-z0-9-]*[a-z0-9])?)+$/;

export type AllowanceKey = { key: string; kind: AllowanceKind; domain: string };

/**
 * Whose allowance a creator's email address names: the company domain, or for a personal email domain the
 * address itself, written the way its mailbox reads it (no `+tag`; for Gmail, no dots), so one person can't
 * claim it twice by spelling the address differently. Null for anything that isn't an email address.
 */
export function allowanceKeyOf(email: string): AllowanceKey | null {
  const parts = email.trim().toLowerCase().split("@");
  if (parts.length !== 2) return null;
  const [local, domain] = parts;
  if (!local || !DOMAIN.test(domain)) return null;
  if (!PERSONAL_EMAIL_DOMAINS.has(domain)) return { key: domain, kind: "company_domain", domain };
  const gmail = GMAIL.has(domain);
  const mailbox = local.split("+")[0];
  const name = gmail ? mailbox.replaceAll(".", "") : mailbox;
  if (!name) return null;
  const at = gmail ? "gmail.com" : domain;
  return { key: `${name}@${at}`, kind: "personal_email", domain: at };
}
