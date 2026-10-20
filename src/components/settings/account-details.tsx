"use client";
import { SettingsCard } from "./settings-card";
import { Avatar } from "@/components/arc/avatar/avatar";
import { Button } from "@/components/arc/button/button";
import styles from "./settings.module.css";
export function AccountDetails({ name, email, image, onManage, loading = false }: { name: string; email: string; image?: string; onManage?: () => void; loading?: boolean }) {
  return <SettingsCard title="Account details" description="Your profile photo, name, and email address."
    footer="Manage your profile and verified email addresses."
    action={<Button variant="secondary" size="sm" disabled={!onManage || loading} onClick={onManage}>Manage account</Button>}>
    <div className={styles.identity}>
      <Avatar name={name} src={image} size="lg" unoptimized />
      <div className={styles.identityText}><strong>{name}</strong><p>{email || "No email available"}</p></div>
    </div>
  </SettingsCard>;
}
