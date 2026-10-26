import "server-only";

import { after } from "next/server";
import { and, eq, inArray, or, sql } from "drizzle-orm";

import { db, deliveryLog, deliveryPreferences, organizations, profiles, requestAgreements, requests, type DeliveryChannel } from "@/db";
import type { MemberAuth, WorkspacePermission } from "./auth-guard";
import { loadNeedsYou } from "./data/inbox";
import { deliveryMessage, guestMessage } from "./delivery-message";
import { appOrigin, emailDelivery, slackDelivery, type SlackDelivery } from "./feature-switches";
import type { NeedsYouItem, NeedsYouKind } from "./inbox-read-model";
import { idempotencyKeyOf, recordingMessenger, resendMessenger, slackMessenger, type Messenger, type SendResult } from "./messenger";
import { slackTokenFor } from "./slack-connection";
import { journeyStatusCondition, requesterColumn } from "./request-journey-sql";
import { canChangeThings, canContribute, clerkWorkspacePermission } from "./role-rules";
import type { Reviewer } from "./request-reviewer-rules";
import { workspaceMember, workspaceRoster } from "./workspace-roster";

/**
 * #206 (spec #195, item 2): the one delivery module. It sends a person's Needs-you items outside Lane through a
 * messenger, one message per item, and the delivery log holds each person's item once, so nothing is sent
 * twice however often delivery runs. What counts as a Needs-you item is the Inbox read model's decision
 * (`loadNeedsYou`), so a cleared item is never sent and For-your-information items never are.
 *
 * - Items caused by an action (a review asked, a Concern raised) go when the action happens:
 *   `deliverAfterResponse` from the action, after its change is saved.
 * - Items caused by time (Record the release, Result due) go from the one daily job: `runDailyDelivery`.
 *
 * The person’s choice for the workspace decides the channel: Email (the default, no row), Slack DM (#207; it
 * goes by Email while Slack is not connected, or when Slack can’t reach the person) or Off. Off holds everything
 * except Result due. Only Admins and Members on the live Clerk roster get anything; Guests, Viewers and people
 * who left get nothing here.
 */

export const ACTION_KINDS: readonly NeedsYouKind[] = ["review", "concern"];
export const TIME_KINDS: readonly NeedsYouKind[] = ["record_release", "result_due"];

export type DeliveryRun = {
  now: Date;
  /** Defaults to the switches' choice: Resend when Email delivery is on, otherwise the recording stand-in. */
  messenger: Messenger;
  /** The origin delivered links point at. */
  appUrl: string;
  /** The Slack switch (#207). While it is off, nobody gets a Slack DM and nothing reads a Slack token. */
  slack: SlackDelivery;
  /** The Slack DM messenger for a connected workspace's bot token. */
  slackMessenger: (token: string) => Messenger;
};

/** Totals only: no person, address or item ever leaves this module in a report. */
export type DeliveryReport = { sent: number; skipped: number; failed: number };

/** An Admin or Member: only they are asked to act. */
type Recipient = { userId: string; email: string; role: WorkspacePermission };

/** The messenger the switches choose for this run. A new stand-in each run, so nothing piles up in memory. */
export function switchedMessenger(): Messenger {
  const email = emailDelivery();
  return email.on ? resendMessenger({ apiKey: email.apiKey, from: email.from }) : recordingMessenger();
}

const runOf = (run: Partial<DeliveryRun> = {}): DeliveryRun => ({
  now: run.now ?? new Date(),
  messenger: run.messenger ?? switchedMessenger(),
  appUrl: run.appUrl ?? appOrigin(),
  slack: run.slack ?? slackDelivery(),
  slackMessenger: run.slackMessenger ?? ((token) => slackMessenger({ token })),
});

