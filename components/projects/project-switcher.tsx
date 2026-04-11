"use client";

import { useSearchParams, usePathname, useRouter } from "next/navigation";

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
    <select
      value={current}
      onChange={handleChange}
      className="text-xs bg-muted border border text-muted-foreground rounded px-2 py-1 focus:outline-none focus:border-border/80 transition-colors cursor-pointer"
    >
      <option value="">All projects</option>
      {projects.map((p) => (
        <option key={p.id} value={p.id}>
          {p.name}
        </option>
      ))}
    </select>
  );
}
