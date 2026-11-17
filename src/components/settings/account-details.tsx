"use client";
import { SettingsRow } from "./settings-group";
import { Avatar } from "@/components/arc/avatar/avatar";
import { Button } from "@/components/arc/button/button";

/**
 * #287 (D32): Profile's account rows: who is signed in, then one "Manage account" row for the name, photo, email
 * and connected sign-in accounts, which Clerk's own profile manages. Search lands on that row (`manage-account`).
 */
export function AccountDetails({ name, email, image, onManage, loading = false }: { name: string; email: string; image?: string; onManage?: () => void; loading?: boolean }) {
  return <>
    <SettingsRow leading={<Avatar name={name} src={image} size="lg" unoptimized />} label={name} hint={email || "No email available"} />
    <SettingsRow id="manage-account" label="Manage account" hint="Name, photo, email and connected accounts such as Google."
      control={<Button variant="secondary" size="sm" disabled={!onManage || loading} onClick={onManage}>Manage account</Button>} />
  </>;
}
