"use client";

import { useState } from "react";
import { NativeSelect } from "@/components/ui/native-select";

type Manager = { id: string; fullName: string };

export function ReportsToSelect({
  memberId,
  currentManagerId,
  managers,
}: {
  memberId: string;
  currentManagerId: string | null;
  managers: Manager[];
}) {
  const [value, setValue] = useState(currentManagerId ?? "");
  const [saving, setSaving] = useState(false);

  async function handleChange(e: React.ChangeEvent<HTMLSelectElement>) {
    const newManagerId = e.target.value || null;
    const previousValue = value;
    setValue(e.target.value);
    setSaving(true);
    try {
      const res = await fetch(`/api/team/${memberId}/manager`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ managerId: newManagerId }),
      });
      if (!res.ok) {
        setValue(previousValue);
      }
    } catch {
      setValue(previousValue);
    } finally {
      setSaving(false);
    }
  }

  return (
    <NativeSelect
      value={value}
      onChange={handleChange}
      disabled={saving}
    >
      <option value="">No manager</option>
      {managers.map((m) => (
        <option key={m.id} value={m.id}>
          {m.fullName}
        </option>
      ))}
    </NativeSelect>
  );
}
