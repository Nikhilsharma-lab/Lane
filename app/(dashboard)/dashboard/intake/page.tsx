import { redirect } from "next/navigation";

// Intake is now a filtered view on the unified Requests page
export default function IntakePage() {
  redirect("/dashboard/requests?phase=predesign&stage=intake");
}
