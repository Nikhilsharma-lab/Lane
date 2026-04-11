import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getNotificationPreferences } from "@/app/actions/notification-preferences";
import { NotificationPrefsForm } from "@/components/settings/notification-prefs-form";

export default async function NotificationsSettingsPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const prefs = await getNotificationPreferences();

  return (
    <div className="max-w-2xl space-y-8">
      <div>
        <h1 className="text-lg font-semibold text-foreground mb-1">
          Notification Preferences
        </h1>
        <p className="text-sm text-muted-foreground">
          Control how and when Lane reaches out to you.
        </p>
      </div>
      <NotificationPrefsForm initialPrefs={prefs} />
    </div>
  );
}
