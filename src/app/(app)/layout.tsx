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
    <div className="flex h-screen">
      <Sidebar
        workspaceName={result.workspaceName}
        fullName={result.fullName}
        email={result.email}
        role={result.role}
      />
      <div className="flex flex-1 flex-col overflow-y-auto">
        {children}
      </div>
    </div>
  );
}
