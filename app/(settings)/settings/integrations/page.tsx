import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { db } from "@/db";
import { profiles, figmaConnections } from "@/db/schema";
import { eq } from "drizzle-orm";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";

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
    <div className="max-w-lg space-y-8">
      <div>
        <h1 className="text-lg font-semibold text-foreground mb-1">Integrations</h1>
        <p className="text-sm text-muted-foreground">Connect your tools to Lane</p>
      </div>

      {connected === "true" && (
        <Alert>
          <AlertDescription className="text-green-400">
            Figma connected successfully
          </AlertDescription>
        </Alert>
      )}
      {error && (
        <Alert variant="destructive">
          <AlertDescription>
            Connection failed — please try again
          </AlertDescription>
        </Alert>
      )}

      <div className="space-y-3">
        {/* Figma -- functional */}
        <Card>
          <CardContent>
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
                  <Button type="submit" variant="outline" size="sm">
                    Disconnect
                  </Button>
                </form>
              ) : (
                <Button
                  variant="outline"
                  size="sm"
                  render={<a href="/api/figma/oauth/connect" />}
                >
                  Connect Figma
                </Button>
              )}
            </div>
          </CardContent>
        </Card>

        {/* Slack -- coming soon */}
        <Card className="opacity-50">
          <CardContent>
            <div className="flex items-start justify-between gap-4">
              <div>
                <div className="flex items-center gap-2 mb-0.5">
                  <h2 className="text-sm font-medium text-foreground">Slack</h2>
                  <Badge variant="secondary">Coming soon</Badge>
                </div>
                <p className="text-xs text-muted-foreground">
                  Get notifications in Slack for sign-offs, handoffs, and alerts
                </p>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Linear -- coming soon */}
        <Card className="opacity-50">
          <CardContent>
            <div className="flex items-start justify-between gap-4">
              <div>
                <div className="flex items-center gap-2 mb-0.5">
                  <h2 className="text-sm font-medium text-foreground">Linear</h2>
                  <Badge variant="secondary">Coming soon</Badge>
                </div>
                <p className="text-xs text-muted-foreground">
                  Auto-create Linear issues on handoff and sync status back
                </p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
