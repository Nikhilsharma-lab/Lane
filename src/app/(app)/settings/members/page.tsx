import { redirect } from "next/navigation";
import { getWorkspace } from "@/lib/ensure-workspace";
import { ClerkMembersProfile } from "@/components/auth/clerk-members-profile";
import { MembersHost } from "@/components/auth/members-host";

export default async function MembersPage() {
  const workspace = await getWorkspace();
  if (!workspace) redirect("/login");
  if (workspace.needsOnboarding) redirect("/onboarding");
  if (workspace.role === "guest") redirect("/");

  return <MembersHost>
    <ClerkMembersProfile />
  </MembersHost>;
}
