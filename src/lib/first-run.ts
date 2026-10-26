import "server-only";

import { clerkClient } from "@clerk/nextjs/server";
import { and, eq, sql } from "drizzle-orm";

import { db, firstRunProgress, requests } from "@/db";
import type { MemberAuth, WorkspacePerson } from "./auth-guard";
import { readFreeRequests, type WorkspaceFreeRequests } from "./billing";
import {
  firstRunGuideFor, firstRunView, startingProgress, withStepRead, type FirstRunChange, type FirstRunGuide, type FirstRunProgress, type FirstRunView,
} from "./first-run-rules";

/**
 * #217 (spec #195, item 6): the first run's store. One row per person per workspace (`first_run_progress`),
 * started the first time the person reaches the Requests list. Which guide they get is decided then, once, from
 * the workspace's Clerk creator. Nothing else is created: no demo workspace and no sample data. Access is the
 * caller's job: pages pass the session's member, actions pass the guard's.
 */

type Person = WorkspacePerson;

export type FirstRunData = {
  /** What to show now; null when the person skipped or finished it (help reopens it). */
  view: FirstRunView | null;
  /** The workspace's Free Requests, for the first Request guide only. */
  free: WorkspaceFreeRequests | null;
};

const filedSql = ({ orgId, userId }: Person) =>
  sql<boolean>`exists (select 1 from ${requests} where ${requests.orgId} = ${orgId} and ${requests.createdBy} = ${userId})`;

/** The person's stored first run and whether they have filed a Request here, in one statement. */
async function readProgress(person: Person): Promise<{ progress: FirstRunProgress; filed: boolean } | null> {
  const [row] = await db
    .select({
      guide: firstRunProgress.guide,
      steps: firstRunProgress.steps,
      skippedAt: firstRunProgress.skippedAt,
      completedAt: firstRunProgress.completedAt,
      filed: filedSql(person),
    })
    .from(firstRunProgress)
    .where(and(eq(firstRunProgress.orgId, person.orgId), eq(firstRunProgress.userId, person.userId)));
  if (!row) return null;
  const { filed, ...progress } = row;
  return { progress, filed: Boolean(filed) };
}

/** The guide for someone without a first run yet, from the workspace's Clerk creator; null while Clerk can't say. */
async function guideFor({ orgId, userId }: Person): Promise<FirstRunGuide | null> {
  try {
    const client = await clerkClient();
    const organization = await client.organizations.getOrganization({ organizationId: orgId });
    return firstRunGuideFor({ createdBy: organization.createdBy, userId });
  } catch {
    console.error("[first-run] workspace creator unavailable");
    return null;
  }
}

/**
 * The signed-in person's first run in their workspace, started if this is their first visit. Null when it can't
 * be started yet (Clerk can't say who created the workspace); the next visit tries again.
 */
export async function loadFirstRun(member: MemberAuth): Promise<FirstRunData | null> {
  const person = { orgId: member.orgId, userId: member.userId };
  let stored = await readProgress(person);
  if (!stored) {
    const guide = await guideFor(person);
    if (!guide) return null;
    const [{ filed }] = await db.select({ filed: filedSql(person) }).from(sql`(select 1) as visit`);
    const start = startingProgress({ guide, filed: Boolean(filed) });
    await db
      .insert(firstRunProgress)
      .values({ ...person, guide: start.guide, completedAt: start.completed ? new Date() : null })
      .onConflictDoNothing();
    stored = await readProgress(person);
    if (!stored) return null;
  }
  const view = firstRunView(stored.progress, { filed: stored.filed });
  const free = view?.guide === "first_request" ? await readFreeRequests({ orgId: member.orgId }) : null;
  return { view, free };
}

export type FirstRunRefusal = "not_started" | "not_a_step";

/** Applies one change to the person's first run; the caller has already checked who they are. */
export async function changeFirstRun(person: Person, change: FirstRunChange): Promise<{ ok: true } | { refused: FirstRunRefusal }> {
  const where = and(eq(firstRunProgress.orgId, person.orgId), eq(firstRunProgress.userId, person.userId));
  return db.transaction(async (tx) => {
    const [row] = await tx.select({ guide: firstRunProgress.guide, steps: firstRunProgress.steps }).from(firstRunProgress).where(where).for("update");
    if (!row) return { refused: "not_started" as const };
    const now = new Date();
    if (change.change === "step") {
      const steps = withStepRead(row.guide, row.steps, change.step);
      if (!steps) return { refused: "not_a_step" as const };
      await tx.update(firstRunProgress).set({ steps, updatedAt: now }).where(where);
    } else if (change.change === "skip") {
      await tx.update(firstRunProgress).set({ skippedAt: now, updatedAt: now }).where(where);
    } else if (change.change === "finish") {
      await tx.update(firstRunProgress).set({ completedAt: now, updatedAt: now }).where(where);
    } else {
      // Found again from help: from the start, as if new.
      await tx.update(firstRunProgress).set({ steps: [], skippedAt: null, completedAt: null, updatedAt: now }).where(where);
    }
    return { ok: true as const };
  });
}
