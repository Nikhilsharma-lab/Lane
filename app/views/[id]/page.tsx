import { db } from "@/db";
import { publishedViews, requests } from "@/db/schema";
import type { ViewFilters } from "@/db/schema/published_views";
import { eq, and } from "drizzle-orm";
import { PublishedViewPage } from "@/components/published/published-view-page";
import { notFound } from "next/navigation";

export default async function ViewPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ token?: string }>;
}) {
  const { id } = await params;
  const { token } = await searchParams;

  const [view] = await db
    .select()
    .from(publishedViews)
    .where(
      and(eq(publishedViews.id, id), eq(publishedViews.isActive, true))
    );

  if (!view) notFound();

  if (view.accessMode === "public" && view.publicToken !== token) {
    notFound();
  }

  if (view.accessMode === "authenticated") {
    const { createClient } = await import("@/lib/supabase/server");
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) {
      const { redirect } = await import("next/navigation");
      redirect("/login");
    }
  }

  let filteredRequests = await db
    .select()
    .from(requests)
    .where(eq(requests.orgId, view.orgId));

  const f = view.filters as ViewFilters;
  if (f.phase?.length)
    filteredRequests = filteredRequests.filter(
      (r) => r.phase && f.phase!.includes(r.phase)
    );
  if (f.priority?.length)
    filteredRequests = filteredRequests.filter(
      (r) => r.priority && f.priority!.includes(r.priority)
    );
  if (f.projectId?.length)
    filteredRequests = filteredRequests.filter(
      (r) => r.projectId && f.projectId!.includes(r.projectId)
    );

  return (
    <PublishedViewPage
      view={view}
      requests={filteredRequests}
      isPublic={view.accessMode === "public"}
    />
  );
}
