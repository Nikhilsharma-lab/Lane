import "server-only";

import { after } from "next/server";
import { and, eq, inArray, or, sql } from "drizzle-orm";

import { db, deliveryLog, deliveryPreferences, organizations, requestAgreements, requests, type DeliveryChannel } from "@/db";
import type { MemberAuth } from "./auth-guard";
import { loadNeedsYou } from "./data/inbox";
import { deliveryMessage } from "./delivery-message";
import { appOrigin, emailDelivery } from "./feature-switches";
import type { NeedsYouItem, NeedsYouKind } from "./inbox-read-model";
import { idempotencyKeyOf, recordingMessenger, resendMessenger, type Messenger } from "./messenger";
import { journeyStatusCondition, requesterColumn } from "./request-journey-sql";
import type { Reviewer } from "./request-reviewer-rules";
import { workspaceRoster } from "./workspace-roster";

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
 * The person's choice for the workspace decides the channel: Email (the default, no row), Slack DM (#207; it
 * falls back to Email until Slack is connected) or Off. Off holds everything except Result due. Only Admins and
 * Members on the live Clerk roster get anything; Guests, Viewers and people who left get nothing here.
 */

export const ACTION_KINDS: readonly NeedsYouKind[] = ["review", "concern"];
export const TIME_KINDS: readonly NeedsYouKind[] = ["record_release", "result_due"];

export type DeliveryRun = {
  now: Date;
  /** Defaults to the switches' choice: Resend when Email delivery is on, otherwise the recording stand-in. */
  messenger: Messenger;
  /** The origin delivered links point at. */
  appUrl: string;
};

/** Totals only: no person, address or item ever leaves this module in a report. */
export type DeliveryReport = { sent: number; skipped: number; failed: number };

type Recipient = { userId: string; email: string; role: "admin" | "member" };

/** The messenger the switches choose for this run. A new stand-in each run, so nothing piles up in memory. */
export function switchedMessenger(): Messenger {
  const email = emailDelivery();
  return email.on ? resendMessenger({ apiKey: email.apiKey, from: email.from }) : recordingMessenger();
}

const runOf = (run: Partial<DeliveryRun> = {}): DeliveryRun => ({
  now: run.now ?? new Date(),
  messenger: run.messenger ?? switchedMessenger(),
  appUrl: run.appUrl ?? appOrigin(),
});

/** Admins and Members on the live roster, by id. Everyone else is never asked to act. */
async function recipientsOf(orgId: string): Promise<Map<string, Recipient>> {
  const people = await workspaceRoster(orgId);
  const recipients = new Map<string, Recipient>();
  for (const person of people)
    if (person.nominee.kind === "member" && (person.role === "org:admin" || person.role === "org:member"))
      recipients.set(person.nominee.userId, { userId: person.nominee.userId, email: person.email, role: person.role === "org:admin" ? "admin" : "member" });
  return recipients;
}

/** Each person's channel in this workspace; no row is Email. Slack DM is Email until Slack exists (#207). */
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
 * Sends one person's items: each to its own message, each claimed in the log first so a concurrent or
 * repeated run skips it. A send that fails releases its claim, so a later run can try again.
 */
async function sendItems(
  orgId: string,
  recipient: Recipient,
  channel: DeliveryChannel,
  items: NeedsYouItem[],
  workspaceName: string,
  run: DeliveryRun,
  report: DeliveryReport,
) {
  for (const item of items) {
    if ((channel === "off" && item.kind !== "result_due") || !recipient.email) {
      report.skipped++;
      continue;
    }
    const [claimed] = await db
      .insert(deliveryLog)
      .values({ orgId, userId: recipient.userId, requestId: item.requestId, itemKey: item.key, channel: "email", outcome: run.messenger.outcome, sentAt: run.now })
      .onConflictDoNothing()
      .returning({ id: deliveryLog.id });
    if (!claimed) {
      report.skipped++;
      continue;
    }
    const copy = deliveryMessage(item, { appUrl: run.appUrl, workspaceName });
    const result = await run.messenger.send({
      channel: "email",
      to: recipient.email,
      subject: copy.subject,
      text: copy.text,
      idempotencyKey: idempotencyKeyOf(orgId, recipient.userId, item.key),
    });
    if (result.ok) {
      report.sent++;
      continue;
    }
    await db.delete(deliveryLog).where(eq(deliveryLog.id, claimed.id));
    report.failed++;
    console.error(`[inbox-delivery] send failed: ${result.reason}`);
  }
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
  for (const person of people) {
    const auth: MemberAuth = { userId: person.userId, orgId, role: person.role };
    const items = (await loadNeedsYou(auth, run.now, only)).filter((item) => kinds.includes(item.kind));
    await sendItems(orgId, person, channels.get(person.userId) ?? "email", items, workspaceName, run, report);
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
