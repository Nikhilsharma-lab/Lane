"use client";

import { useState } from "react";
import { createProject, updateProject } from "@/app/actions/projects";
import { PROJECT_COLORS } from "@/lib/projects";
import type { Project } from "@/db/schema";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Alert, AlertDescription } from "@/components/ui/alert";

interface Props {
  project?: Project;
  onDone: () => void;
}

export function ProjectForm({ project, onDone }: Props) {
  const [color, setColor] = useState(project?.color ?? PROJECT_COLORS[0]);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setLoading(true);
    setError(null);
    const formData = new FormData(e.currentTarget);
    formData.set("color", color);
    const result = project
      ? await updateProject(project.id, formData)
      : await createProject(formData);
    setLoading(false);
    if (result?.error) { setError(result.error); return; }
    onDone();
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-3">
      <div className="space-y-1.5">
        <Label htmlFor="project-name">
          Name <span className="text-destructive">*</span>
        </Label>
        <Input
          id="project-name"
          name="name"
          defaultValue={project?.name}
          required
          placeholder="e.g. Rider App"
        />
      </div>
      <div className="space-y-1.5">
        <Label htmlFor="project-desc">Description</Label>
        <Input
          id="project-desc"
          name="description"
          defaultValue={project?.description ?? ""}
          placeholder="Optional"
        />
      </div>
      <div className="space-y-2">
        <Label>Color</Label>
        <div className="flex gap-2 flex-wrap">
          {PROJECT_COLORS.map((c) => (
            // eslint-disable-next-line no-restricted-syntax -- color swatch with dynamic style
            <button
              key={c}
              type="button"
              onClick={() => setColor(c)}
              className={`w-6 h-6 rounded-full transition-all ${
                color === c ? "ring-2 ring-offset-2 ring-offset-card ring-primary scale-110" : "hover:scale-105"
              }`}
              /* Color swatches are intentionally inline since they're dynamic DB values */
              style={{ backgroundColor: c }}
            />
          ))}
        </div>
      </div>
      {error && (
        <Alert variant="destructive">
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}
      <div className="flex gap-2 pt-1">
        <Button type="submit" disabled={loading} size="sm">
          {loading ? "Saving..." : project ? "Save changes" : "Create project"}
        </Button>
        <Button type="button" variant="ghost" size="sm" onClick={onDone}>
          Cancel
        </Button>
      </div>
    </form>
  );
}
