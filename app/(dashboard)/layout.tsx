import { Suspense } from "react";
import { createClient } from "@/lib/supabase/server";
import { db } from "@/db";
import { profiles, requests, organizations } from "@/db/schema";
import { eq } from "drizzle-orm";
import { RequestsProvider } from "@/context/requests-context";
import { GlobalShortcutsProvider } from "@/components/ui/global-shortcuts-provider";
import { Sidebar } from "@/components/shell/sidebar";
import { DetailDock } from "@/components/shell/detail-dock";
import type { Request, Profile, Organization } from "@/db/schema";

export default async function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  let orgRequests: Request[] = [];
  let userId = "";
  let profileRole = "member";
  let isTestUser = false;
  let userProfile: Profile | null = null;
  let userOrg: Organization | null = null;

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
        userProfile = profile;
        profileRole = profile.role ?? "member";
        isTestUser = profile.email === "hi.nikhilsharma@gmail.com";

        const [org] = await db
          .select()
          .from(organizations)
          .where(eq(organizations.id, profile.orgId));
        userOrg = org ?? null;

        orgRequests = await db
          .select()
          .from(requests)
          .where(eq(requests.orgId, profile.orgId));
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
        <div style={{ display: "flex", minHeight: "100vh", background: "var(--bg-base)" }}>
          {userProfile && userOrg && (
            <Sidebar
              profile={userProfile}
              org={userOrg}
              activeRequestCount={activeCount}
              banner={{
                title: "AI Context Briefs are live",
                description: "Designers now get auto-generated briefs when they open a request — fewer Slack threads, faster starts.",
                ctaLabel: "Learn more",
                ctaHref: "/dashboard/insights",
              }}
            />
          )}
          <main style={{ flex: 1, minWidth: 0, overflowY: "auto" }}>
            {children}
          </main>
          <Suspense>
            <DetailDock profileRole={profileRole} isTestUser={isTestUser} />
          </Suspense>
        </div>
      </GlobalShortcutsProvider>
    </RequestsProvider>
  );
}