/** Admins and Members on the live roster, by id. Everyone else is never asked to act. */
async function recipientsOf(orgId: string): Promise<Map<string, Recipient>> {
  const people = await workspaceRoster(orgId);
  const recipients = new Map<string, Recipient>();
  for (const person of people) {
    const role = clerkWorkspacePermission(person.role);
    if (person.nominee.kind === "member" && role && canChangeThings(role))
      recipients.set(person.nominee.userId, { userId: person.nominee.userId, email: person.email, role });
  }
  return recipients;
}

/** Each person’s saved channel in this workspace; no row is Email. Slack DM falls back to Email in `sendItems`. */
async function channelsOf(orgId: string, userIds: string[]): Promise<Map<string, DeliveryChannel>> {
  if (!userIds.length) return new Map();
  const rows = await db
    .select({ userId: deliveryPreferences.userId, channel: deliveryPreferences.channel })
    .from(deliveryPreferences)
    .where(and(eq(deliveryPreferences.orgId, orgId), inArray(deliveryPreferences.userId, userIds)));
  return new Map(rows.map((row) => [row.userId, row.channel]));
}

async function workspaceNameOf(orgId: string): Promise<string> {
  const [row] = await db.select({ name: organizations.name }).from(organizations).where(eq(organizations.id, orgId));
  return row?.name ?? "your workspace";
}

/**
 * Sends one item on one channel: claimed in the log first, so a concurrent or repeated run skips it, then sent.
 * A send that fails releases its claim, so a later run (or Email, when Slack can't reach the person) can send it.
 */
async function sendOne(
  orgId: string,
  recipient: Pick<Recipient, "userId" | "email">,
  item: Pick<NeedsYouItem, "requestId" | "key">,
  channel: "email" | "slack",
  messenger: Messenger,
  copyOf: () => { subject: string; text: string },
  run: DeliveryRun,
): Promise<SendResult | "already"> {
  const [claimed] = await db
    .insert(deliveryLog)
    .values({ orgId, userId: recipient.userId, requestId: item.requestId, itemKey: item.key, channel, outcome: messenger.outcome, sentAt: run.now })
    .onConflictDoNothing()
    .returning({ id: deliveryLog.id });
  if (!claimed) return "already";
  const copy = copyOf();
  const result = await messenger.send({
    channel,
    to: recipient.email,
    subject: copy.subject,
    text: copy.text,
    idempotencyKey: idempotencyKeyOf(orgId, recipient.userId, item.key),
  });
  if (!result.ok) await db.delete(deliveryLog).where(eq(deliveryLog.id, claimed.id));
  return result;
}

/**
 * Sends one person's items, each in its own message. Slack DM goes through the workspace's Slack while it is
 * connected (`slackDm`, null otherwise); without it, or when Slack can't reach this person, the item goes by Email.
 */
async function sendItems(
  orgId: string,
  recipient: Recipient,
  channel: DeliveryChannel,
  items: NeedsYouItem[],
  workspaceName: string,
  slackDm: Messenger | null,
  run: DeliveryRun,
  report: DeliveryReport,
) {
  for (const item of items) {
    if ((channel === "off" && item.kind !== "result_due") || !recipient.email) {
      report.skipped++;
      continue;
    }
    let result: SendResult | "already" | null = null;
    if (channel === "slack" && slackDm) {
      result = await sendOne(orgId, recipient, item, "slack", slackDm, () => deliveryMessage(item, { appUrl: run.appUrl, workspaceName, channel: "slack" }), run);
      if (result !== "already" && !result.ok && result.useEmail) {
        console.error(`[inbox-delivery] Slack DM not possible, sending by email: ${result.reason}`);
        result = null;
      }
    }
    result ??= await sendOne(orgId, recipient, item, "email", run.messenger, () => deliveryMessage(item, { appUrl: run.appUrl, workspaceName, channel: "email" }), run);
    if (result === "already") report.skipped++;
    else if (result.ok) report.sent++;
    else {
      report.failed++;
      console.error(`[inbox-delivery] send failed: ${result.reason}`);
    }
  }
}

