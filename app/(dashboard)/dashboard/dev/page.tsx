import { redirect } from "next/navigation";

// Dev board is now a contextual kanban view inside the unified Requests page
export default function DevBoardPage() {
  redirect("/dashboard/requests?phase=dev&view=kanban");
}
