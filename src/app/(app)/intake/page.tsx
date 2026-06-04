import { redirect } from "next/navigation";
import { ensureWorkspace } from "@/lib/ensure-workspace";
import IntakeForm from "./intake-form";

export default async function IntakePage() {
  const workspace = await ensureWorkspace();

  if (!workspace) {
    redirect("/login");
  }

  return (
    <IntakeForm
      context={{ userId: workspace.userId, orgId: workspace.orgId }}
    />
  );
}
