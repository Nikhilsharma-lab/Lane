import { redirect } from "next/navigation";

export default function JourneyViewPage() {
  redirect("/dashboard/requests?group=phase");
}
