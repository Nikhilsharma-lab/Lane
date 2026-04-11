import { redirect } from "next/navigation";

export default function BettingBoardPage() {
  redirect("/dashboard/requests?phase=predesign&stage=bet");
}
