import { redirect } from "next/navigation";
import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { ensureWorkspace } from "@/lib/ensure-workspace";
import { logout } from "./(auth)/actions";
import { Button } from "@/components/ui/button";

export default async function Home() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  // Defense-in-depth: proxy already redirects, but getUser() is the secure
  // server-side check recommended by Supabase (proxy tokens can be stale).
  if (!user) {
    redirect("/login");
  }

  // Ensure the user has a profile + workspace (creates defaults on first visit)
  await ensureWorkspace();

  return (
    <div className="flex flex-1 flex-col">
      <header className="flex items-center justify-between border-b px-6 py-4">
        <h1 className="text-lg font-semibold tracking-tight">Lane</h1>
        <div className="flex items-center gap-4">
          <span className="text-sm text-muted-foreground">{user.email}</span>
          <form action={logout}>
            <Button variant="outline" size="sm" type="submit">
              Log out
            </Button>
          </form>
        </div>
      </header>
      <main className="flex flex-1 items-center justify-center">
        <div className="text-center">
          <p className="mb-4 text-muted-foreground">
            You&apos;re signed in. Submit a design request to get started.
          </p>
          <Link href="/intake">
            <Button>New request</Button>
          </Link>
        </div>
      </main>
    </div>
  );
}
