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
    <div className="max-w-2xl mx-auto py-8 px-6">
      <h1
        style={{
          fontSize: 18,
          fontWeight: 620,
          letterSpacing: "-0.02em",
          marginBottom: 4,
        }}
        className="text-foreground"
      >
        Notification Preferences
      </h1>
      <p
        style={{
          fontSize: 13,
          marginBottom: 24,
        }}
        className="text-muted-foreground"
      >
        Control how and when Lane reaches out to you.
      </p>
      <NotificationPrefsForm initialPrefs={prefs} />
    </div>
  );
}
