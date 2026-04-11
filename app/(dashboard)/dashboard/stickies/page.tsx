import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getMyStickies } from "@/app/actions/stickies";
import { StickiesPanel } from "@/components/stickies/stickies-panel";

export default async function StickiesPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const myStickies = await getMyStickies();

  return (
    <div className="flex-1 overflow-y-auto px-6 py-6">
      <h1
        style={{
          fontSize: 18,
          fontWeight: 620,
          letterSpacing: "-0.02em",
          marginBottom: 16,
        }}
        className="text-foreground"
      >
        Stickies
      </h1>
      <StickiesPanel stickies={myStickies} />
    </div>
  );
}
