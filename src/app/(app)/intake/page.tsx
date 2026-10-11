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

  // The crumb names the page "New Request" (REQUIREMENTS.md); the form's own h1 stays until plan item 2.3.
  return (
    <>
      <PageStrip title="New Request" />
      <IntakeForm
        context={{ orgId: result.orgId }}
        draftOwnerId={result.userId}
        initialProjectId={initialProjectId}
      />
    </>
  );
}
