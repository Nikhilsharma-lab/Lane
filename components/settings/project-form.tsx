"use client";

import { useState } from "react";
import { createProject, updateProject } from "@/app/actions/projects";
import { PROJECT_COLORS } from "@/lib/projects";
import type { Project } from "@/db/schema";

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
      <div>
        <label className="block text-xs font-medium text-zinc-400 mb-1 uppercase tracking-wide">
          Name <span className="text-red-400">*</span>
        </label>
        <input
          name="name"
          defaultValue={project?.name}
          required
          className="w-full bg-zinc-950 border border-zinc-800 rounded-lg px-3 py-2 text-sm text-white placeholder-zinc-600 focus:outline-none focus:border-zinc-600 transition-colors"
          placeholder="e.g. Rider App"
        />
      </div>
      <div>
        <label className="block text-xs font-medium text-zinc-400 mb-1 uppercase tracking-wide">
          Description
        </label>
        <input
          name="description"
          defaultValue={project?.description ?? ""}
          className="w-full bg-zinc-950 border border-zinc-800 rounded-lg px-3 py-2 text-sm text-white placeholder-zinc-600 focus:outline-none focus:border-zinc-600 transition-colors"
          placeholder="Optional"
        />
      </div>
      <div>
        <label className="block text-xs font-medium text-zinc-400 mb-2 uppercase tracking-wide">Color</label>
        <div className="flex gap-2 flex-wrap">
          {PROJECT_COLORS.map((c) => (
            <button
              key={c}
              type="button"
              onClick={() => setColor(c)}
              className={`w-6 h-6 rounded-full transition-all ${
                color === c ? "ring-2 ring-offset-2 ring-offset-zinc-900 ring-white scale-110" : "hover:scale-105"
              }`}
              style={{ backgroundColor: c }}
            />
          ))}
        </div>
      </div>
      {error && <p className="text-xs text-red-400">{error}</p>}
      <div className="flex gap-2 pt-1">
        <button
          type="submit"
          disabled={loading}
          className="text-xs bg-white text-zinc-900 rounded-lg px-4 py-1.5 font-medium hover:bg-zinc-100 transition-colors disabled:opacity-50"
        >
          {loading ? "Saving…" : project ? "Save changes" : "Create project"}
        </button>
        <button type="button" onClick={onDone} className="text-xs text-zinc-400 hover:text-white px-4 py-1.5 transition-colors">
          Cancel
        </button>
      </div>
    </form>
  );
}
