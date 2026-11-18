"use client";

import { ProfileRoleForm, type ProductRole } from "@/components/settings/profile-role-form";
import { updateProfileRole } from "./actions";

export function ProfileForm({ initialRole, orgId }: { initialRole: ProductRole; orgId: string }) {
  return <ProfileRoleForm initialRole={initialRole} onSave={(role) => updateProfileRole({ role }, { orgId })} />;
}
