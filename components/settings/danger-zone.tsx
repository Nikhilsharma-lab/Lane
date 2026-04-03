"use client";

import { useState, useTransition } from "react";
import { leaveOrg, deleteOrg } from "@/app/actions/settings";

interface Props { isAdmin: boolean; orgSlug: string; }

export function DangerZone({ isAdmin, orgSlug }: Props) {
  const [showLeaveConfirm, setShowLeaveConfirm] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [deleteInput, setDeleteInput] = useState("");
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  function handleLeave() {
    startTransition(async () => {
      const result = await leaveOrg();
      if (result?.error) { setError(result.error); setShowLeaveConfirm(false); }
    });
  }

  function handleDelete() {
    if (deleteInput !== orgSlug) return;
    startTransition(async () => {
      const result = await deleteOrg(deleteInput);
      if (result?.error) { setError(result.error); setShowDeleteConfirm(false); setDeleteInput(""); }
    });
  }

  return (
    <div className="space-y-8">
      {error && <p className="text-sm text-red-400 bg-red-950/30 border border-red-900/30 rounded-lg px-4 py-3">{error}</p>}
      <div className="border border-[var(--border)] rounded-xl px-6 py-5">
        <h3 className="text-sm font-medium text-[var(--text-primary)] mb-1">Leave workspace</h3>
        <p className="text-xs text-[var(--text-secondary)] mb-4">
          You&apos;ll lose access to all requests, designs, and team data.
          {isAdmin && " If you are the only admin, assign another admin first."}
        </p>
        {showLeaveConfirm ? (
          <div className="space-y-3">
            <p className="text-sm text-[var(--text-primary)]">Are you sure? This cannot be undone.</p>
            <div className="flex gap-2">
              <button onClick={handleLeave} disabled={isPending}
                className="text-sm bg-red-600 hover:bg-red-500 text-white rounded-lg px-4 py-2 transition-colors disabled:opacity-40">
                {isPending ? "Leaving…" : "Yes, leave"}
              </button>
              <button onClick={() => setShowLeaveConfirm(false)}
                className="text-sm text-[var(--text-secondary)] hover:text-[var(--text-primary)] border border-[var(--border)] rounded-lg px-4 py-2 transition-colors">
                Cancel
              </button>
            </div>
          </div>
        ) : (
          <button onClick={() => { setError(null); setShowLeaveConfirm(true); }}
            className="text-sm text-red-400 hover:text-red-300 border border-red-900/40 hover:border-red-700/50 rounded-lg px-4 py-2 transition-colors">
            Leave workspace
          </button>
        )}
      </div>
      {isAdmin && (
        <div className="border border-red-900/30 rounded-xl px-6 py-5">
          <h3 className="text-sm font-medium text-red-400 mb-1">Delete workspace</h3>
          <p className="text-xs text-[var(--text-secondary)] mb-4">Permanently deletes the org, all members, all requests, and all data. This cannot be undone.</p>
          {showDeleteConfirm ? (
            <div className="space-y-3">
              <p className="text-sm text-[var(--text-primary)]">Type <span className="font-mono text-[var(--text-primary)] bg-[var(--bg-hover)] px-1.5 py-0.5 rounded">{orgSlug}</span> to confirm.</p>
              <input type="text" value={deleteInput} onChange={(e) => setDeleteInput(e.target.value)} placeholder={orgSlug}
                className="w-full bg-[var(--bg-subtle)] border border-[var(--border)] rounded-lg px-3 py-2 text-sm text-[var(--text-primary)] font-mono placeholder-[var(--text-tertiary)] focus:outline-none focus:border-red-700 transition-colors" />
              <div className="flex gap-2">
                <button onClick={handleDelete} disabled={deleteInput !== orgSlug || isPending}
                  className="text-sm bg-red-600 hover:bg-red-500 text-white rounded-lg px-4 py-2 transition-colors disabled:opacity-40 disabled:cursor-not-allowed">
                  {isPending ? "Deleting…" : "Delete workspace"}
                </button>
                <button onClick={() => { setShowDeleteConfirm(false); setDeleteInput(""); }}
                  className="text-sm text-[var(--text-secondary)] hover:text-[var(--text-primary)] border border-[var(--border)] rounded-lg px-4 py-2 transition-colors">
                  Cancel
                </button>
              </div>
            </div>
          ) : (
            <button onClick={() => { setError(null); setShowDeleteConfirm(true); }}
              className="text-sm text-red-400 hover:text-red-300 border border-red-900/40 hover:border-red-700/50 rounded-lg px-4 py-2 transition-colors">
              Delete workspace
            </button>
          )}
        </div>
      )}
    </div>
  );
}
