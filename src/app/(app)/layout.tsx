import { redirect } from "next/navigation";
import { getWorkspace } from "@/lib/ensure-workspace";
import { Sidebar } from "@/components/shell/sidebar";

export default async function AppLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const result = await getWorkspace();
  if (!result) redirect("/login");
  if (result.needsOnboarding) redirect("/onboarding");

  return (
    <div className="flex min-h-dvh flex-col xl:h-screen xl:flex-row">
      <Sidebar
        workspaceName={result.workspaceName}
        fullName={result.fullName}
        email={result.email}
        role={result.role}
        orgId={result.orgId}
      />
      <div className="flex min-h-0 min-w-0 flex-1 flex-col overflow-y-auto">
        {children}
      </div>
    </div>
  );
}
