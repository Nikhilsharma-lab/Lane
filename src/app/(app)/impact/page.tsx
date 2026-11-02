import { redirect } from "next/navigation";
import { PageStrip } from "@/components/shell/page-strip";
import { ImpactScreenLive } from "@/components/impact/impact-screen-live";
import { parsePeriodKey } from "@/components/impact/period-picker";
import { getMember } from "@/lib/ensure-workspace";
import { loadImpactPage } from "@/lib/data/impact";
import { timePage, timed } from "@/lib/request-timings";

// The Impact page (#159, spec #151; Outcome report #208): one read-only screen. Identity and workspace come from the
// Clerk session through getMember; the period and the teammate come from the URL and are checked before use.
export default async function ImpactPage({ searchParams }: { searchParams: Promise<{ period?: string; person?: string }> }) {
  void timePage("Impact");
  const member = await getMember();
  if (!member) redirect("/login");

  const { period: periodKey, person: personId } = await searchParams;
  const period = parsePeriodKey(periodKey);
  const { dashboard, teammates, person } = await timed("data", () => loadImpactPage(member, { period, personId }));

  return <>
    <PageStrip title="Impact" heading />
    <ImpactScreenLive
      dashboard={dashboard}
      period={period}
      teammates={teammates}
      person={person}
      initialTab={period && !person ? "outcome-report" : "my-work"}
      quarterNoteEditor={member.role === "admin" ? { orgId: member.orgId } : null}
    />
  </>;
}