/** The workspace's Slack DM messenger while Slack is connected; null otherwise, or when nobody chose Slack DM. */
async function slackDmFor(orgId: string, channels: Map<string, DeliveryChannel>, run: DeliveryRun): Promise<Messenger | null> {
  if (![...channels.values()].includes("slack")) return null;
  const token = await slackTokenFor(orgId, run.slack);
  return token ? run.slackMessenger(token) : null;
}

/** Delivers the given people's items of these kinds in one workspace. */
async function deliverInWorkspace(
  orgId: string,
  candidateIds: Iterable<string>,
  kinds: readonly NeedsYouKind[],
  run: DeliveryRun,
  report: DeliveryReport,
  only?: { requestId: string },
) {
  const recipients = await recipientsOf(orgId);
  const people = [...new Set(candidateIds)].flatMap((id) => recipients.get(id) ?? []);
  if (!people.length) return;
  const [channels, workspaceName] = await Promise.all([channelsOf(orgId, people.map((p) => p.userId)), workspaceNameOf(orgId)]);
  const slackDm = await slackDmFor(orgId, channels, run);
  for (const person of people) {
    const auth: MemberAuth = { userId: person.userId, orgId, role: person.role };
    const items = (await loadNeedsYou(auth, run.now, only)).filter((item) => kinds.includes(item.kind));
    await sendItems(orgId, person, channels.get(person.userId) ?? "email", items, workspaceName, slackDm, run, report);
  }
}

/**
 * The action-caused items one Request now owes people (its Reviewers and its Requester), sent once each.
 * Safe to call after any change to the Request: only items not yet in the log go out.
 */
export async function deliverRequestNeedsYou(target: { orgId: string; requestId: string }, run?: Partial<DeliveryRun>): Promise<DeliveryReport> {
  const settled = runOf(run);
  const report: DeliveryReport = { sent: 0, skipped: 0, failed: 0 };
  const [row] = await db
    .select({ requester: requesterColumn, reviewers: requestAgreements.reviewers })
    .from(requests)
    .leftJoin(requestAgreements, and(eq(requestAgreements.requestId, requests.id), eq(requestAgreements.orgId, requests.orgId)))
    .where(and(eq(requests.id, target.requestId), eq(requests.orgId, target.orgId)));
  if (!row) return report;
  const reviewers = ((row.reviewers ?? []) as Reviewer[]).flatMap((r) => (r.nominee.kind === "member" ? [r.nominee.userId] : []));
  // Both action-caused kinds need a Reviewer: without one there is nothing to send and no roster to read.
  if (!reviewers.length) return report;
  await deliverInWorkspace(target.orgId, [row.requester, ...reviewers], ACTION_KINDS, settled, report, { requestId: target.requestId });
  return report;
}

/**
 * The one daily job: every workspace's Record the release and Result due items, sent once each. Running it
 * twice sends nothing twice. A workspace whose roster can't be read is left for the next run.
 */
export async function runDailyDelivery(run?: Partial<DeliveryRun>): Promise<DeliveryReport> {
  const settled = runOf(run);
  const report: DeliveryReport = { sent: 0, skipped: 0, failed: 0 };
  const rows = await db
    .selectDistinct({ orgId: requests.orgId, requester: sql<string>`${requesterColumn}` })
    .from(requests)
    .where(or(journeyStatusCondition("done"), journeyStatusCondition("measuring")));
  const byWorkspace = new Map<string, string[]>();
  for (const row of rows) byWorkspace.set(row.orgId, [...(byWorkspace.get(row.orgId) ?? []), row.requester]);
  for (const [orgId, requesters] of byWorkspace) {
    try {
      await deliverInWorkspace(orgId, requesters, TIME_KINDS, settled, report);
    } catch (error) {
      report.failed++;
      console.error(`[inbox-delivery] daily run skipped a workspace: ${error instanceof Error ? error.name : "error"}`);
    }
  }
  return report;
}

