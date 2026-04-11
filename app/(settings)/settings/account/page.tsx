import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { db } from "@/db";
import { profiles } from "@/db/schema";
import { eq } from "drizzle-orm";
import { AccountForm } from "@/components/settings/account-form";
import { PasswordForm } from "@/components/settings/password-form";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";

export default async function AccountPage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");
  const [profile] = await db.select().from(profiles).where(eq(profiles.id, user.id));
  if (!profile) redirect("/login");

  return (
    <div className="max-w-lg space-y-8">
      <div>
        <h1 className="text-lg font-semibold text-foreground mb-1">Account</h1>
        <p className="text-sm text-muted-foreground">Manage your personal profile settings.</p>
      </div>

      <Card>
        <CardContent>
          <div className="flex items-center gap-4">
            <Avatar size="lg">
              <AvatarFallback>{profile.fullName.charAt(0).toUpperCase()}</AvatarFallback>
            </Avatar>
            <div>
              <p className="text-sm font-medium text-foreground">{profile.fullName}</p>
              <p className="text-xs text-muted-foreground">{profile.email}</p>
            </div>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Profile</CardTitle>
          <CardDescription>Update your name and timezone.</CardDescription>
        </CardHeader>
        <CardContent>
          <AccountForm profile={{ fullName: profile.fullName, email: profile.email, timezone: profile.timezone ?? "UTC" }} />
        </CardContent>
      </Card>

      <Separator />

      <Card>
        <CardHeader>
          <CardTitle>Change password</CardTitle>
          <CardDescription>You are already signed in, so no current password is required.</CardDescription>
        </CardHeader>
        <CardContent>
          <PasswordForm />
        </CardContent>
      </Card>
    </div>
  );
}
