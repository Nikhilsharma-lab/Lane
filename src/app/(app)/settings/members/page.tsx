import { OrganizationProfile } from "@clerk/nextjs";
import { redirect } from "next/navigation";

import { SettingsNav } from "../settings-nav";
import { Typography } from "@/components/ui/typography";
import { getWorkspace } from "@/lib/ensure-workspace";

export default async function MembersPage() {
  const workspace = await getWorkspace();
  if (!workspace) redirect("/login");
  if (workspace.needsOnboarding) redirect("/onboarding");
  if (workspace.role === "guest") redirect("/");

  return (
    <div className="flex flex-1 flex-col">
      <header className="border-b px-4 py-4 sm:px-6">
        <Typography as="h1" role="pageTitle">
          Settings
        </Typography>
      </header>
      <SettingsNav isGuest={false} />

      <main className="mx-auto w-full max-w-3xl flex-1 px-4 py-6 sm:px-6 sm:py-8">
        <OrganizationProfile
          routing="hash"
          afterLeaveOrganizationUrl="/onboarding"
          appearance={{
            elements: {
              rootBox: "w-full",
              cardBox: "w-full border shadow-none",
              card: "w-full shadow-none",
            },
          }}
        />
      </main>
    </div>
  );
}
