"use client";

import { useState } from "react";
import { archiveProject, unarchiveProject, deleteProject } from "@/app/actions/projects";
import { ProjectForm } from "./project-form";
import type { Project } from "@/db/schema";

interface Props {
  activeProjects: Project[];
  archivedProjects: Project[];
}

export function ProjectList({ activeProjects, archivedProjects }: Props) {
  const [editingId, setEditingId] = useState<string | null>(null);
  const [showArchived, setShowArchived] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<Project | null>(null);
  const [deleteAction, setDeleteAction] = useState<"move" | "delete" | null>(null);
  const [moveToId, setMoveToId] = useState("");
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const [deleteLoading, setDeleteLoading] = useState(false);
  const [showCreateForm, setShowCreateForm] = useState(false);
  const [archiveError, setArchiveError] = useState<string | null>(null);
  const [loadingId, setLoadingId] = useState<string | null>(null);

  async function handleArchive(projectId: string) {
    setLoadingId(projectId);
    setArchiveError(null);
    const result = await archiveProject(projectId);
    setLoadingId(null);
    if (result?.error) setArchiveError(result.error);
  }

  async function handleUnarchive(projectId: string) {
    setLoadingId(projectId);
    setArchiveError(null);
    const result = await unarchiveProject(projectId);
    setLoadingId(null);
    if (result?.error) setArchiveError(result.error);
  }

  async function handleDeleteConfirm() {
    if (!deleteTarget || !deleteAction) return;
    setDeleteLoading(true);
    setDeleteError(null);
    const result = await deleteProject(
      deleteTarget.id,
      deleteAction,
      deleteAction === "move" ? moveToId : undefined
    );
    setDeleteLoading(false);
    if (result?.error) { setDeleteError(result.error); return; }
    setDeleteTarget(null);
    setDeleteAction(null);
    setMoveToId("");
  }

  const moveTargets = activeProjects.filter((p) => p.id !== deleteTarget?.id);

  return (
    <div className="space-y-8">
      {/* Create new project */}
      <div className="border border-zinc-800 rounded-xl px-6 py-5">
        {showCreateForm ? (
          <ProjectForm onDone={() => setShowCreateForm(false)} />
        ) : (
          <button
            onClick={() => setShowCreateForm(true)}
            className="text-sm text-zinc-400 hover:text-white transition-colors flex items-center gap-2"
          >
            <span className="text-lg leading-none">+</span> New project
          </button>
        )}
      </div>

      {/* Active projects */}
      {activeProjects.length > 0 && (
        <div>
          <h2 className="text-xs font-medium text-zinc-500 uppercase tracking-wide mb-3">Active</h2>
          <div className="space-y-1">
            {activeProjects.map((p) => (
              <div key={p.id} className="border border-zinc-800 rounded-xl px-5 py-4">
                {editingId === p.id ? (
                  <ProjectForm project={p} onDone={() => setEditingId(null)} />
                ) : (
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <span className="w-3 h-3 rounded-full shrink-0" style={{ backgroundColor: p.color }} />
                      <div>
                        <p className="text-sm font-medium text-white">{p.name}</p>
                        {p.description && <p className="text-xs text-zinc-500 mt-0.5">{p.description}</p>}
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      <button
                        onClick={() => setEditingId(p.id)}
                        className="text-xs text-zinc-500 hover:text-white transition-colors"
                      >
                        Edit
                      </button>
                      <button
                        onClick={() => handleArchive(p.id)}
                        disabled={loadingId === p.id}
                        className="text-xs text-zinc-500 hover:text-zinc-300 transition-colors disabled:opacity-40"
                      >
                        {loadingId === p.id ? "…" : "Archive"}
                      </button>
                    </div>
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {archiveError && <p className="text-xs text-red-400">{archiveError}</p>}

      {/* Archived projects toggle */}
      {archivedProjects.length > 0 && (
        <div>
          <button
            onClick={() => setShowArchived((v) => !v)}
            className="text-xs text-zinc-500 hover:text-zinc-300 transition-colors"
          >
            {showArchived ? "Hide" : "Show"} archived ({archivedProjects.length})
          </button>
          {showArchived && (
            <div className="mt-3 space-y-1">
              {archivedProjects.map((p) => (
                <div key={p.id} className="border border-zinc-800/50 rounded-xl px-5 py-4 opacity-60">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <span className="w-3 h-3 rounded-full shrink-0" style={{ backgroundColor: p.color }} />
                      <p className="text-sm text-zinc-400">{p.name}</p>
                    </div>
                    <div className="flex items-center gap-2">
                      <button
                        onClick={() => handleUnarchive(p.id)}
                        disabled={loadingId === p.id}
                        className="text-xs text-zinc-500 hover:text-zinc-300 transition-colors disabled:opacity-40"
                      >
                        {loadingId === p.id ? "…" : "Unarchive"}
                      </button>
                      <button
                        onClick={() => { setDeleteTarget(p); setDeleteAction(null); setDeleteError(null); }}
                        className="text-xs text-zinc-500 hover:text-red-400 transition-colors"
                      >
                        Delete
                      </button>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Delete confirmation dialog */}
      {deleteTarget && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm" onClick={() => setDeleteTarget(null)}>
          <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-6 w-full max-w-md mx-4 space-y-5" onClick={(e) => e.stopPropagation()}>
            <div>
              <h3 className="text-base font-semibold text-white">Delete &ldquo;{deleteTarget.name}&rdquo;?</h3>
              <p className="text-sm text-zinc-400 mt-1">This project has existing requests.</p>
            </div>
            <div className="space-y-3">
              <label className="flex items-start gap-3 cursor-pointer">
                <input
                  type="radio"
                  name="deleteAction"
                  checked={deleteAction === "move"}
                  onChange={() => setDeleteAction("move")}
                  className="mt-0.5"
                />
                <div className="flex-1">
                  <p className="text-sm text-white">Move requests to another project</p>
                  {deleteAction === "move" && (
                    <select
                      value={moveToId}
                      onChange={(e) => setMoveToId(e.target.value)}
                      className="mt-2 w-full bg-zinc-950 border border-zinc-800 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-zinc-600"
                    >
                      <option value="">Select project…</option>
                      {moveTargets.map((p) => (
                        <option key={p.id} value={p.id}>{p.name}</option>
                      ))}
                    </select>
                  )}
                </div>
              </label>
              <label className="flex items-center gap-3 cursor-pointer">
                <input
                  type="radio"
                  name="deleteAction"
                  checked={deleteAction === "delete"}
                  onChange={() => setDeleteAction("delete")}
                />
                <p className="text-sm text-white">Delete all requests too</p>
              </label>
            </div>
            {deleteError && <p className="text-xs text-red-400">{deleteError}</p>}
            <div className="flex gap-3">
              <button
                onClick={() => setDeleteTarget(null)}
                className="flex-1 text-sm text-zinc-400 hover:text-white border border-zinc-700 rounded-lg px-4 py-2 transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={handleDeleteConfirm}
                disabled={deleteLoading || !deleteAction || (deleteAction === "move" && !moveToId)}
                className="flex-1 text-sm text-white bg-red-600 hover:bg-red-500 rounded-lg px-4 py-2 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
              >
                {deleteLoading ? "Deleting…" : "Delete project"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
