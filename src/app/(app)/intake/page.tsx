import { redirect } from "next/navigation";
import { getWorkspace } from "@/lib/ensure-workspace";
import { parseRequestProjectFilter } from "@/lib/request-workspace";
import { PageStrip } from "@/components/shell/page-strip";
import IntakeForm from "./intake-form";

export default async function IntakePage({ searchParams }: {
  searchParams: Promise<{ project?: string | string[] }>;
}) {
  const [result, query] = await Promise.all([getWorkspace(), searchParams]);
  const project = parseRequestProjectFilter(query.project);
  const initialProjectId = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(project) ? project : null;

  if (!result) redirect("/login");
  if (result.needsOnboarding) redirect("/onboarding");

  // Plan item 2.3: the strip is the page's h1 and names the surface "New Request",
  // as the drawer does (decision 8.10). The form has no heading of its own.
  return (
    <>
      <PageStrip title="New Request" heading />
      <IntakeForm
        context={{ orgId: result.orgId }}
        draftOwnerId={result.userId}
        initialProjectId={initialProjectId}
      />
    </>
  );
}
