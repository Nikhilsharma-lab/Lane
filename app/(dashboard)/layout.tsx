import { Suspense } from "react";
import { createClient } from "@/lib/supabase/server";
import { db } from "@/db";
import { profiles, requests } from "@/db/schema";
import { eq } from "drizzle-orm";
import { RequestsProvider } from "@/context/requests-context";
import { GlobalShortcutsProvider } from "@/components/ui/global-shortcuts-provider";
import { IconRail } from "@/components/shell/icon-rail";
import { GlobalPane } from "@/components/shell/global-pane";
import { DetailDock } from "@/components/shell/detail-dock";
import type { Request } from "@/db/schema";

export default async function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  let orgRequests: Request[] = [];
  let userId = "";

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
        orgRequests = await db
          .select()
          .from(requests)
          .where(eq(requests.orgId, profile.orgId));
      }
    }
  } catch {
    // Pages handle auth redirects themselves
  }

  return (
    <RequestsProvider requests={orgRequests}>
      <GlobalShortcutsProvider>
        <div style={{ display: "flex", minHeight: "100vh", background: "var(--bg-base)" }}>
          <IconRail />
          <GlobalPane userId={userId} />
          <main style={{ flex: 1, minWidth: 0, overflowY: "auto" }}>
            {children}
          </main>
          <Suspense>
            <DetailDock />
          </Suspense>
        </div>
      </GlobalShortcutsProvider>
    </RequestsProvider>
  );
}
