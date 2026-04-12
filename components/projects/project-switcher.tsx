"use client";

import { useSearchParams, usePathname, useRouter } from "next/navigation";
import { NativeSelect } from "@/components/ui/native-select";

interface ProjectOption {
  id: string;
  name: string;
  color: string;
}

interface Props {
  projects: ProjectOption[];
}

export function ProjectSwitcher({ projects }: Props) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const current = searchParams.get("project") ?? "";

  function handleChange(e: React.ChangeEvent<HTMLSelectElement>) {
    const value = e.target.value;
    router.push(value ? `${pathname}?project=${value}` : pathname);
  }

  return (
    <NativeSelect
      value={current}
      onChange={handleChange}
    >
      <option value="">All projects</option>
      {projects.map((p) => (
        <option key={p.id} value={p.id}>
          {p.name}
        </option>
      ))}
    </NativeSelect>
  );
}
