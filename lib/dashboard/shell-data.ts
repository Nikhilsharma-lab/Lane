import { and, eq, isNull, lte, or, sql } from "drizzle-orm";
import { db } from "@/db";
import {
  notifications,
  organizations,
  profiles,
  publishedViews,
  requests,
  workspaceMembers,
} from "@/db/schema";

export type ShellRequest = {
  id: string;
  title: string;
  status: string;
};

export type ShellPinnedView = {
  id: string;
  name: string;
  viewType: string;
  filters: unknown;
  groupBy: unknown;
  viewMode: unknown;
};

export type DashboardShellData =
  | { kind: "anonymous" }
  | { kind: "needs-onboarding"; userId: string }
  | {
      kind: "ready";
      userId: string;
      profileRole: string;
      isTestUser: boolean;
      userName: string;
      userInitials: string;
      orgName: string;
      orgPlan: string;
      requests: ShellRequest[];
      activeCount: number;
      pinnedViews: ShellPinnedView[];
      inboxUnreadCount: number;
    };

const INACTIVE_STATUSES = new Set(["completed", "shipped"]);

function initialsOf(name: string): string {
  return name
    .split(" ")
    .map((w) => w[0] ?? "")
    .join("")
    .toUpperCase()
    .slice(0, 2);
}

export async function getDashboardShellData(
  userId: string | null,
): Promise<DashboardShellData> {
  if (!userId) return { kind: "anonymous" };

  const [profile] = await db
    .select()
    .from(profiles)
    .where(eq(profiles.id, userId));

  if (!profile) return { kind: "anonymous" };

  // Onboarding gate — run before the heavier parallel queries so we can short
  // circuit when the user hasn't finished onboarding.
  const [membership] = await db
    .select({ onboardedAt: workspaceMembers.onboardedAt })
    .from(workspaceMembers)
    .where(
      and(
        eq(workspaceMembers.workspaceId, profile.orgId),
        eq(workspaceMembers.userId, userId),
      ),
    );

  if (!membership || !membership.onboardedAt) {
    return { kind: "needs-onboarding", userId };
  }

  const [org] = await db
    .select()
    .from(organizations)
    .where(eq(organizations.id, profile.orgId));

  const now = new Date();

  // Select only the columns the shell actually renders. Consumers that need
  // more fields (detail dock, etc.) fetch them through their own endpoints.
  const [shellRequests, pinnedViews, unread] = await Promise.all([
    db
      .select({
        id: requests.id,
        title: requests.title,
        status: requests.status,
      })
      .from(requests)
      .where(eq(requests.orgId, profile.orgId)),
    db
      .select({
        id: publishedViews.id,
        name: publishedViews.name,
        viewType: publishedViews.viewType,
        filters: publishedViews.filters,
        groupBy: publishedViews.groupBy,
        viewMode: publishedViews.viewMode,
      })
      .from(publishedViews)
      .where(
        and(
          eq(publishedViews.orgId, profile.orgId),
          eq(publishedViews.isActive, true),
          sql`${publishedViews.pinnedBy} @> ${JSON.stringify([userId])}::jsonb`,
        ),
      ),
    db
      .select({ value: sql<number>`count(*)::int` })
      .from(notifications)
      .where(
        and(
          eq(notifications.recipientId, userId),
          isNull(notifications.archivedAt),
          isNull(notifications.readAt),
          or(
            isNull(notifications.snoozedUntil),
            lte(notifications.snoozedUntil, now),
          ),
        ),
      ),
  ]);

  const userName = profile.fullName ?? profile.email?.split("@")[0] ?? "";
  const activeCount = shellRequests.reduce(
    (sum, r) => (INACTIVE_STATUSES.has(r.status) ? sum : sum + 1),
    0,
  );

  return {
    kind: "ready",
    userId,
    profileRole: profile.role ?? "member",
    isTestUser: profile.email === "hi.nikhilsharma@gmail.com",
    userName,
    userInitials: initialsOf(userName) || "U",
    orgName: org?.name ?? "Lane",
    orgPlan: ((org as Record<string, unknown> | undefined)?.plan as string) ?? "FREE",
    requests: shellRequests as ShellRequest[],
    activeCount,
    pinnedViews,
    inboxUnreadCount: unread[0]?.value ?? 0,
  };
}
