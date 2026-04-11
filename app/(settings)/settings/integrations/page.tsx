import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { db } from "@/db";
import { profiles, figmaConnections } from "@/db/schema";
import { eq } from "drizzle-orm";

export default async function IntegrationsPage({
  searchParams,
}: {
  searchParams: Promise<{ connected?: string; error?: string }>;
}) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const [profile] = await db.select().from(profiles).where(eq(profiles.id, user.id));
  if (!profile) redirect("/login");

  const [connection] = await db
    .select()
    .from(figmaConnections)
    .where(eq(figmaConnections.orgId, profile.orgId));

  const { connected, error } = await searchParams;

  let connectorName: string | null = null;
  if (connection?.connectedById) {
    const [connector] = await db
      .select({ fullName: profiles.fullName })
      .from(profiles)
      .where(eq(profiles.id, connection.connectedById));
    connectorName = connector?.fullName ?? null;
  }

  return (
    <div>
      <h1 className="text-lg font-semibold text-foreground mb-1">Integrations</h1>
      <p className="text-sm text-muted-foreground mb-8">Connect your tools to Lane</p>

      {connected === "true" && (
        <div className="mb-6 bg-green-500/5 border border-green-500/20 rounded-lg px-4 py-3">
          <p className="text-sm text-green-400">Figma connected successfully</p>
        </div>
      )}
      {error && (
        <div className="mb-6 bg-red-500/5 border border-red-500/20 rounded-lg px-4 py-3">
          <p className="text-sm text-red-400">Connection failed — please try again</p>
        </div>
      )}

      <div className="space-y-3">
        {/* Figma — functional */}
        <div className="border rounded-xl p-5">
          <div className="flex items-start justify-between gap-4">
            <div>
              <h2 className="text-sm font-medium text-foreground mb-0.5">Figma</h2>
              <p className="text-xs text-muted-foreground mb-1.5">
                Track design file updates and post-handoff changes
              </p>
              {connection && (
                <p className="text-xs text-muted-foreground/60">
                  <span className="inline-block w-1.5 h-1.5 rounded-full bg-green-500 mr-1.5 align-middle" />
                  Connected{connectorName ? ` by ${connectorName}` : ""}{" · "}
                  {new Date(connection.createdAt).toLocaleDateString("en-US", {
                    month: "short",
                    day: "numeric",
                  })}
                </p>
              )}
            </div>
            {connection ? (
              <form action="/api/figma/oauth/disconnect" method="POST">
                <button
                  type="submit"
                  className="text-xs text-muted-foreground hover:text-red-400 border hover:border-red-500/20 px-3 py-1.5 rounded-lg transition-colors"
                >
                  Disconnect
                </button>
              </form>
            ) : (
              <a
                href="/api/figma/oauth/connect"
                className="text-xs bg-primary/10 hover:bg-primary/20 border border-primary/20 text-primary px-3 py-1.5 rounded-lg transition-colors"
              >
                Connect Figma
              </a>
            )}
          </div>
        </div>

        {/* Slack — coming soon */}
        <div className="border rounded-xl p-5 opacity-50">
          <div className="flex items-start justify-between gap-4">
            <div>
              <div className="flex items-center gap-2 mb-0.5">
                <h2 className="text-sm font-medium text-foreground">Slack</h2>
                <span className="text-[10px] bg-accent text-muted-foreground px-1.5 py-0.5 rounded">
                  Coming soon
                </span>
              </div>
              <p className="text-xs text-muted-foreground">
                Get notifications in Slack for sign-offs, handoffs, and alerts
              </p>
            </div>
          </div>
        </div>

        {/* Linear — coming soon */}
        <div className="border rounded-xl p-5 opacity-50">
          <div className="flex items-start justify-between gap-4">
            <div>
              <div className="flex items-center gap-2 mb-0.5">
                <h2 className="text-sm font-medium text-foreground">Linear</h2>
                <span className="text-[10px] bg-accent text-muted-foreground px-1.5 py-0.5 rounded">
                  Coming soon
                </span>
              </div>
              <p className="text-xs text-muted-foreground">
                Auto-create Linear issues on handoff and sync status back
              </p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
