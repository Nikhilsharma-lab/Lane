"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { createProject } from "@/app/actions/projects";
import { PROJECT_COLORS, type ProjectColor } from "@/lib/projects";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import type { Project } from "@/db/schema";

interface RequestCount {
  projectId: string | null;
  total: number;
}

interface ProjectWithMeta extends Project {
  requestCount: number;
  leadName: string | null;
}

interface ProjectsClientProps {
  projects: ProjectWithMeta[];
  canCreate: boolean;
}

function appetiteLabel(targetDate: string | null): { label: string; exceeded: boolean } | null {
  if (!targetDate) return null;
  const target = new Date(targetDate);
  const now = new Date();
  // Strip time for day comparison
  const targetDay = new Date(target.getFullYear(), target.getMonth(), target.getDate());
  const todayDay = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const diffMs = todayDay.getTime() - targetDay.getTime();
  const diffDays = Math.round(diffMs / (1000 * 60 * 60 * 24));

  if (diffDays > 0) {
    return {
      label: `Appetite exceeded by ${diffDays} day${diffDays === 1 ? "" : "s"}`,
      exceeded: true,
    };
  }
  const daysLeft = -diffDays;
  if (daysLeft === 0) return { label: "Target date: today", exceeded: false };
  return {
    label: `${daysLeft} day${daysLeft === 1 ? "" : "s"} remaining`,
    exceeded: false,
  };
}

export function ProjectsClient({ projects, canCreate }: ProjectsClientProps) {
  const router = useRouter();
  const [showForm, setShowForm] = useState(false);
  const [selectedColor, setSelectedColor] = useState<ProjectColor>(PROJECT_COLORS[0]);
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    const form = e.currentTarget;
    const formData = new FormData(form);
    formData.set("color", selectedColor);

    startTransition(async () => {
      const result = await createProject(formData);
      if ("error" in result && result.error) {
        setError(result.error);
      } else {
        setShowForm(false);
        form.reset();
        setSelectedColor(PROJECT_COLORS[0]);
        router.refresh();
      }
    });
  }

  return (
    <div style={{ flex: 1, display: "flex", flexDirection: "column", gap: 24, padding: "24px 32px" }}>
      {/* Toolbar */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
        <h1 style={{ fontSize: 18, fontWeight: 700, color: "var(--foreground)", margin: 0 }}>
          Projects
        </h1>
        {canCreate && (
          <Button
            variant="default"
            size="sm"
            onClick={() => setShowForm((v) => !v)}
          >
            + New Project
          </Button>
        )}
      </div>

      {/* Inline creation form */}
      {showForm && (
        <form
          onSubmit={handleSubmit}
          style={{
            background: "var(--card)",
            border: "1px solid var(--border)",
            borderRadius: 10,
            padding: "20px 24px",
            display: "flex",
            flexDirection: "column",
            gap: 16,
            maxWidth: 480,
          }}
        >
          <h2 style={{ fontSize: 14, fontWeight: 600, margin: 0, color: "var(--foreground)" }}>
            New Project
          </h2>

          <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
            <label style={{ fontSize: 12, fontWeight: 500, color: "var(--muted-foreground)" }}>
              Name <span style={{ color: "var(--accent-danger)" }}>*</span>
            </label>
            <Input
              name="name"
              required
              placeholder="e.g. Checkout redesign"
            />
          </div>

          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            <label style={{ fontSize: 12, fontWeight: 500, color: "var(--muted-foreground)" }}>
              Color
            </label>
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
              {PROJECT_COLORS.map((c) => (
                <Button
                  key={c}
                  type="button"
                  variant="ghost"
                  onClick={() => setSelectedColor(c)}
                  className="w-[22px] h-[22px] rounded-full p-0 min-w-0"
                  style={{
                    background: c,
                    border: selectedColor === c ? "2px solid var(--foreground)" : "2px solid transparent",
                  }}
                  aria-label={`Select color ${c}`}
                />
              ))}
            </div>
          </div>

          <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
            <label style={{ fontSize: 12, fontWeight: 500, color: "var(--muted-foreground)" }}>
              Target date (appetite)
            </label>
            <Input
              name="targetDate"
              type="date"
              className="w-fit"
            />
          </div>

          {error && (
            <p style={{ fontSize: 12, color: "var(--accent-danger)", margin: 0 }}>{error}</p>
          )}

          <div style={{ display: "flex", gap: 8 }}>
            <Button
              type="submit"
              variant="default"
              size="sm"
              disabled={isPending}
            >
              {isPending ? "Creating…" : "Create"}
            </Button>
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => { setShowForm(false); setError(null); }}
            >
              Cancel
            </Button>
          </div>
        </form>
      )}

      {/* Project grid */}
      {projects.length === 0 ? (
        <div
          style={{
            marginTop: 40,
            padding: "48px 24px",
            textAlign: "center",
            borderRadius: 12,
            border: "1px dashed var(--border)",
            color: "color-mix(in oklch, var(--muted-foreground) 60%, transparent)",
            fontSize: 13,
          }}
        >
          No projects yet. Projects help organize requests by product area.
        </div>
      ) : (
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fill, minmax(240px, 1fr))",
            gap: 16,
          }}
        >
          {projects.map((project) => {
            const appetite = appetiteLabel(project.targetDate);
            return (
              <Button
                key={project.id}
                variant="ghost"
                onClick={() => router.push(`/dashboard/requests?project=${project.id}`)}
                className="h-auto flex flex-col items-stretch gap-2.5 p-4 text-left bg-card border border-border rounded-[10px] hover:shadow-[0_2px_8px_rgba(0,0,0,0.08)] transition-shadow"
              >
                {/* Name row */}
                <div className="flex items-center gap-2">
                  <span
                    className="w-2.5 h-2.5 rounded-full shrink-0"
                    style={{ background: project.color }}
                  />
                  <span className="text-sm font-semibold text-foreground overflow-hidden text-ellipsis whitespace-nowrap">
                    {project.name}
                  </span>
                </div>

                {/* Meta row */}
                <div className="flex flex-col gap-1">
                  <span className="text-xs text-muted-foreground/60">
                    {project.requestCount} request{project.requestCount === 1 ? "" : "s"}
                  </span>
                  {project.leadName && (
                    <span className="text-xs text-muted-foreground/60">
                      Lead: {project.leadName}
                    </span>
                  )}
                  {appetite && (
                    <span
                      className={`text-[11px] font-medium mt-0.5 ${
                        appetite.exceeded ? "text-[var(--accent-danger)]" : "text-muted-foreground/60"
                      }`}
                    >
                      {appetite.label}
                    </span>
                  )}
                </div>
              </Button>
            );
          })}
        </div>
      )}
    </div>
  );
}
