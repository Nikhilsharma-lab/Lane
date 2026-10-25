import { redirect } from "next/navigation";
import { AccountProfile, AccountSecurity } from "@/components/settings/account-profile";
import { ClerkMembersProfile, ClerkWorkspaceProfile } from "@/components/auth/clerk-members-profile";
import { MetricDefinitionList } from "@/components/metrics/metric-definition-list";
import { SettingsCard } from "@/components/settings/settings-card";
import { SettingsCommandAdapter } from "@/components/settings/settings-command-adapter";
import { getWorkspace } from "@/lib/ensure-workspace";
import { listMetricDefinitions } from "@/lib/metrics-library";
import { ProfileForm } from "../profile/profile-form";
import { ThemePreference } from "../profile/theme-preference";

/** Settings → Metrics (#196): the workspace's Metrics library. Members and Admins only. */
export default async function MetricsPage({ searchParams }: { searchParams: Promise<{ section?: string }> }) {
  const workspace = await getWorkspace();
  if (!workspace) redirect("/login");
  if (workspace.needsOnboarding) redirect("/onboarding");
  if (workspace.role === "guest") redirect("/");

  const [{ section }, definitions] = await Promise.all([searchParams, listMetricDefinitions({ orgId: workspace.orgId })]);
  return <SettingsCommandAdapter page="metrics" membership={workspace.role} workspaceName={workspace.workspaceName} workspaceId={workspace.orgId} initialSection={section ?? "metrics"}
    metrics={<SettingsCard title="Metric definitions" footer="Pass/fail checks are chosen on each Request and aren't part of the library.">
      <MetricDefinitionList definitions={definitions} />
    </SettingsCard>}
    members={<ClerkMembersProfile />} workspaceManagement={<ClerkWorkspaceProfile />}
    account={<AccountProfile fallbackName={workspace.fullName} fallbackEmail={workspace.email} />}
    security={<AccountSecurity />} role={<ProfileForm initialRole={workspace.profileRole} orgId={workspace.orgId} />} appearance={<ThemePreference compact />} />;
}
