import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { PageStrip } from "@/components/shell/page-strip";
import { ImpactScreenLive } from "@/components/impact/impact-screen-live";
import { readImpactAddress, tabToOpen } from "@/components/impact/impact-href";
import { getMember } from "@/lib/ensure-workspace";
import { loadImpactPage } from "@/lib/data/impact";
import { timePage, timed } from "@/lib/request-timings";
import { canCreateRequests } from "@/lib/role-rules";

// #271 (A114): the tab reads "Impact · Lane".
export const metadata: Metadata = { title: "Impact" };

type Query = Record<"tab" | "period" | "person", string | string[] | undefined>;

// The Impact page (#159, spec #151; Outcome report #208; #283): one read-only screen. Identity and workspace come from
// the session seam through getMember; the tab, period and teammate come from the address and are checked before use.
export default async function ImpactPage({ searchParams }: { searchParams: Promise<Partial<Query>> }) {
  void timePage("Impact");
  const member = await getMember();
  if (!member) redirect("/login");

  const address = readImpactAddress(await searchParams);
  const { dashboard, teammates, person } = await timed("data", () => loadImpactPage(member, { period: address.period, personId: address.person ?? undefined }));
  // #285: the shared "can create Requests" rule. Someone who can't file opens on the Outcome report (Nikhil, 2026-11-09).
  const canFile = canCreateRequests(member.role);

  return <>
    <PageStrip title="Impact" heading />
    <ImpactScreenLive
      dashboard={dashboard}
      period={address.period}
      teammates={teammates}
      person={person}
      tab={tabToOpen(address.tab, { canFile })}
      canFile={canFile}
      quarterNoteEditor={member.role === "admin" ? { orgId: member.orgId } : null}
    />
  </>;
}
