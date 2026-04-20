import { Suspense } from "react";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { RequestsProvider } from "@/context/requests-context";
import { HotkeysProvider } from "@/components/shell/hotkeys-provider";
import { Sidebar } from "@/components/shell/sidebar";
import { DetailDock } from "@/components/shell/detail-dock";
import { StickyPad } from "@/components/stickies/sticky-pad";
import { SidebarProvider, SidebarInset } from "@/components/ui/sidebar";
import { getDashboardShellData } from "@/lib/dashboard/shell-data";

export default async function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const supabase = await createClient();
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();

  if (authError) {
    console.error("[dashboard-layout] supabase auth error:", authError);
  }

  const shell = await getDashboardShellData(user?.id ?? null);

  if (shell.kind === "needs-onboarding") {
    redirect("/onboarding");
  }

  const isReady = shell.kind === "ready";
  const requests = isReady ? shell.requests : [];
  const userName = isReady ? shell.userName : "";
  const userInitials = isReady ? shell.userInitials : "U";
  const profileRole = isReady ? shell.profileRole : "member";
  const orgName = isReady ? shell.orgName : "Lane";
  const orgPlan = isReady ? shell.orgPlan : "FREE";
  const activeCount = isReady ? shell.activeCount : 0;
  const inboxUnreadCount = isReady ? shell.inboxUnreadCount : 0;
  const isTestUser = isReady && shell.isTestUser;

  return (
    <RequestsProvider requests={requests}>
      <HotkeysProvider>
        <SidebarProvider>
          <Sidebar
            user={{
              initials: userInitials,
              name: userName || "User",
              role: profileRole === "lead" ? "Lead · Design" : profileRole,
            }}
            userRole={profileRole}
            orgName={orgName}
            orgPlan={orgPlan}
            activeCount={activeCount}
            inboxUnreadCount={inboxUnreadCount}
          />
          <SidebarInset>{children}</SidebarInset>
          <Suspense>
            <DetailDock profileRole={profileRole} isTestUser={isTestUser} />
          </Suspense>
          <StickyPad />
        </SidebarProvider>
      </HotkeysProvider>
    </RequestsProvider>
  );
}
