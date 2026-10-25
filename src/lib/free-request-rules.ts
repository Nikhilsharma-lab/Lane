/**
 * #213 (spec #195, item 5): the Free Requests rules. Client-safe and pure; the billing module (src/lib/billing.ts)
 * gives them a workspace's stored state. Every new workspace gets 4 Free Requests with the whole product, for any
 * number of people and no time limit. The allowance belongs to the company email domain of the workspace's creator,
 * or, for a personal email domain such as gmail.com, to that one person.
 */

export const FREE_REQUESTS = 4;

export type PlanState = "free" | "paying" | "lapsed";
export type AllowanceKind = "company_domain" | "personal_email";

/** What a workspace's billing row says. `allowance` is null until the creator's allowance has been looked up. */
export type FreeRequestsState = {
  planState: PlanState;
  used: number;
  allowance: { kind: AllowanceKind; domain: string; held: boolean } | null;
};

export type FreeRequests = {
  total: number;
  used: number;
  left: number;
  /** Set when another workspace from the creator's domain (or the same person) already holds the allowance. */
  usedElsewhere: { kind: AllowanceKind; domain: string } | null;
};

export function freeRequestsOf(state: FreeRequestsState): FreeRequests {
  const elsewhere = state.allowance && !state.allowance.held ? state.allowance : null;
  const total = elsewhere ? 0 : FREE_REQUESTS;
  return {
    total,
    used: state.used,
    left: Math.max(0, total - state.used),
    usedElsewhere: elsewhere && { kind: elsewhere.kind, domain: elsewhere.domain },
  };
}

export const ADMIN_NEEDS_TO_PAY =
  "An Admin needs to pay for Lane before anyone here can create a new Request or take on a Guest submission. Everything already filed keeps working.";

/** Why the 5th Request is refused, in the words of the person who gets refused. */
export function freeRequestsUsedReason(free: FreeRequests): string {
  if (free.usedElsewhere?.kind === "company_domain") return `The Free Requests for ${free.usedElsewhere.domain} were already used by another workspace.`;
  if (free.usedElsewhere) return "The person who created this workspace already used their Free Requests in another workspace.";
  return `This workspace has used its ${FREE_REQUESTS} Free Requests.`;
}

/**
 * The only thing billing blocks: creating a new Request, or taking on a Guest submission, once the Free Requests
 * are used without a paid plan, or when the plan has lapsed. Null means go ahead. Nothing is ever blocked while
 * billing isn't enforced (`LANE_BILLING_ENFORCED`, off by default).
 */
export function creationBlock(state: FreeRequestsState, { enforced }: { enforced: boolean }): string | null {
  if (!enforced || state.planState === "paying") return null;
  if (state.planState === "lapsed") return `This workspace’s plan has lapsed. ${ADMIN_NEEDS_TO_PAY}`;
  const free = freeRequestsOf(state);
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