/**
 * #212: the only two emails a Guest gets, about their own submission: when a Member takes it on, and when it is
 * Closed. They go by Email whatever the Guest's delivery choice, once each (the delivery log's key per Request),
 * and only while the Guest still belongs to the workspace as anything but a Viewer. Nothing else here ever
 * reaches a Guest: Needs-you items go to Admins and Members only.
 */
export async function deliverGuestEmail(target: { orgId: string; requestId: string; kind: GuestEmailKind }, run?: Partial<DeliveryRun>): Promise<DeliveryReport> {
  const settled = runOf(run);
  const report: DeliveryReport = { sent: 0, skipped: 0, failed: 0 };
  const [row] = await db
    .select({
      createdBy: requests.createdBy, guestSubmission: requests.guestSubmission, takenOnBy: requests.takenOnBy, takerName: profiles.fullName,
      requestNumber: requests.requestNumber, title: requests.title, reframedProblem: requests.reframedProblem,
      measured: sql<boolean>`${requests.outcomeClosure} is not null`, withoutResult: sql<boolean>`${requests.outcomeClosure} is null and ${requests.exceptionClosure} is not null`,
    })
    .from(requests)
    .leftJoin(profiles, eq(profiles.id, requests.takenOnBy))
    .where(and(eq(requests.id, target.requestId), eq(requests.orgId, target.orgId)));
  if (!row?.guestSubmission || !row.takenOnBy) return report;
  const closure = row.measured ? "measured" as const : row.withoutResult ? "without_result" as const : null;
  if (target.kind === "closed" && !closure) return report;
  const guest = await workspaceMember(target.orgId, row.createdBy);
  // A Guest made a Viewer since (or given a role Lane doesn't know) gets no Guest email.
  const guestRole = guest && clerkWorkspacePermission(guest.role);
  if (!guest || !guestRole || !canContribute(guestRole) || !guest.email) return report;
  const workspaceName = await workspaceNameOf(target.orgId);
  const copy = () => guestMessage(
    target.kind === "taken_on" ? { kind: "taken_on", takerName: row.takerName } : { kind: "closed", closure: closure! },
    { requestId: target.requestId, requestNumber: row.requestNumber, title: row.title, reframedProblem: row.reframedProblem },
    { appUrl: settled.appUrl, workspaceName },
  );
  const result = await sendOne(target.orgId, { userId: row.createdBy, email: guest.email }, { requestId: target.requestId, key: `guest_${target.kind}:${target.requestId}` }, "email", settled.messenger, copy, settled);
  if (result === "already") report.skipped++;
  else if (result.ok) report.sent++;
  else {
    report.failed++;
    console.error(`[inbox-delivery] Guest email failed: ${result.reason}`);
  }
  return report;
}

/** The two emails a Guest gets about their submission (#212). */
export type GuestEmailKind = "taken_on" | "closed";

/** Sends a Guest's email after the action's response, as `deliverAfterResponse` does for Needs-you items. */
export function deliverGuestEmailAfterResponse(target: { orgId: string; requestId: string; kind: GuestEmailKind }) {
  try {
    after(async () => {
      try {
        await deliverGuestEmail(target);
      } catch (error) {
        console.error(`[inbox-delivery] Guest email after an action failed: ${error instanceof Error ? error.name : "error"}`);
      }
    });
  } catch {
    // `after` throws outside a request scope; there is nothing to deliver after.
  }
}

/**
 * Schedules a Request's action-caused delivery for after the action's response, so the person acting never
 * waits on email. Outside a request (a script, a test) there is no response to wait for, and nothing is sent.
 */
export function deliverAfterResponse(target: { orgId: string; requestId: string }) {
  try {
    after(async () => {
      try {
        await deliverRequestNeedsYou(target);
      } catch (error) {
        console.error(`[inbox-delivery] delivery after an action failed: ${error instanceof Error ? error.name : "error"}`);
      }
    });
  } catch {
    // `after` throws outside a request scope; there is nothing to deliver after.
  }
}
