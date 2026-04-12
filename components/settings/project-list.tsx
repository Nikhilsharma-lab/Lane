"use client";

import { useState } from "react";
import { archiveProject, unarchiveProject, deleteProject } from "@/app/actions/projects";
import { ProjectForm } from "./project-form";
import type { Project } from "@/db/schema";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Label } from "@/components/ui/label";
import { NativeSelect } from "@/components/ui/native-select";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";

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
    <div className="space-y-6">
      {/* Create new project */}
      <Card>
        <CardContent>
          {showCreateForm ? (
            <ProjectForm onDone={() => setShowCreateForm(false)} />
          ) : (
            <Button
              variant="ghost"
              onClick={() => setShowCreateForm(true)}
              className="text-muted-foreground hover:text-foreground"
            >
              <span className="text-lg leading-none mr-1">+</span> New project
            </Button>
          )}
        </CardContent>
      </Card>

      {/* Active projects */}
      {activeProjects.length > 0 && (
        <div>
          <h2 className="text-xs font-medium text-muted-foreground uppercase tracking-wide mb-3">Active</h2>
          <div className="space-y-1">
            {activeProjects.map((p) => (
              <Card key={p.id}>
                <CardContent>
                  {editingId === p.id ? (
                    <ProjectForm project={p} onDone={() => setEditingId(null)} />
                  ) : (
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-3">
                        {/* Project color dot is intentionally inline since it's a dynamic DB value */}
                        <span className="w-3 h-3 rounded-full shrink-0" style={{ backgroundColor: p.color }} />
                        <div>
                          <p className="text-sm font-medium text-foreground">{p.name}</p>
                          {p.description && <p className="text-xs text-muted-foreground mt-0.5">{p.description}</p>}
                        </div>
                      </div>
                      <div className="flex items-center gap-2">
                        <Button variant="ghost" size="xs" onClick={() => setEditingId(p.id)}>
                          Edit
                        </Button>
                        <Button
                          variant="ghost"
                          size="xs"
                          onClick={() => handleArchive(p.id)}
                          disabled={loadingId === p.id}
                        >
                          {loadingId === p.id ? "..." : "Archive"}
                        </Button>
                      </div>
                    </div>
                  )}
                </CardContent>
              </Card>
            ))}
          </div>
        </div>
      )}

      {archiveError && (
        <Alert variant="destructive">
          <AlertDescription>{archiveError}</AlertDescription>
        </Alert>
      )}

      {/* Archived projects toggle */}
      {archivedProjects.length > 0 && (
        <div>
          <Button
            variant="ghost"
            size="xs"
            className="text-muted-foreground"
            onClick={() => setShowArchived((v) => !v)}
          >
            {showArchived ? "Hide" : "Show"} archived ({archivedProjects.length})
          </Button>
          {showArchived && (
            <div className="mt-3 space-y-1">
              {archivedProjects.map((p) => (
                <Card key={p.id} className="opacity-60">
                  <CardContent>
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-3">
                        <span className="w-3 h-3 rounded-full shrink-0" style={{ backgroundColor: p.color }} />
                        <p className="text-sm text-muted-foreground">{p.name}</p>
                      </div>
                      <div className="flex items-center gap-2">
                        <Button
                          variant="ghost"
                          size="xs"
                          onClick={() => handleUnarchive(p.id)}
                          disabled={loadingId === p.id}
                        >
                          {loadingId === p.id ? "..." : "Unarchive"}
                        </Button>
                        <Button
                          variant="ghost"
                          size="xs"
                          className="hover:text-destructive"
                          onClick={() => { setDeleteTarget(p); setDeleteAction(null); setDeleteError(null); }}
                        >
                          Delete
                        </Button>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Delete confirmation dialog */}
      <Dialog open={deleteTarget !== null} onOpenChange={(open) => { if (!open) setDeleteTarget(null); }}>
        <DialogContent>
          {deleteTarget && (
            <>
              <DialogHeader>
                <DialogTitle>Delete &ldquo;{deleteTarget.name}&rdquo;?</DialogTitle>
                <DialogDescription>This project has existing requests.</DialogDescription>
              </DialogHeader>
              <div className="space-y-3">
                <Label className="flex items-start gap-3 cursor-pointer">
                  <input
                    type="radio"
                    name="deleteAction"
                    checked={deleteAction === "move"}
                    onChange={() => setDeleteAction("move")}
                    className="mt-0.5"
                  />
                  <div className="flex-1">
                    <p className="text-sm text-foreground">Move requests to another project</p>
                    {deleteAction === "move" && (
                      <NativeSelect
                        value={moveToId}
                        onChange={(e) => setMoveToId(e.target.value)}
                        className="mt-2 w-full"
                      >
                        <option value="">Select project...</option>
                        {moveTargets.map((p) => (
                          <option key={p.id} value={p.id}>{p.name}</option>
                        ))}
                      </NativeSelect>
                    )}
                  </div>
                </Label>
                <Label className="flex items-center gap-3 cursor-pointer">
                  <input
                    type="radio"
                    name="deleteAction"
                    checked={deleteAction === "delete"}
                    onChange={() => setDeleteAction("delete")}
                  />
                  <p className="text-sm text-foreground">Delete all requests too</p>
                </Label>
              </div>
              {deleteError && (
                <Alert variant="destructive">
                  <AlertDescription>{deleteError}</AlertDescription>
                </Alert>
              )}
              <DialogFooter>
                <Button variant="outline" onClick={() => setDeleteTarget(null)}>
                  Cancel
                </Button>
                <Button
                  variant="destructive"
                  onClick={handleDeleteConfirm}
                  disabled={deleteLoading || !deleteAction || (deleteAction === "move" && !moveToId)}
                >
                  {deleteLoading ? "Deleting..." : "Delete project"}
                </Button>
              </DialogFooter>
            </>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
