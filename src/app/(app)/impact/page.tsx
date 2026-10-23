import { redirect } from "next/navigation";
import { PageStrip } from "@/components/shell/page-strip";
import { ImpactScreenLive } from "@/components/impact/impact-screen-live";
import { parsePeriodKey } from "@/components/impact/impact-period";
import { getMember } from "@/lib/ensure-workspace";
import { loadImpactDashboard, loadTeammates, loadTeammateWork } from "@/lib/data/impact";

// The Dashboard (#159, spec #151): one read-only screen. Identity and workspace come from the Clerk session through
// getMember; the period and the teammate come from the URL and are checked against the viewer's own list before use.
export default async function ImpactPage({ searchParams }: { searchParams: Promise<{ period?: string; person?: string }> }) {
  const member = await getMember();
  if (!member) redirect("/login");

  const { period: periodKey, person: personId } = await searchParams;
  const period = parsePeriodKey(periodKey);
  const [dashboard, teammates] = await Promise.all([loadImpactDashboard(member, { period }), loadTeammates(member)]);
  // Only a person on the viewer's own list can be opened; anything else in the URL is ignored.
  const chosen = personId ? teammates.find(teammate => teammate.id === personId) ?? null : null;
  const entries = chosen ? await loadTeammateWork(member, chosen.id, { period }) : null;

  return <>
    <PageStrip title="Impact" heading />
    <ImpactScreenLive
      dashboard={dashboard}
      period={period}
      teammates={teammates}
      person={chosen && entries ? { id: chosen.id, name: chosen.name, entries } : null}
    />
  </>;
}
