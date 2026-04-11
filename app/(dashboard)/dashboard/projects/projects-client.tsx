"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { createProject } from "@/app/actions/projects";
import { PROJECT_COLORS } from "@/lib/projects";
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
  const [selectedColor, setSelectedColor] = useState(PROJECT_COLORS[0]);
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
        <h1 style={{ fontSize: 18, fontWeight: 700, color: "var(--text-primary)", margin: 0 }}>
          Projects
        </h1>
        {canCreate && (
          <button
            onClick={() => setShowForm((v) => !v)}
            style={{
              fontSize: 13,
              fontWeight: 500,
              color: "#fff",
              background: "var(--accent, #2E5339)",
              border: "none",
              borderRadius: 6,
              padding: "6px 14px",
              cursor: "pointer",
            }}
          >
            + New Project
          </button>
        )}
      </div>

      {/* Inline creation form */}
      {showForm && (
        <form
          onSubmit={handleSubmit}
          style={{
            background: "var(--surface, #fff)",
            border: "1px solid var(--border)",
            borderRadius: 10,
            padding: "20px 24px",
            display: "flex",
            flexDirection: "column",
            gap: 16,
            maxWidth: 480,
          }}
        >
          <h2 style={{ fontSize: 14, fontWeight: 600, margin: 0, color: "var(--text-primary)" }}>
            New Project
          </h2>

          <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
            <label style={{ fontSize: 12, fontWeight: 500, color: "var(--text-secondary)" }}>
              Name <span style={{ color: "#ef4444" }}>*</span>
            </label>
            <input
              name="name"
              required
              placeholder="e.g. Checkout redesign"
              style={{
                fontSize: 13,
                padding: "7px 10px",
                borderRadius: 6,
                border: "1px solid var(--border)",
                background: "var(--bg, #F8F6F1)",
                color: "var(--text-primary)",
                outline: "none",
              }}
            />
          </div>

          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            <label style={{ fontSize: 12, fontWeight: 500, color: "var(--text-secondary)" }}>
              Color
            </label>
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
              {PROJECT_COLORS.map((c) => (
                <button
                  key={c}
                  type="button"
                  onClick={() => setSelectedColor(c)}
                  style={{
                    width: 22,
                    height: 22,
                    borderRadius: "50%",
                    background: c,
                    border: selectedColor === c ? "2px solid var(--text-primary)" : "2px solid transparent",
                    cursor: "pointer",
                    padding: 0,
                  }}
                  aria-label={`Select color ${c}`}
                />
              ))}
            </div>
          </div>

          <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
            <label style={{ fontSize: 12, fontWeight: 500, color: "var(--text-secondary)" }}>
              Target date (appetite)
            </label>
            <input
              name="targetDate"
              type="date"
              style={{
                fontSize: 13,
                padding: "7px 10px",
                borderRadius: 6,
                border: "1px solid var(--border)",
                background: "var(--bg, #F8F6F1)",
                color: "var(--text-primary)",
                outline: "none",
                width: "fit-content",
              }}
            />
          </div>

          {error && (
            <p style={{ fontSize: 12, color: "#ef4444", margin: 0 }}>{error}</p>
          )}

          <div style={{ display: "flex", gap: 8 }}>
            <button
              type="submit"
              disabled={isPending}
              style={{
                fontSize: 13,
                fontWeight: 500,
                color: "#fff",
                background: "var(--accent, #2E5339)",
                border: "none",
                borderRadius: 6,
                padding: "6px 16px",
                cursor: isPending ? "not-allowed" : "pointer",
                opacity: isPending ? 0.7 : 1,
              }}
            >
              {isPending ? "Creating…" : "Create"}
            </button>
            <button
              type="button"
              onClick={() => { setShowForm(false); setError(null); }}
              style={{
                fontSize: 13,
                fontWeight: 500,
                color: "var(--text-secondary)",
                background: "transparent",
                border: "1px solid var(--border)",
                borderRadius: 6,
                padding: "6px 16px",
                cursor: "pointer",
              }}
            >
              Cancel
            </button>
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
            color: "var(--text-tertiary)",
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
              <button
                key={project.id}
                onClick={() => router.push(`/dashboard/requests?project=${project.id}`)}
                style={{
                  background: "var(--surface, #fff)",
                  border: "1px solid var(--border)",
                  borderRadius: 10,
                  padding: "16px 18px",
                  textAlign: "left",
                  cursor: "pointer",
                  display: "flex",
                  flexDirection: "column",
                  gap: 10,
                  transition: "box-shadow 0.15s",
                }}
                onMouseEnter={(e) => {
                  (e.currentTarget as HTMLButtonElement).style.boxShadow = "0 2px 8px rgba(0,0,0,0.08)";
                }}
                onMouseLeave={(e) => {
                  (e.currentTarget as HTMLButtonElement).style.boxShadow = "none";
                }}
              >
                {/* Name row */}
                <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                  <span
                    style={{
                      width: 10,
                      height: 10,
                      borderRadius: "50%",
                      background: project.color,
                      flexShrink: 0,
                    }}
                  />
                  <span
                    style={{
                      fontSize: 14,
                      fontWeight: 600,
                      color: "var(--text-primary)",
                      overflow: "hidden",
                      textOverflow: "ellipsis",
                      whiteSpace: "nowrap",
                    }}
                  >
                    {project.name}
                  </span>
                </div>

                {/* Meta row */}
                <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                  <span style={{ fontSize: 12, color: "var(--text-tertiary)" }}>
                    {project.requestCount} request{project.requestCount === 1 ? "" : "s"}
                  </span>
                  {project.leadName && (
                    <span style={{ fontSize: 12, color: "var(--text-tertiary)" }}>
                      Lead: {project.leadName}
                    </span>
                  )}
                  {appetite && (
                    <span
                      style={{
                        fontSize: 11,
                        fontWeight: 500,
                        color: appetite.exceeded ? "#ef4444" : "var(--text-tertiary)",
                        marginTop: 2,
                      }}
                    >
                      {appetite.label}
                    </span>
                  )}
                </div>
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
