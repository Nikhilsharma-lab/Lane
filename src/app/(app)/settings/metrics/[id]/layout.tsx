import { headers } from "next/headers";
import { notFound } from "next/navigation";
import { getWorkspace } from "@/lib/ensure-workspace";
import { readMetricPage } from "@/lib/data/metric-page";

/**
 * A Metric that isn't this workspace's answers a real 404, as an unknown Request does (requests/[id]/layout.tsx):
 * the status can only change before the page starts streaming, and the skeleton (loading.tsx, inside this layout)
 * streams first, so the check sits here, on the page's own read. The Metrics list's own skeleton sits in its
 * (library) group so that it doesn't wrap this page and start the stream earlier. A move inside the app or a read ahead (an RSC
 * request) has no status to set and goes straight on; the page answers it with "Page not found" as before. Anyone
 * the page sends elsewhere (signed out, onboarding, a Guest) is left to the page.
 */
export default async function MetricLayout({ children, params }: { children: React.ReactNode; params: Promise<{ id: string }> }) {
  if ((await headers()).get("rsc") !== "1") {
    const [{ id }, workspace] = await Promise.all([params, getWorkspace()]);
    if (workspace && !workspace.needsOnboarding && workspace.role !== "guest" && !(await readMetricPage(workspace, id))) notFound();
  }
  return children;
}
