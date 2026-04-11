import { Suspense } from "react";
import { createClient } from "@/lib/supabase/server";
import { db } from "@/db";
import { profiles, requests, organizations, publishedViews, notifications } from "@/db/schema";
import { eq, and, sql, isNull, lte, or } from "drizzle-orm";
import { RequestsProvider } from "@/context/requests-context";
import { GlobalShortcutsProvider } from "@/components/ui/global-shortcuts-provider";
import { HotkeysProvider } from "@/components/shell/hotkeys-provider";
import { Sidebar } from "@/components/shell/sidebar";
import { DetailDock } from "@/components/shell/detail-dock";
import { StickyPad } from "@/components/stickies/sticky-pad";
import { SidebarProvider, SidebarInset } from "@/components/ui/sidebar";
import type { Request } from "@/db/schema";

export default async function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  let orgRequests: Request[] = [];
  let userPinnedViews: any[] = [];
  let inboxUnreadCount = 0;
  let userId = "";
  let profileRole = "member";
  let isTestUser = false;
  let userName = "";
  let userInitials = "";
  let orgName = "Lane";
  let orgPlan = "FREE";

  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();

    if (user) {
      userId = user.id;
      const [profile] = await db
        .select()
        .from(profiles)
        .where(eq(profiles.id, user.id));

      if (profile) {
        profileRole = profile.role ?? "member";
        isTestUser = profile.email === "hi.nikhilsharma@gmail.com";
        userName = profile.fullName ?? user.email?.split("@")[0] ?? "";
        userInitials = userName
          .split(" ")
          .map((w) => w[0])
          .join("")
          .toUpperCase()
          .slice(0, 2);

        const [org] = await db
          .select()
          .from(organizations)
          .where(eq(organizations.id, profile.orgId));
        if (org) {
          orgName = org.name ?? "Lane";
          orgPlan = (org as Record<string, unknown>).plan as string ?? "FREE";
        }

        orgRequests = await db
          .select()
          .from(requests)
          .where(eq(requests.orgId, profile.orgId));

        userPinnedViews = await db
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
              sql`${publishedViews.pinnedBy} @> ${JSON.stringify([user.id])}::jsonb`
            )
          );

        // Inbox unread count
        const now = new Date();
        const [{ value }] = await db
          .select({ value: sql<number>`count(*)::int` })
          .from(notifications)
          .where(
            and(
              eq(notifications.recipientId, user.id),
              isNull(notifications.archivedAt),
              isNull(notifications.readAt),
              or(
                isNull(notifications.snoozedUntil),
                lte(notifications.snoozedUntil, now)
              )
            )
          );
        inboxUnreadCount = value;
      }
    }
  } catch {
    // Pages handle auth redirects themselves
  }

  const activeCount = orgRequests.filter(
    (r) => !["completed", "shipped"].includes(r.status)
  ).length;

  return (
    <RequestsProvider requests={orgRequests}>
      <GlobalShortcutsProvider>
        <HotkeysProvider>
          <SidebarProvider>
            <Sidebar
              user={{ initials: userInitials || "U", name: userName || "User", role: profileRole === "lead" ? "Lead · Design" : profileRole }}
              userRole={profileRole}
              orgName={orgName}
              orgPlan={orgPlan}
              activeCount={activeCount}
              banner={{
                title: "Idea Board is live",
                description: "Anyone can submit ideas. Your org votes, AI validates the top picks.",
                ctaLabel: "Check it out",
                ctaHref: "/dashboard/ideas",
              }}
              inboxUnreadCount={inboxUnreadCount}
              pinnedViews={userPinnedViews}
            />
            <SidebarInset>
              {children}
            </SidebarInset>
            <Suspense>
              <DetailDock profileRole={profileRole} isTestUser={isTestUser} />
            </Suspense>
            <StickyPad />
          </SidebarProvider>
        </HotkeysProvider>
      </GlobalShortcutsProvider>
    </RequestsProvider>
  );
}
